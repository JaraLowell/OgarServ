pub mod cell;
pub mod quad;

use crate::bots::{self, BotIntent, BotSnapshot, SeenNode};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LeaderboardKind {
    /// Opcode 0x31 — name list
    Ffa,
    /// Opcode 0x32 — team pie fractions
    Team,
}
use crate::config::AppConfig;
use crate::modes::GameMode;
use crate::player::{self, Player, PlayerStats};
use crate::protocol::{self, Color};
use crate::scores::{ScoreEntry, ScoreStore};
use cell::{Cell, CellType, NodeId, PlayerId, Vec2};
use chrono::Utc;
use quad::{Bound, QuadTree};
use rand::Rng;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, SyncSender, TrySendError};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration, MissedTickBehavior};
use tracing::{debug, info, warn};

pub struct Border {
    pub minx: f64,
    pub miny: f64,
    pub maxx: f64,
    pub maxy: f64,
    pub width: f64,
    pub height: f64,
}

pub struct GameServer {
    pub config: AppConfig,
    pub border: Border,
    pub cells: HashMap<NodeId, Cell>,
    pub players: HashMap<PlayerId, Player>,
    pub quad: QuadTree,
    pub mode: Box<dyn GameMode>,
    pub scores: ScoreStore,
    pub tick: u64,
    pub running: bool,
    pub last_node_id: NodeId,
    pub last_player_id: PlayerId,
    pub current_food: u32,
    pub virus_count: u32,
    pub surprise_count: u32,
    pub mother_ids: Vec<NodeId>,
    pub beacon_id: Option<NodeId>,
    pub leaderboard: Vec<PlayerId>,
    pub leaderboard_kind: LeaderboardKind,
    /// Team mass fractions (0..1) when leaderboard_kind is Team
    pub team_scores: Vec<f32>,
    pub moving_nodes: Vec<NodeId>,
    pub paused: bool,
    pub started: std::time::Instant,
    /// Unix ms when the process started (master tracker `starttime`)
    pub start_unix_ms: u64,
    /// Next allowed master-tracker ping (unix ms)
    pub tracker_next_ms: u64,
    pub update_time_avg: f64,
    /// players / humans / spectate / bots (humans = alive with cells)
    pub sinfo_players: u32,
    pub sinfo_humans: u32,
    pub sinfo_spectate: u32,
    pub sinfo_bots: u32,
    query_buf: Vec<NodeId>,
    bot_names: Vec<String>,
    bot_name_index: usize,
    /// Optional AI channels (set by run_tick_loop when bots enabled)
    bot_snap_tx: Option<SyncSender<Vec<BotSnapshot>>>,
    bot_intent_rx: Option<Receiver<Vec<BotIntent>>>,
}

impl GameServer {
    pub fn new(config: AppConfig, scores: ScoreStore, mode: Box<dyn GameMode>) -> Self {
        let w = config.world.border_width;
        let h = config.world.border_height;
        let border = Border {
            minx: -w / 2.0,
            miny: -h / 2.0,
            maxx: w / 2.0,
            maxy: h / 2.0,
            width: w,
            height: h,
        };
        let qbound = Bound {
            minx: border.minx,
            miny: border.miny,
            maxx: border.maxx,
            maxy: border.maxy,
        };
        let bot_names = load_bot_names(&config);
        let mut gs = Self {
            config,
            border,
            cells: HashMap::new(),
            players: HashMap::new(),
            quad: QuadTree::new(qbound, 64, 32),
            mode,
            scores,
            tick: 0,
            running: true,
            last_node_id: 1,
            last_player_id: 1,
            current_food: 0,
            virus_count: 0,
            surprise_count: 0,
            mother_ids: Vec::new(),
            beacon_id: None,
            leaderboard: Vec::new(),
            leaderboard_kind: LeaderboardKind::Ffa,
            team_scores: Vec::new(),
            moving_nodes: Vec::new(),
            paused: false,
            started: std::time::Instant::now(),
            start_unix_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            tracker_next_ms: 0,
            update_time_avg: 0.0,
            sinfo_players: 0,
            sinfo_humans: 0,
            sinfo_spectate: 0,
            sinfo_bots: 0,
            query_buf: Vec::new(),
            bot_names,
            bot_name_index: 0,
            bot_snap_tx: None,
            bot_intent_rx: None,
        };
        gs.with_mode(|mode, gs| mode.on_server_init(gs));
        gs
    }

    pub fn attach_bot_ai(&mut self) {
        if self.config.bots.count < 0 {
            return;
        }
        let (snap_tx, snap_rx) = mpsc::sync_channel::<Vec<BotSnapshot>>(1);
        let (intent_tx, intent_rx) = mpsc::sync_channel::<Vec<BotIntent>>(1);
        std::thread::Builder::new()
            .name("ogar-bot-ai".into())
            .spawn(move || bots::run_ai_worker(snap_rx, intent_tx))
            .expect("spawn bot AI thread");
        self.bot_snap_tx = Some(snap_tx);
        self.bot_intent_rx = Some(intent_rx);
        info!(
            count = self.config.bots.count,
            names = self.bot_names.len(),
            "bot AI thread started"
        );
    }

    pub(crate) fn with_mode<R>(
        &mut self,
        f: impl FnOnce(&mut Box<dyn GameMode>, &mut GameServer) -> R,
    ) -> R {
        let mut mode = std::mem::replace(&mut self.mode, Box::new(crate::modes::PlaceholderMode));
        let result = f(&mut mode, self);
        self.mode = mode;
        result
    }

    pub fn next_node_id(&mut self) -> NodeId {
        let id = self.last_node_id;
        self.last_node_id = self.last_node_id.wrapping_add(1).max(1);
        id
    }

    pub fn next_player_id(&mut self) -> PlayerId {
        let id = self.last_player_id;
        self.last_player_id = self.last_player_id.wrapping_add(1).max(1);
        id
    }

    /// Same as MultiOgar `getRandomColor` (pastel + channel shuffle).
    pub fn random_color(&self) -> Color {
        let mut rng = rand::rng();
        let mut rgb = [
            rng.random::<u8>() as u16,
            rng.random::<u8>() as u16,
            rng.random::<u8>() as u16,
        ];
        // Fisher-Yates-ish shuffle like JS sort(() => 0.5 - Math.random())
        for i in (1..3).rev() {
            let j = rng.random_range(0..=i);
            rgb.swap(i, j);
        }
        // JS returns { r: c0, b: c1, g: c2 } — note g/b assignment order
        Color {
            r: ((rgb[0] + 180) / 2) as u8,
            b: ((rgb[1] + 180) / 2) as u8,
            g: ((rgb[2] + 180) / 2) as u8,
        }
    }

    /// Same as MultiOgar `getGrayColor` (luminance).
    pub fn gray_color(&self, c: Color) -> Color {
        let lum = ((c.r as f64 * 0.2125 + c.g as f64 * 0.7154 + c.b as f64 * 0.0721)
            .min(255.0)) as u8;
        Color {
            r: lum,
            g: lum,
            b: lum,
        }
    }

    pub fn set_player_color(&mut self, pid: PlayerId, color: Color) {
        if let Some(p) = self.players.get_mut(&pid) {
            p.color = color;
            let cells = p.cells.clone();
            for cid in cells {
                if let Some(c) = self.cells.get_mut(&cid) {
                    c.color = color;
                }
            }
        }
    }

    pub fn random_position(&self) -> Vec2 {
        let mut rng = rand::rng();
        Vec2::new(
            self.border.minx + rng.random::<f64>() * self.border.width,
            self.border.miny + rng.random::<f64>() * self.border.height,
        )
    }

    pub fn rebuild_quad(&mut self) {
        self.quad.clear();
        for cell in self.cells.values() {
            if cell.is_removed {
                continue;
            }
            self.quad.insert(
                cell.node_id,
                Bound::from_circle(cell.position, cell.size),
            );
        }
    }

    pub fn add_cell(&mut self, mut cell: Cell) {
        let id = cell.node_id;
        // Virus.onAdd → spawnSpiral (Halloween / virusSpirals)
        let do_spiral = cell.cell_type == CellType::Virus
            && !cell.is_mother
            && self.config.virus.spirals;
        let spiral_pos = cell.position;
        let spiral_color = cell.color;

        match cell.cell_type {
            CellType::Food => self.current_food += 1,
            CellType::Virus => self.virus_count += 1,
            CellType::Surprise => self.surprise_count += 1,
            _ => {}
        }
        if cell.is_mother {
            self.mother_ids.push(id);
        }
        if cell.cell_type == CellType::Beacon {
            self.beacon_id = Some(id);
        }
        if let Some(oid) = cell.owner {
            if let Some(p) = self.players.get_mut(&oid) {
                p.cells.push(id);
                cell.color = p.color;
                p.send(protocol::add_node(id ^ p.scramble_id));
            }
        }
        if cell.is_moving {
            self.moving_nodes.push(id);
        }
        self.cells.insert(id, cell);

        if do_spiral {
            self.spawn_spiral(spiral_pos, spiral_color);
        }
    }

    /// MultiOgar `GameServer.spawnSpiral` — two arms of boosted eject mass.
    pub fn spawn_spiral(&mut self, position: Vec2, color: Color) {
        let mut rng = rand::rng();
        let r = 140.0;
        let rnd = rng.random::<f64>() * std::f64::consts::PI;
        let dark = Color {
            r: color.r / 25,
            g: color.g / 25,
            b: color.b / 25,
        };
        for (angle0, arm_color) in [(rnd, dark), (rnd + std::f64::consts::PI, color)] {
            let mut angle = angle0;
            let mut dist = 0.0_f64;
            for _ in 0..16 {
                angle += 0.375;
                dist += 9.0;
                let pos = Vec2::new(
                    (position.x + r * angle.sin()).ceil(),
                    (position.y + r * angle.cos()).ceil(),
                );
                let size = (dist / 5.0).round() + 1.0;
                let id = self.next_node_id();
                let mut ejected =
                    Cell::new(id, CellType::Ejected, None, pos, size, self.tick);
                ejected.color = arm_color;
                ejected.set_boost(dist, angle, 78.0);
                self.add_cell(ejected);
            }
        }
    }

    pub fn remove_cell(&mut self, id: NodeId) {
        let Some(mut cell) = self.cells.remove(&id) else {
            return;
        };
        cell.is_removed = true;
        match cell.cell_type {
            CellType::Food => {
                self.current_food = self.current_food.saturating_sub(1);
            }
            CellType::Virus => {
                self.virus_count = self.virus_count.saturating_sub(1);
            }
            CellType::Surprise => {
                self.surprise_count = self.surprise_count.saturating_sub(1);
            }
            _ => {}
        }
        if cell.is_mother {
            self.mother_ids.retain(|&x| x != id);
        }
        if self.beacon_id == Some(id) {
            self.beacon_id = None;
        }
        if let Some(oid) = cell.owner {
            if let Some(p) = self.players.get_mut(&oid) {
                p.cells.retain(|&c| c != id);
            }
        }
        self.moving_nodes.retain(|&x| x != id);
        // Keep a tombstone briefly for eat animations in client delta
        self.cells.insert(
            id,
            Cell {
                is_removed: true,
                ..cell
            },
        );
    }

    pub fn purge_removed(&mut self) {
        self.cells.retain(|_, c| !c.is_removed);
    }

    pub fn will_collide_player(&mut self, pos: Vec2, size: f64) -> bool {
        self.query_buf.clear();
        self.quad
            .find(Bound::from_circle(pos, size), &mut self.query_buf);
        let ids = self.query_buf.clone();
        for id in ids {
            if let Some(c) = self.cells.get(&id) {
                if c.is_removed || c.cell_type != CellType::Player {
                    continue;
                }
                let r = c.size + size;
                if c.position.dist_sq(pos) <= r * r {
                    return true;
                }
            }
        }
        false
    }

    pub fn spawn_food_amount(&mut self, amount: u32) {
        let mut rng = rand::rng();
        for _ in 0..amount {
            if self.current_food >= self.config.food.max_amount {
                break;
            }
            let size = self.config.food.min_size
                + rng.random::<f64>() * (self.config.food.max_size - self.config.food.min_size);
            let pos = self.random_position();
            let id = self.next_node_id();
            let mut cell = Cell::new(id, CellType::Food, None, pos, size, self.tick);
            if self.config.virus.push_on_eat {
                // Halloween orange food tint
                let jitter = rng.random_range(-20i16..21) as i16;
                cell.color = Color {
                    r: (self.config.virus.color_r as i16 + jitter).clamp(0, 255) as u8,
                    g: (self.config.virus.color_g as i16 + jitter).clamp(0, 255) as u8,
                    b: 0,
                };
            } else {
                cell.color = self.random_color();
            }
            self.add_cell(cell);
        }
    }

    pub fn spawn_virus_amount(&mut self, amount: u32) {
        let mut rng = rand::rng();
        for _ in 0..amount {
            if self.virus_count >= self.config.virus.max_amount {
                break;
            }
            let pos = self.random_position();
            let size = self.config.virus.min_size;
            if self.will_collide_player(pos, size) {
                continue;
            }
            let id = self.next_node_id();
            let moving = self.config.virus.moving && rng.random::<f64>() < 0.25;
            let mut cell = Cell::new(id, CellType::Virus, None, pos, size, self.tick);
            let jitter = rng.random_range(-10i16..11) as i16;
            cell.color = Color {
                r: (self.config.virus.color_r as i16 + jitter).clamp(0, 255) as u8,
                g: (self.config.virus.color_g as i16 + jitter).clamp(0, 255) as u8,
                b: (self.config.virus.color_b as i16 + jitter).clamp(0, 255) as u8,
            };
            if moving {
                let angle = rng.random::<f64>() * std::f64::consts::TAU;
                let speed = 0.25 + rng.random::<f64>() * 3.0;
                cell.infinite_boost = true;
                cell.set_boost(1.0e12, angle, speed);
            }
            self.add_cell(cell);
        }
    }

    pub fn spawn_cells_periodic(&mut self) {
        let need_food = self
            .config
            .food
            .min_amount
            .saturating_sub(self.current_food);
        if need_food > 0 {
            self.spawn_food_amount(need_food.min(self.config.food.spawn_amount));
        }
        let need_virus = self
            .config
            .virus
            .min_amount
            .saturating_sub(self.virus_count);
        if need_virus > 0 {
            self.spawn_virus_amount(need_virus.min(2));
        }
        self.spawn_surprise_if_needed();
        self.auto_assign_minions();
    }

    pub fn spawn_surprise_if_needed(&mut self) {
        let want = self.config.surprise.amount;
        if want == 0 || self.surprise_count >= want {
            return;
        }
        let size = self.config.surprise.size;
        let pos = self.random_position();
        if self.will_collide_player(pos, size) {
            return;
        }
        let id = self.next_node_id();
        let mut cell = Cell::new(id, CellType::Surprise, None, pos, size, self.tick);
        cell.color = Color {
            r: 212,
            g: 36,
            b: 38,
        };
        cell.is_agitated = true;
        self.add_cell(cell);
    }

    pub fn spawn_player(&mut self, pid: PlayerId) {
        let is_mi = self.players.get(&pid).map(|p| p.is_mi).unwrap_or(false);
        let size = if is_mi {
            self.config.minions.start_size
        } else {
            self.config.player.start_size
        };
        let mut pos = self.random_position();
        for _ in 0..10 {
            if !self.will_collide_player(pos, size) {
                break;
            }
            pos = self.random_position();
        }
        let id = self.next_node_id();
        let cell = Cell::new(id, CellType::Player, Some(pid), pos, size, self.tick);
        self.add_cell(cell);
        if let Some(p) = self.players.get_mut(&pid) {
            p.mouse = pos;
            p.stats.playstart = Utc::now().timestamp_millis();
            p.spectate = false;
            p.spectate_target = None;
            p.free_roam = false;
            if !p.is_mi {
                p.minion_control = false;
            }
        }
    }

    pub fn join_game(&mut self, pid: PlayerId, name: String, skin: String) {
        let scramble_level = self.config.server.scramble_level;
        let bw = self.border.width;
        let bh = self.border.height;
        let border = (
            self.border.minx,
            self.border.miny,
            self.border.maxx,
            self.border.maxy,
        );
        let mode_id = self.mode.id() as u32;
        let server_name = format!("OgarServ {}", env!("CARGO_PKG_VERSION"));

        if let Some(p) = self.players.get_mut(&pid) {
            if !p.cells.is_empty() {
                return;
            }
            p.name = name;
            p.skin = skin;
            // Color is assigned in mode.on_player_spawn (same as JS FFA/Halloween)
            p.client_nodes.clear();
            p.scramble(scramble_level, bw, bh);
            if p.protocol < 6 {
                p.send(protocol::clear_owned());
            }
            p.send(protocol::clear_all());
            p.send(protocol::set_border(
                border.0 + p.scramble_x,
                border.1 + p.scramble_y,
                border.2 + p.scramble_x,
                border.3 + p.scramble_y,
                Some(mode_id),
                &server_name,
            ));
        }
        self.with_mode(|mode, gs| mode.on_player_spawn(gs, pid));
        let per = self.config.minions.per_player;
        if per > 0 && !self.players.get(&pid).map(|p| p.is_mi).unwrap_or(true) {
            if let Some(p) = self.players.get_mut(&pid) {
                if !p.minion_control {
                    p.minion_control = true;
                    p.collect_pellets = self.config.minions.collect_pellets;
                }
            }
            let name = self.config.minions.default_name.clone();
            for _ in 0..per {
                self.add_minion(pid, &name);
            }
        }
    }

    pub fn add_minion(&mut self, owner_id: PlayerId, name: &str) -> Option<PlayerId> {
        let owner = self.players.get(&owner_id)?;
        if owner.is_mi {
            return None;
        }
        let color = owner.color;
        let skin = owner.skin.clone();
        let center = owner.center;
        let team = owner.team;
        let mid = self.next_player_id();
        let mut minion = Player::new_minion(mid, owner_id, center);
        minion.color = color;
        minion.skin = skin;
        minion.team = team;
        minion.name = if name.is_empty() {
            self.config.minions.default_name.clone()
        } else {
            name.to_string()
        };
        minion.collect_pellets = self
            .players
            .get(&owner_id)
            .map(|p| p.collect_pellets)
            .unwrap_or(false);
        self.players.insert(mid, minion);
        // Keep owner color; only assign team (Teams mode). Don't FFA-randomize color.
        self.with_mode(|mode, gs| mode.on_player_init(gs, mid));
        if let Some(p) = self.players.get_mut(&owner_id) {
            p.minion_control = true;
        }
        self.spawn_player(mid);
        Some(mid)
    }

    pub fn remove_minions_for(&mut self, owner_id: PlayerId) {
        let minion_ids: Vec<PlayerId> = self
            .players
            .iter()
            .filter(|(_, p)| p.is_mi && p.owner_id == Some(owner_id))
            .map(|(id, _)| *id)
            .collect();
        for mid in minion_ids {
            self.remove_player_fully(mid);
        }
        if let Some(p) = self.players.get_mut(&owner_id) {
            p.minion_control = false;
        }
    }

    pub fn remove_player_fully(&mut self, pid: PlayerId) {
        let is_human = self
            .players
            .get(&pid)
            .map(|p| !p.is_mi && !p.is_bot)
            .unwrap_or(false);
        let cells = self
            .players
            .get(&pid)
            .map(|p| p.cells.clone())
            .unwrap_or_default();
        for cid in cells {
            self.remove_cell(cid);
        }
        if is_human {
            self.remove_minions_for(pid);
        }
        self.players.remove(&pid);
    }

    fn next_bot_display_name(&mut self) -> String {
        self.bot_name_index += 1;
        let n = self.bot_name_index;
        let picked = if self.bot_names.is_empty() {
            format!("Bot{n}")
        } else {
            let i = (n - 1) % self.bot_names.len();
            self.bot_names[i].clone()
        };
        self.config
            .bots
            .name
            .replace("{n}", &n.to_string())
            .replace("{name}", &picked)
    }

    pub fn bot_count(&self) -> usize {
        self.players.values().filter(|p| p.is_bot && !p.is_removed).count()
    }

    pub fn add_bot(&mut self) -> Option<PlayerId> {
        let id = self.next_player_id();
        let center = self.random_position();
        let mut bot = Player::new_bot(id, center);
        let name = self.next_bot_display_name();
        bot.name = name;
        bot.color = self.random_color();
        self.players.insert(id, bot);
        self.with_mode(|mode, gs| mode.on_player_init(gs, id));
        self.with_mode(|mode, gs| mode.on_player_spawn(gs, id));
        info!(player = id, "bot spawned");
        Some(id)
    }

    pub fn player_team(&self, pid: PlayerId) -> i32 {
        self.players.get(&pid).map(|p| p.team).unwrap_or(0)
    }

    pub fn same_team(&self, a: PlayerId, b: PlayerId) -> bool {
        self.config.mode.have_teams && self.player_team(a) == self.player_team(b)
    }

    pub fn maintain_bots(&mut self) {
        let want = self.config.bots.count;
        if want < 0 {
            return;
        }
        let want = want as usize;
        // Node: only add/respawn while humans < serverBots && bots < serverBots.
        // Existing bots stay when the lobby fills with humans; no respawn until
        // humans drop below the config count again.
        let humans = self.sinfo_humans as usize;

        let mut bots: Vec<PlayerId> = self
            .players
            .iter()
            .filter(|(_, p)| p.is_bot && !p.is_removed)
            .map(|(id, _)| *id)
            .collect();

        // Config lowered — trim extras
        while bots.len() > want {
            if let Some(id) = bots.pop() {
                self.remove_player_fully(id);
            }
        }

        if humans < want {
            // Respawn dead bots first, then fill up to `want`
            let dead: Vec<PlayerId> = self
                .players
                .iter()
                .filter(|(_, p)| p.is_bot && !p.is_removed && p.cells.is_empty())
                .map(|(id, _)| *id)
                .collect();
            for id in dead {
                self.with_mode(|mode, gs| mode.on_player_spawn(gs, id));
            }

            bots = self
                .players
                .iter()
                .filter(|(_, p)| p.is_bot && !p.is_removed)
                .map(|(id, _)| *id)
                .collect();
            while bots.len() < want {
                if let Some(id) = self.add_bot() {
                    bots.push(id);
                } else {
                    break;
                }
            }
        }

        // Idle when no humans: shrink oversized bots (JS behavior)
        if self.config.bots.idle_when_empty && self.sinfo_humans == 0 {
            let shrink: Vec<(PlayerId, Vec<NodeId>)> = self
                .players
                .iter()
                .filter(|(_, p)| p.is_bot && p.cells.len() > 1)
                .map(|(id, p)| (*id, p.cells.clone()))
                .collect();
            for (_pid, cells) in shrink {
                for &cid in cells.iter().skip(1) {
                    self.remove_cell(cid);
                }
            }
            let big: Vec<NodeId> = self
                .players
                .values()
                .filter(|p| p.is_bot)
                .flat_map(|p| p.cells.iter().copied())
                .filter(|&cid| {
                    self.cells
                        .get(&cid)
                        .map(|c| c.size > 70.0)
                        .unwrap_or(false)
                })
                .collect();
            for cid in big {
                if let Some(c) = self.cells.get_mut(&cid) {
                    c.set_size(63.0);
                }
            }
        }
    }

    pub fn apply_bot_intents(&mut self, intents: &[BotIntent]) {
        for intent in intents {
            if let Some(p) = self.players.get_mut(&intent.pid) {
                if !p.is_bot {
                    continue;
                }
                p.mouse = intent.mouse;
                p.bot_wander = intent.wander;
                p.bot_split_cd = intent.split_cd;
                if intent.split {
                    p.press_space = true;
                }
            }
        }
    }

    pub fn build_bot_snapshots(&mut self) -> Vec<BotSnapshot> {
        // Bots stay passive on an empty server only when idling is enabled
        let humans_online = self.sinfo_humans > 0 || !self.config.bots.idle_when_empty;
        let max_cells = self.config.player.max_cells as usize;
        let interval = self.config.bots.think_interval.max(1) as u64;
        if self.tick % interval != 0 {
            return Vec::new();
        }

        let bot_ids: Vec<PlayerId> = self
            .players
            .iter()
            .filter(|(_, p)| p.is_bot && !p.is_removed && !p.cells.is_empty())
            .map(|(id, _)| *id)
            .collect();

        let mut out = Vec::with_capacity(bot_ids.len());
        for pid in bot_ids {
            let (cell_id, split_cd, wander, view) = {
                let p = match self.players.get(&pid) {
                    Some(p) => p,
                    None => continue,
                };
                let largest = p
                    .cells
                    .iter()
                    .filter_map(|cid| self.cells.get(cid))
                    .filter(|c| !c.is_removed)
                    .max_by(|a, b| a.size.partial_cmp(&b.size).unwrap_or(std::cmp::Ordering::Equal));
                let Some(cell) = largest else {
                    continue;
                };
                (
                    cell.node_id,
                    p.bot_split_cd,
                    p.bot_wander,
                    p.view_box,
                )
            };
            let (cx, cy, csize, cell_count) = {
                let cell = match self.cells.get(&cell_id) {
                    Some(c) => c,
                    None => continue,
                };
                let count = self
                    .players
                    .get(&pid)
                    .map(|p| p.cells.len())
                    .unwrap_or(0);
                (cell.position.x, cell.position.y, cell.size, count)
            };

            self.query_buf.clear();
            // Slightly larger than view so flee/chase works at edges
            let pad = csize * 2.0 + 200.0;
            let area = Bound {
                minx: view.minx - pad,
                miny: view.miny - pad,
                maxx: view.maxx + pad,
                maxy: view.maxy + pad,
            };
            self.quad.find(area, &mut self.query_buf);
            let nearby_ids = self.query_buf.clone();
            let mut nearby = Vec::with_capacity(nearby_ids.len());
            for oid in nearby_ids {
                if let Some(c) = self.cells.get(&oid) {
                    if c.is_removed {
                        continue;
                    }
                    let team = c
                        .owner
                        .and_then(|oid| self.players.get(&oid).map(|p| p.team))
                        .unwrap_or(0);
                    nearby.push(SeenNode {
                        id: c.node_id,
                        cell_type: c.cell_type,
                        x: c.position.x,
                        y: c.position.y,
                        size: c.size,
                        owner: c.owner,
                        team,
                        is_mother: c.is_mother,
                    });
                }
            }

            let (team, have_teams) = (
                self.players.get(&pid).map(|p| p.team).unwrap_or(0),
                self.config.mode.have_teams,
            );
            out.push(BotSnapshot {
                pid,
                cell_x: cx,
                cell_y: cy,
                cell_size: csize,
                cell_count,
                max_cells,
                split_cd,
                wander,
                nearby,
                humans_online,
                have_teams,
                team,
            });
        }
        out
    }

    pub fn pump_bot_ai(&mut self) {
        if self.config.bots.count < 0 {
            return;
        }
        if let Some(rx) = self.bot_intent_rx.as_ref() {
            if let Some(intents) = bots::try_recv_intents(rx) {
                self.apply_bot_intents(&intents);
            }
        }
        self.maintain_bots();
        let snaps = self.build_bot_snapshots();
        if snaps.is_empty() {
            return;
        }
        if let Some(tx) = self.bot_snap_tx.as_ref() {
            match tx.try_send(snaps) {
                Ok(()) => {}
                Err(TrySendError::Full(_)) => {
                    // AI still busy — skip this think; keep previous intents
                }
                Err(TrySendError::Disconnected(_)) => {
                    warn!("bot AI thread disconnected");
                }
            }
        }
    }

    pub fn auto_assign_minions(&mut self) {
        let per = self.config.minions.per_player;
        if per == 0 {
            return;
        }
        let candidates: Vec<PlayerId> = self
            .players
            .iter()
            .filter(|(_, p)| {
                !p.is_mi
                    && !p.is_bot
                    && !p.minion_control
                    && !p.cells.is_empty()
                    && p.tx.is_some()
            })
            .map(|(id, _)| *id)
            .collect();
        for pid in candidates.into_iter().take(1) {
            if let Some(p) = self.players.get_mut(&pid) {
                p.minion_control = true;
                p.collect_pellets = self.config.minions.collect_pellets;
            }
            let name = self.config.minions.default_name.clone();
            for _ in 0..per {
                self.add_minion(pid, &name);
            }
        }
    }

    pub fn tick_minion(&mut self, mid: PlayerId) {
        let owner_id = match self.players.get(&mid).and_then(|p| p.owner_id) {
            Some(o) => o,
            None => {
                self.remove_player_fully(mid);
                return;
            }
        };
        let owner_ok = self
            .players
            .get(&owner_id)
            .map(|o| o.minion_control && !o.cells.is_empty() && o.tx.is_some() && !o.is_removed)
            .unwrap_or(false);
        if !owner_ok {
            self.remove_player_fully(mid);
            return;
        }

        let (mouse, frozen, split, eject, collect) = {
            let o = self.players.get(&owner_id).unwrap();
            (
                o.mouse,
                o.minion_frozen,
                o.minion_split,
                o.minion_eject,
                o.collect_pellets,
            )
        };
        if let Some(m) = self.players.get_mut(&mid) {
            m.frozen = frozen;
            m.collect_pellets = collect;
            m.mouse = mouse;
            if split {
                m.press_space = true;
            }
            if eject {
                m.press_w = true;
            }
        }
        if let Some(o) = self.players.get_mut(&owner_id) {
            o.minion_split = false;
            o.minion_eject = false;
        }

        if self
            .players
            .get(&mid)
            .map(|m| m.cells.is_empty())
            .unwrap_or(true)
        {
            self.spawn_player(mid);
        }

        if collect {
            let origin = {
                let m = match self.players.get(&mid) {
                    Some(m) => m,
                    None => return,
                };
                m.cells
                    .first()
                    .and_then(|id| self.cells.get(id).map(|c| c.position))
                    .unwrap_or(m.center)
            };
            let mut best = None;
            let mut best_d = 80_000.0_f64;
            for c in self.cells.values() {
                if c.is_removed || c.cell_type != CellType::Food {
                    continue;
                }
                let d = origin.dist_sq(c.position);
                if d < best_d {
                    best_d = d;
                    best = Some(c.position);
                }
            }
            if let Some(pos) = best {
                if let Some(m) = self.players.get_mut(&mid) {
                    m.mouse = pos;
                }
            }
        }
    }

    pub fn check_border(&self, cell: &mut Cell) {
        let half = cell.size / 2.0;
        cell.position.x = cell
            .position
            .x
            .clamp(self.border.minx + half, self.border.maxx - half);
        cell.position.y = cell
            .position
            .y
            .clamp(self.border.miny + half, self.border.maxy - half);
    }

    fn move_boost(cell: &mut Cell) {
        if !cell.is_moving {
            return;
        }
        let speed = if cell.infinite_boost {
            cell.boost_max_speed
        } else {
            let s = (cell.boost_distance * cell.boost_distance / 100.0)
                .sqrt()
                .min(cell.boost_max_speed)
                .min(cell.boost_distance);
            cell.boost_distance -= s;
            if cell.boost_distance <= 0.0 {
                cell.is_moving = false;
                cell.boost_distance = 0.0;
            }
            s
        };
        cell.position.x += cell.boost_dir.x * speed;
        cell.position.y += cell.boost_dir.y * speed;
    }

    fn move_user(cell: &mut Cell, mouse: Vec2, player_speed: f64, recombine_time: f64, tick: u64) {
        let dx = mouse.x - cell.position.x;
        let dy = mouse.y - cell.position.y;
        let dist = (dx * dx + dy * dy).sqrt();
        if dist < 1.0 {
            // still update remerge
        } else {
            let mut speed = cell.get_speed(player_speed).min(dist);
            if cell.can_remerge {
                speed *= 1.25;
            }
            cell.position.x += dx / dist * speed;
            cell.position.y += dy / dist * speed;
        }

        let age = cell.age(tick);
        if recombine_time <= 0.0 {
            cell.can_remerge = cell.boost_distance < 100.0;
        } else {
            let ttr = recombine_time.max((cell.size * 0.2) as f64) * 25.0;
            cell.can_remerge = age as f64 >= ttr;
        }
        // rigid collision age gate uses age >= 15
        let _ = age;
    }

    pub fn update_move_engine(&mut self) {
        let player_speed = self.config.player.speed;
        let recombine = self.config.player.recombine_time;
        let tick = self.tick;

        // Move boosted / moving nodes
        let moving = self.moving_nodes.clone();
        for id in moving {
            if let Some(cell) = self.cells.get_mut(&id) {
                if cell.is_removed {
                    continue;
                }
                Self::move_boost(cell);
                self.check_border_id(id);
            }
        }
        self.moving_nodes
            .retain(|&id| self.cells.get(&id).map(|c| c.is_moving).unwrap_or(false));

        // Move player cells
        let player_cells: Vec<(PlayerId, NodeId, Vec2, bool)> = self
            .players
            .iter()
            .flat_map(|(pid, p)| {
                p.cells
                    .iter()
                    .map(move |&c| (*pid, c, p.mouse, p.frozen))
            })
            .collect();

        for (_pid, cid, mouse, frozen) in player_cells {
            if let Some(cell) = self.cells.get_mut(&cid) {
                if cell.is_removed {
                    continue;
                }
                Self::move_boost(cell);
                if !frozen {
                    Self::move_user(cell, mouse, player_speed, recombine, tick);
                }
            }
            self.check_border_id(cid);
        }

        // Autosplit oversized
        let oversized: Vec<(PlayerId, NodeId)> = self
            .cells
            .values()
            .filter(|c| {
                c.cell_type == CellType::Player
                    && !c.is_removed
                    && c.size > self.config.player.max_size
                    && c.age(tick) >= 15
            })
            .filter_map(|c| c.owner.map(|o| (o, c.node_id)))
            .collect();
        for (pid, cid) in oversized {
            if let Some(cell) = self.cells.get(&cid) {
                let angle = cell.boost_angle;
                let mass = cell.mass() / 2.0;
                let _ = self.split_player_cell(pid, cid, angle, Some(mass));
            }
        }

        self.rebuild_quad();

        // Collect collisions
        let mut rigid: Vec<(NodeId, NodeId)> = Vec::new();
        let mut eat: Vec<(NodeId, NodeId)> = Vec::new();

        let pcs: Vec<NodeId> = self
            .cells
            .values()
            .filter(|c| c.cell_type == CellType::Player && !c.is_removed)
            .map(|c| c.node_id)
            .collect();

        for cid in pcs {
            let (pos, size) = match self.cells.get(&cid) {
                Some(c) => (c.position, c.size),
                None => continue,
            };
            self.query_buf.clear();
            self.quad
                .find(Bound::from_circle(pos, size * 2.0), &mut self.query_buf);
            let nearby = self.query_buf.clone();
            for oid in nearby {
                // Must check ALL nearby cells (food/virus/etc often have lower ids
                // than the player). Only skip self — same as MultiOgar quad scan.
                if oid == cid {
                    continue;
                }
                if self.is_rigid(cid, oid) {
                    // Rigid only once per unordered pair (both cells find each other)
                    if oid > cid {
                        rigid.push((cid, oid));
                    }
                } else if self.can_resolve_eat(cid, oid) {
                    eat.push((cid, oid));
                }
            }
        }

        // Moving node eats
        let moving = self.moving_nodes.clone();
        for cid in moving {
            let (pos, size, ctype) = match self.cells.get(&cid) {
                Some(c) if !c.is_removed => (c.position, c.size, c.cell_type),
                _ => continue,
            };
            self.query_buf.clear();
            self.quad
                .find(Bound::from_circle(pos, size * 2.0), &mut self.query_buf);
            let nearby = self.query_buf.clone();
            for oid in nearby {
                if oid == cid {
                    continue;
                }
                if ctype == CellType::Ejected {
                    if let Some(o) = self.cells.get(&oid) {
                        if o.cell_type == CellType::Ejected {
                            rigid.push((cid, oid));
                            continue;
                        }
                    }
                }
                if self.can_resolve_eat(cid, oid) {
                    eat.push((cid, oid));
                }
            }
        }

        for (a, b) in rigid {
            self.resolve_rigid(a, b);
        }
        for (a, b) in eat {
            self.resolve_eat(a, b);
        }

        self.rebuild_quad();
    }

    fn check_border_id(&mut self, id: NodeId) {
        // split borrow
        let border = (
            self.border.minx,
            self.border.miny,
            self.border.maxx,
            self.border.maxy,
        );
        if let Some(cell) = self.cells.get_mut(&id) {
            let half = cell.size / 2.0;
            cell.position.x = cell.position.x.clamp(border.0 + half, border.2 - half);
            cell.position.y = cell.position.y.clamp(border.1 + half, border.3 - half);
            // bounce infinite movers
            if cell.infinite_boost {
                if cell.position.x <= border.0 + half || cell.position.x >= border.2 - half {
                    cell.boost_dir.x = -cell.boost_dir.x;
                    cell.boost_angle = cell.boost_dir.y.atan2(cell.boost_dir.x);
                }
                if cell.position.y <= border.1 + half || cell.position.y >= border.3 - half {
                    cell.boost_dir.y = -cell.boost_dir.y;
                    cell.boost_angle = cell.boost_dir.y.atan2(cell.boost_dir.x);
                }
            }
        }
    }

    fn is_rigid(&self, a: NodeId, b: NodeId) -> bool {
        let (ca, cb) = match (self.cells.get(&a), self.cells.get(&b)) {
            (Some(a), Some(b)) if !a.is_removed && !b.is_removed => (a, b),
            _ => return false,
        };
        if ca.cell_type != CellType::Player || cb.cell_type != CellType::Player {
            return false;
        }
        let r = ca.size + cb.size;
        if ca.position.dist_sq(cb.position) > r * r {
            return false;
        }
        if ca.owner == cb.owner {
            if ca.age(self.tick) < 15 || cb.age(self.tick) < 15 {
                return false;
            }
            if ca.can_remerge && cb.can_remerge {
                return false;
            }
            return true;
        }
        // Teams: teammates push apart (JS onCellMove → resolveCollision)
        if self.config.mode.have_teams {
            if let (Some(oa), Some(ob)) = (ca.owner, cb.owner) {
                if self.same_team(oa, ob) {
                    return true;
                }
            }
        }
        false
    }

    fn can_resolve_eat(&self, a: NodeId, b: NodeId) -> bool {
        let (ca, cb) = match (self.cells.get(&a), self.cells.get(&b)) {
            (Some(a), Some(b)) if !a.is_removed && !b.is_removed => (a, b),
            _ => return false,
        };
        let r = ca.size + cb.size;
        if ca.position.dist_sq(cb.position) > r * r {
            return false;
        }
        true
    }

    fn resolve_rigid(&mut self, a: NodeId, b: NodeId) {
        let (pa, sa, pb, sb) = {
            let ca = match self.cells.get(&a) {
                Some(c) => c,
                None => return,
            };
            let cb = match self.cells.get(&b) {
                Some(c) => c,
                None => return,
            };
            (ca.position, ca.size, cb.position, cb.size)
        };
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let d = (dx * dx + dy * dy).sqrt().max(0.01);
        let r = sa + sb;
        let penetration = r - d;
        if penetration <= 0.0 {
            return;
        }
        let nx = dx / d;
        let ny = dy / d;
        let i1 = (sb * sb) / (sa * sa + sb * sb);
        let i2 = (sa * sa) / (sa * sa + sb * sb);
        if let Some(ca) = self.cells.get_mut(&a) {
            ca.position.x -= penetration * nx * i1;
            ca.position.y -= penetration * ny * i1;
        }
        if let Some(cb) = self.cells.get_mut(&b) {
            cb.position.x += penetration * nx * i2;
            cb.position.y += penetration * ny * i2;
        }
        self.check_border_id(a);
        self.check_border_id(b);
    }

    fn resolve_eat(&mut self, a: NodeId, b: NodeId) {
        let (max_id, min_id) = {
            let ca = match self.cells.get(&a) {
                Some(c) if !c.is_removed => c,
                _ => return,
            };
            let cb = match self.cells.get(&b) {
                Some(c) if !c.is_removed => c,
                _ => return,
            };
            if ca.size >= cb.size {
                (a, b)
            } else {
                (b, a)
            }
        };

        let (max_size, min_size, max_owner, min_owner, min_type, min_pos, max_can) = {
            let maxc = match self.cells.get(&max_id) {
                Some(c) => c,
                None => return,
            };
            let minc = match self.cells.get(&min_id) {
                Some(c) => c,
                None => return,
            };
            (
                maxc.size,
                minc.size,
                maxc.owner,
                minc.owner,
                minc.cell_type,
                minc.position,
                maxc.can_eat(minc),
            )
        };

        // MultiOgar resolveCollision: eatDistance, then owner/remerge or 1.15 size, then canEat
        let eat_dist = max_size - min_size / 3.0;
        if eat_dist <= 0.0 {
            return;
        }
        let max_pos = self.cells.get(&max_id).map(|c| c.position).unwrap();
        if max_pos.dist_sq(min_pos) >= eat_dist * eat_dist {
            return;
        }

        if max_owner.is_some() && max_owner == min_owner {
            let (age_max, age_min, rem_max, rem_min) = {
                let maxc = self.cells.get(&max_id).unwrap();
                let minc = self.cells.get(&min_id).unwrap();
                (
                    maxc.age(self.tick),
                    minc.age(self.tick),
                    maxc.can_remerge,
                    minc.can_remerge,
                )
            };
            if age_max < 15 || age_min < 15 {
                return;
            }
            // same owner: only remerge when both allow (rigid otherwise)
            if !(rem_max && rem_min) {
                return;
            }
        } else {
            // cannot eat teammates
            if let (Some(mo), Some(mino)) = (max_owner, min_owner) {
                if self.same_team(mo, mino) {
                    return;
                }
            }
            if max_size <= min_size * 1.15 {
                // enemy / food / virus / eject — must be ~15% larger
                return;
            }
        }

        if !max_can {
            return;
        }
        if min_type == CellType::Beacon {
            return;
        }

        // Apply eat — hunter grows by prey size² (mass ∝ size²/100)
        self.apply_eat(max_id, min_id);
    }

    fn apply_eat(&mut self, hunter_id: NodeId, prey_id: NodeId) {
        let prey_type = self.cells.get(&prey_id).map(|c| c.cell_type);
        let prey_owner = self.cells.get(&prey_id).map(|c| c.owner).flatten();
        let hunter_owner = self.cells.get(&hunter_id).map(|c| c.owner).flatten();
        let prey_size_sq = self.cells.get(&prey_id).map(|c| c.size_squared()).unwrap_or(0.0);
        let prey_mass = self.cells.get(&prey_id).map(|c| c.mass()).unwrap_or(0.0);
        let prey_angle = self.cells.get(&prey_id).map(|c| c.boost_angle).unwrap_or(0.0);
        let prey_moving = self.cells.get(&prey_id).map(|c| c.is_moving).unwrap_or(false);
        let hunter_angle = self.cells.get(&hunter_id).map(|c| c.boost_angle).unwrap_or(0.0);
        let hunter_type = self.cells.get(&hunter_id).map(|c| c.cell_type);
        let hunter_is_mother = self.cells.get(&hunter_id).map(|c| c.is_mother).unwrap_or(false);

        // Stats
        if let Some(oid) = hunter_owner {
            if let Some(p) = self.players.get_mut(&oid) {
                match prey_type {
                    Some(CellType::Food) => p.stats.foodeat += 1,
                    Some(CellType::Player) => p.stats.playereat += 1,
                    Some(CellType::Virus) => p.stats.viruseat += 1,
                    _ => {}
                }
            }
        }

        // Special virus push (Halloween)
        if hunter_type == Some(CellType::Virus)
            && !hunter_is_mother
            && self.config.virus.push_on_eat
            && prey_type == Some(CellType::Ejected)
        {
            let angle = if prey_moving { prey_angle } else { hunter_angle };
            if let Some(h) = self.cells.get_mut(&hunter_id) {
                h.set_boost(320.0, angle, 78.0);
                if !self.moving_nodes.contains(&hunter_id) {
                    self.moving_nodes.push(hunter_id);
                }
            }
            if let Some(p) = self.cells.get_mut(&prey_id) {
                p.killed_by = Some(hunter_id);
            }
            self.remove_cell(prey_id);
            return;
        }

        // Beacon charge
        if hunter_type == Some(CellType::Beacon) {
            self.beacon_on_eat(hunter_id, prey_id);
            return;
        }

        // Mother eat → grow + spray food
        if hunter_is_mother {
            if let Some(h) = self.cells.get_mut(&hunter_id) {
                h.set_size((h.size_squared() + prey_size_sq).sqrt());
            }
            self.mother_spray_food(hunter_id, prey_size_sq.sqrt());
            if let Some(p) = self.cells.get_mut(&prey_id) {
                p.killed_by = Some(hunter_id);
            }
            // if ate last player cell → score
            if prey_type == Some(CellType::Player) {
                if let Some(oid) = prey_owner {
                    let left = self.players.get(&oid).map(|p| p.cells.len()).unwrap_or(0);
                    // cells still includes prey until remove
                    if left <= 1 {
                        self.record_score(oid);
                    }
                }
            }
            self.remove_cell(prey_id);
            return;
        }

        // SurpriseCell effects (no mass from the surprise itself — effects replace grow)
        if hunter_type == Some(CellType::Player) && prey_type == Some(CellType::Surprise) {
            if let Some(oid) = hunter_owner {
                self.surprise_on_eaten(oid, hunter_id);
            }
            if let Some(p) = self.cells.get_mut(&prey_id) {
                p.killed_by = Some(hunter_id);
            }
            self.remove_cell(prey_id);
            return;
        }

        // Normal grow
        if let Some(h) = self.cells.get_mut(&hunter_id) {
            let mut add = prey_size_sq;
            if !self.config.player.bot_grow
                && h.mass() >= 625.0
                && prey_mass <= 17.0
                && prey_type == Some(CellType::Player)
            {
                add = 0.0;
            }
            h.set_size((h.size_squared() + add).sqrt());
        }

        // Virus fed by eject → grow/shoot
        if hunter_type == Some(CellType::Virus)
            && !hunter_is_mother
            && prey_type == Some(CellType::Ejected)
            && !self.config.virus.push_on_eat
        {
            let (size, pos) = {
                let h = self.cells.get(&hunter_id).unwrap();
                (h.size, h.position)
            };
            if size >= self.config.virus.max_size {
                if let Some(h) = self.cells.get_mut(&hunter_id) {
                    h.set_size(self.config.virus.min_size);
                }
                self.shoot_virus(pos, prey_angle);
            }
        }

        // Player ate virus → split
        if hunter_type == Some(CellType::Player) && prey_type == Some(CellType::Virus) {
            if let Some(oid) = hunter_owner {
                self.virus_pop(oid, hunter_id);
            }
        }

        if let Some(p) = self.cells.get_mut(&prey_id) {
            p.killed_by = Some(hunter_id);
        }

        if prey_type == Some(CellType::Player) {
            if let Some(oid) = prey_owner {
                let left = self.players.get(&oid).map(|p| p.cells.len()).unwrap_or(0);
                if left <= 1 {
                    self.record_score(oid);
                }
            }
        }

        self.remove_cell(prey_id);
    }

    fn mother_spray_food(&mut self, mother_id: NodeId, prey_size: f64) {
        let mut rng = rand::rng();
        let (mpos, msize) = match self.cells.get(&mother_id) {
            Some(c) => (c.position, c.size),
            None => return,
        };
        let size2 = self.config.food.max_size - self.config.food.min_size * rng.random::<f64>();
        let counts = (prey_size / size2.max(1.0)) as i32;
        for _ in 0..counts.max(1).min(20) {
            let angle = rng.random::<f64>() * std::f64::consts::TAU;
            let pos = Vec2::new(
                mpos.x + msize * angle.sin(),
                mpos.y + msize * angle.cos(),
            );
            let id = self.next_node_id();
            let mut food = Cell::new(id, CellType::Food, None, pos, size2, self.tick);
            food.color = self.random_color();
            food.set_boost(62.0 + 62.0 * rng.random::<f64>(), angle, 78.0);
            self.add_cell(food);
        }
    }

    fn beacon_on_eat(&mut self, beacon_id: NodeId, prey_id: NodeId) {
        let mut rng = rand::rng();
        if let Some(p) = self.cells.get_mut(&prey_id) {
            p.killed_by = Some(beacon_id);
        }
        self.remove_cell(prey_id);

        let fire = {
            let b = match self.cells.get_mut(&beacon_id) {
                Some(c) if c.beacon_active => c,
                _ => return,
            };
            if rng.random::<f64>() >= 0.25 {
                return;
            }
            b.stage += 1;
            if b.color.r > 0 {
                b.color.r -= 1;
            }
            if b.color.g < 255 {
                b.color.g += 1;
            }
            b.stage >= 100
        };

        if fire {
            self.broadcast_chat("Beacon targeting the leader!");
            let tick = self.tick;
            if let Some(b) = self.cells.get_mut(&beacon_id) {
                b.stage = 999;
                b.beacon_active = false;
                b.tick_of_birth = tick;
                b.color = Color { r: 10, g: 10, b: 10 };
            }
            if let Some(&leader) = self.leaderboard.first() {
                self.split_cells(leader);
                let cells = self
                    .players
                    .get(&leader)
                    .map(|p| p.cells.clone())
                    .unwrap_or_default();
                for cid in cells {
                    if let Some(c) = self.cells.get_mut(&cid) {
                        c.set_size(self.config.player.min_size);
                    }
                }
            }
        }
    }

    fn surprise_on_eaten(&mut self, pid: PlayerId, cell_id: NodeId) {
        if let Some(p) = self.players.get_mut(&pid) {
            p.stats.surpeat += 1;
        }
        let mut rng = rand::rng();
        let dice = rng.random::<f64>();
        let (size, mass, name, cell_count) = {
            let c = match self.cells.get(&cell_id) {
                Some(c) => c,
                None => return,
            };
            let name = self
                .players
                .get(&pid)
                .map(|p| p.name.clone())
                .unwrap_or_default();
            let count = self.players.get(&pid).map(|p| p.cells.len()).unwrap_or(0);
            (c.size, c.mass(), name, count)
        };

        let throw_size = self.config.player.min_size + 12.0;
        let throw_mass = throw_size * throw_size / 100.0;
        let max_splits = (mass / throw_mass).floor() as i32;
        let mut num_splits =
            self.config.player.max_cells as i32 - cell_count as i32;
        num_splits = num_splits.min(max_splits);
        let split_mass = (mass / (num_splits as f64 + 1.0)).min(throw_size);

        if dice > 0.85 {
            self.broadcast_chat(&format!("{name} was lucky!"));
            if let Some(c) = self.cells.get_mut(&cell_id) {
                c.set_size(size * 2.0);
            }
            return;
        }
        if dice < 0.20 {
            if mass > 100.0 {
                self.broadcast_chat(&format!("{name} was unlucky!"));
                if let Some(c) = self.cells.get_mut(&cell_id) {
                    c.set_size(size / 2.0);
                }
            }
            return;
        }
        if num_splits <= 0 {
            return;
        }

        let pos = self.random_position();
        self.broadcast_chat(&format!("{name} found their cells moved somewhere else!"));
        let cells = self
            .players
            .get(&pid)
            .map(|p| p.cells.clone())
            .unwrap_or_default();
        for cid in &cells {
            if let Some(c) = self.cells.get_mut(cid) {
                c.position = pos;
            }
        }
        let mut angle = 0.0_f64;
        for _ in 0..num_splits {
            angle += 6.0 / num_splits as f64;
            if !self.split_player_cell(pid, cell_id, angle, Some(split_mass)) {
                break;
            }
        }
    }

    pub fn shoot_virus(&mut self, pos: Vec2, angle: f64) {
        let id = self.next_node_id();
        let mut cell = Cell::new(
            id,
            CellType::Virus,
            None,
            pos,
            self.config.virus.min_size,
            self.tick,
        );
        cell.color = Color {
            r: self.config.virus.color_r,
            g: self.config.virus.color_g,
            b: self.config.virus.color_b,
        };
        cell.set_boost(780.0, angle, 78.0);
        self.add_cell(cell);
    }

    fn virus_pop(&mut self, pid: PlayerId, cell_id: NodeId) {
        let max_cells = self.config.player.max_cells;
        let (mass, cell_count) = {
            let c = match self.cells.get(&cell_id) {
                Some(c) => c,
                None => return,
            };
            let count = self.players.get(&pid).map(|p| p.cells.len()).unwrap_or(0);
            (c.mass(), count)
        };
        let max_split = max_cells.saturating_sub(cell_count as u32) as usize;
        let masses = split_masses(mass, max_split + 1);
        if masses.len() < 2 {
            return;
        }
        let mut mix = Vec::new();
        for i in (1..masses.len()).step_by(2) {
            mix.push(masses[i]);
        }
        for i in (2..masses.len()).step_by(2) {
            mix.push(masses[i]);
        }
        let mut angle = rand::rng().random::<f64>() * std::f64::consts::TAU;
        let step = std::f64::consts::TAU / mix.len() as f64;
        for m in mix {
            if !self.split_player_cell(pid, cell_id, angle, Some(m)) {
                break;
            }
            angle += step;
        }
    }

    pub fn split_cells(&mut self, pid: PlayerId) {
        let cells = self
            .players
            .get(&pid)
            .map(|p| p.cells.clone())
            .unwrap_or_default();
        let mouse = self
            .players
            .get(&pid)
            .map(|p| p.mouse)
            .unwrap_or(Vec2::new(0.0, 0.0));
        let max_cells = self.config.player.max_cells as usize;
        let min_split = self.config.player.min_split_size;
        for cid in cells {
            let count = self.players.get(&pid).map(|p| p.cells.len()).unwrap_or(0);
            if count >= max_cells {
                break;
            }
            let (size, pos) = match self.cells.get(&cid) {
                Some(c) if !c.is_removed => (c.size, c.position),
                _ => continue,
            };
            if size < min_split {
                continue;
            }
            // JS: Math.atan2(dx, dy) with boost dir (sin θ, cos θ)
            let ang = (mouse.x - pos.x).atan2(mouse.y - pos.y);
            self.split_player_cell(pid, cid, ang, None);
        }
    }

    pub fn split_player_cell(
        &mut self,
        pid: PlayerId,
        parent_id: NodeId,
        angle: f64,
        mass: Option<f64>,
    ) -> bool {
        let max_cells = self.config.player.max_cells as usize;
        let count = self.players.get(&pid).map(|p| p.cells.len()).unwrap_or(0);
        if count >= max_cells {
            return false;
        }
        let (new_size, pos) = {
            let parent = match self.cells.get_mut(&parent_id) {
                Some(c) if !c.is_removed => c,
                _ => return false,
            };
            let size2 = if let Some(m) = mass {
                (m * 100.0).sqrt()
            } else {
                parent.split_size()
            };
            let size1 = if mass.is_some() {
                let remain = (parent.mass() - mass.unwrap()).max(0.0);
                (remain * 100.0).sqrt()
            } else {
                size2
            };
            parent.set_size(size1);
            let pos = Vec2::new(
                parent.position.x + 40.0 * angle.sin(),
                parent.position.y + 40.0 * angle.cos(),
            );
            (size2, pos)
        };
        let id = self.next_node_id();
        let mut cell = Cell::new(id, CellType::Player, Some(pid), pos, new_size, self.tick);
        cell.set_boost(780.0, angle, 78.0);
        self.add_cell(cell);
        true
    }

    pub fn eject_mass(&mut self, pid: PlayerId) {
        let cooldown = {
            let p = match self.players.get_mut(&pid) {
                Some(p) => p,
                None => return,
            };
            if p.eject_cooldown > 0 {
                return;
            }
            p.eject_cooldown = self.config.eject.cooldown_ticks;
            p.cells.clone()
        };
        let mouse = self.players.get(&pid).map(|p| p.mouse).unwrap();
        let mut rng = rand::rng();
        let min_size = self.config.player.min_size;
        let eject_virus = self.config.eject.eject_virus;
        let loss = if eject_virus {
            self.config.virus.min_size
        } else {
            self.config.eject.size_loss
        };
        let ej_size = self.config.eject.size;
        let dist = self.config.eject.distance;

        for cid in cooldown {
            let (pos, size, color) = match self.cells.get(&cid) {
                Some(c) if !c.is_removed => (c.position, c.size, c.color),
                _ => continue,
            };
            if size < self.config.player.min_split_size {
                continue;
            }
            let size1 = (size * size - loss * loss).sqrt();
            if size1 < min_size {
                continue;
            }
            if let Some(c) = self.cells.get_mut(&cid) {
                c.set_size(size1);
            }
            let mut angle = (mouse.x - pos.x).atan2(mouse.y - pos.y);
            angle += (rng.random::<f64>() - 0.5) * 0.6;
            let eject_pos = Vec2::new(
                pos.x + size * angle.sin(),
                pos.y + size * angle.cos(),
            );
            if eject_virus {
                // Virus Off: one virus per W, same as JS shootVirus + early return
                self.shoot_virus(eject_pos, angle);
                return;
            }
            let id = self.next_node_id();
            let mut cell = Cell::new(id, CellType::Ejected, None, eject_pos, ej_size, self.tick);
            cell.color = color;
            cell.set_boost(dist, angle, 78.0);
            self.add_cell(cell);
        }
    }

    pub fn update_mass_decay(&mut self) {
        let decay = 1.0 - self.config.effective_decay();
        let min_size = self.config.player.min_size;
        for cell in self.cells.values_mut() {
            if cell.cell_type == CellType::Player && !cell.is_removed {
                let ns = (cell.size_squared() * decay).sqrt().max(min_size);
                cell.set_size(ns);
            }
        }
    }

    /// Alive followable players (humans + bots, not minions).
    pub fn alive_spectate_ids(&self) -> Vec<PlayerId> {
        let mut ids: Vec<PlayerId> = self
            .players
            .iter()
            .filter(|(_, p)| !p.is_mi && !p.is_removed && !p.cells.is_empty())
            .map(|(id, _)| *id)
            .collect();
        ids.sort_unstable();
        ids
    }

    pub fn largest_alive_player(&self) -> Option<PlayerId> {
        self.players
            .iter()
            .filter(|(_, p)| !p.is_mi && !p.is_removed && !p.cells.is_empty())
            .max_by(|a, b| {
                a.1.score
                    .partial_cmp(&b.1.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(id, _)| *id)
    }

    /// Space while spectating — cycle to next alive player/bot (JS nextSpectateTarget).
    pub fn spectate_next(&mut self, pid: PlayerId) {
        let tick = self.tick;
        let (last, free_roam, cur) = match self.players.get(&pid) {
            Some(p) if p.spectate => (p.last_spectate_switch_tick, p.free_roam, p.spectate_target),
            _ => return,
        };
        if tick.saturating_sub(last) < 40 {
            return;
        }
        if free_roam {
            return;
        }
        let alive = self.alive_spectate_ids();
        if alive.is_empty() {
            if let Some(p) = self.players.get_mut(&pid) {
                p.spectate_target = None;
                p.last_spectate_switch_tick = tick;
            }
            return;
        }
        let next = match cur {
            None => self.largest_alive_player().or_else(|| alive.first().copied()),
            Some(cur_id) => {
                let pos = alive.iter().position(|&id| id == cur_id);
                match pos {
                    Some(i) => Some(alive[(i + 1) % alive.len()]),
                    None => self.largest_alive_player().or_else(|| alive.first().copied()),
                }
            }
        };
        if let Some(p) = self.players.get_mut(&pid) {
            p.spectate_target = next;
            p.last_spectate_switch_tick = tick;
        }
    }

    /// Q while spectating — clear lock / toggle free-roam (JS pressQ).
    pub fn spectate_toggle_q(&mut self, pid: PlayerId) {
        let tick = self.tick;
        let last = match self.players.get(&pid) {
            Some(p) if p.spectate => p.last_spectate_switch_tick,
            _ => return,
        };
        if tick.saturating_sub(last) < 40 {
            return;
        }
        if let Some(p) = self.players.get_mut(&pid) {
            if p.spectate_target.is_none() {
                p.free_roam = !p.free_roam;
            }
            p.spectate_target = None;
            p.last_spectate_switch_tick = tick;
        }
    }

    pub fn update_center_view(&mut self, pid: PlayerId) {
        let view_x = self.config.world.view_base_x;
        let view_y = self.config.world.view_base_y;

        // Spectate: follow target / largest, or free-roam toward mouse
        let spectate = self.players.get(&pid).map(|p| p.spectate).unwrap_or(false);
        if spectate {
            let (free_roam, target, mouse, center) = {
                let p = self.players.get(&pid).unwrap();
                (p.free_roam, p.spectate_target, p.mouse, p.center)
            };

            if free_roam {
                let dx = mouse.x - center.x;
                let dy = mouse.y - center.y;
                let d2 = dx * dx + dy * dy;
                let (cx, cy) = if d2 < 1.0 {
                    (center.x, center.y)
                } else {
                    let d = d2.sqrt();
                    let speed = d.min(32.0);
                    (center.x + dx / d * speed, center.y + dy / d * speed)
                };
                if let Some(p) = self.players.get_mut(&pid) {
                    p.center = Vec2::new(cx, cy);
                    p.scale = 0.20;
                    let vw = (view_x + 100.0) / (p.scale / 1.1);
                    let vh = (view_y + 100.0) / (p.scale / 1.1);
                    p.view_box = Bound {
                        minx: cx - vw / 2.0,
                        miny: cy - vh / 2.0,
                        maxx: cx + vw / 2.0,
                        maxy: cy + vh / 2.0,
                    };
                }
                return;
            }

            let follow = target
                .filter(|&tid| {
                    self.players
                        .get(&tid)
                        .map(|t| !t.is_removed && !t.cells.is_empty())
                        .unwrap_or(false)
                })
                .or_else(|| self.largest_alive_player());

            if let Some(tid) = follow {
                // Copy followee center/scale (recompute from their cells)
                let mut sx = 0.0;
                let mut sy = 0.0;
                let mut n = 0;
                let mut size_sum = 0.0;
                if let Some(t) = self.players.get(&tid) {
                    for &cid in &t.cells {
                        if let Some(c) = self.cells.get(&cid) {
                            if !c.is_removed {
                                sx += c.position.x;
                                sy += c.position.y;
                                size_sum += c.size;
                                n += 1;
                            }
                        }
                    }
                }
                if n > 0 {
                    let cx = sx / n as f64;
                    let cy = sy / n as f64;
                    let scale = (128.0 / size_sum.max(1.0)).min(1.0).powf(0.4);
                    if let Some(p) = self.players.get_mut(&pid) {
                        p.center = Vec2::new(cx, cy);
                        p.scale = scale.max(0.01);
                        let vw = (view_x + 100.0) / (p.scale / 1.1);
                        let vh = (view_y + 100.0) / (p.scale / 1.1);
                        p.view_box = Bound {
                            minx: cx - vw / 2.0,
                            miny: cy - vh / 2.0,
                            maxx: cx + vw / 2.0,
                            maxy: cy + vh / 2.0,
                        };
                        if p.spectate_target.is_none() {
                            p.spectate_target = Some(tid);
                        }
                    }
                    return;
                }
            }
        }

        let (cx, cy) = {
            let p = match self.players.get(&pid) {
                Some(p) => p,
                None => return,
            };
            let mut sx = 0.0;
            let mut sy = 0.0;
            let mut n = 0;
            for &cid in &p.cells {
                if let Some(c) = self.cells.get(&cid) {
                    if !c.is_removed {
                        sx += c.position.x;
                        sy += c.position.y;
                        n += 1;
                    }
                }
            }
            if n > 0 {
                (sx / n as f64, sy / n as f64)
            } else {
                (p.center.x, p.center.y)
            }
        };
        if let Some(p) = self.players.get_mut(&pid) {
            p.center = Vec2::new(cx, cy);
            p.recompute_score(&self.cells);
            let scale = p.scale.max(0.01);
            let vw = (view_x + 100.0) / (scale / 1.1);
            let vh = (view_y + 100.0) / (scale / 1.1);
            p.view_box = Bound {
                minx: cx - vw / 2.0,
                miny: cy - vh / 2.0,
                maxx: cx + vw / 2.0,
                maxy: cy + vh / 2.0,
            };
        }
    }

    pub fn update_leaderboard(&mut self) {
        self.with_mode(|mode, gs| mode.update_lb(gs));
    }

    pub fn send_leaderboard(&self, pid: PlayerId) {
        let p = match self.players.get(&pid) {
            Some(p) => p,
            None => return,
        };
        let packet = match self.leaderboard_kind {
            LeaderboardKind::Team => protocol::leaderboard_team(&self.team_scores),
            LeaderboardKind::Ffa => {
                let mut entries = Vec::new();
                for &lid in &self.leaderboard {
                    if let Some(lp) = self.players.get(&lid) {
                        let cell_id = lp.cells.first().copied().unwrap_or(0);
                        let is_me = lid == pid;
                        entries.push((is_me, cell_id, lp.name.as_str()));
                    }
                }
                protocol::leaderboard_ffa(p.protocol, p.scramble_id, &entries, None)
            }
        };
        p.send(packet);
    }

    /// MivaBe MiniMap — opcode 104, ~1 Hz (same cadence as JS SendMiniMap).
    pub fn send_minimap(&self) {
        let any = self
            .players
            .values()
            .any(|p| p.mini_map && p.tx.is_some() && p.handshake && !p.is_mi);
        if !any {
            return;
        }
        let has_targets = match self.leaderboard_kind {
            LeaderboardKind::Ffa => !self.leaderboard.is_empty(),
            LeaderboardKind::Team => self.players.values().any(|p| !p.is_mi && !p.cells.is_empty()),
        };
        if !has_targets {
            return;
        }
        let mut nodes = Vec::new();
        for p in self.players.values() {
            if p.is_mi || p.cells.is_empty() {
                continue;
            }
            for &cid in &p.cells {
                let Some(c) = self.cells.get(&cid) else {
                    continue;
                };
                if c.is_removed {
                    continue;
                }
                nodes.push(protocol::MiniMapNode {
                    node_id: c.node_id,
                    x: c.position.x as i32,
                    y: c.position.y as i32,
                    size: c.size.max(0.0).min(u16::MAX as f64) as u16,
                    color: p.color,
                    is_spiked: c.is_spiked,
                    is_agitated: c.is_agitated,
                    is_ejected: c.cell_type == CellType::Ejected,
                });
            }
        }
        if nodes.is_empty() {
            return;
        }
        let packet = protocol::minimap(&nodes);
        for p in self.players.values() {
            if p.mini_map && p.handshake && !p.is_mi {
                p.send(packet.clone());
            }
        }
    }

    pub fn broadcast_chat(&self, text: &str) {
        let pkt = protocol::chat_message(
            "📢 ",
            text,
            Color {
                r: 0x9B,
                g: 0x9B,
                b: 0x9B,
            },
            0x80,
        );
        for p in self.players.values() {
            p.send(pkt.clone());
        }
    }

    pub fn send_chat_to(&self, pid: PlayerId, text: &str) {
        if let Some(p) = self.players.get(&pid) {
            p.send(protocol::chat_message(
                "📢 ",
                text,
                Color {
                    r: 0x9B,
                    g: 0x9B,
                    b: 0x9B,
                },
                0x80,
            ));
        }
    }

    pub fn record_score(&mut self, pid: PlayerId) {
        let (name, skin, ip, stats, mode_name, min_save, is_bot) = {
            let p = match self.players.get(&pid) {
                Some(p) if !p.is_mi => p,
                _ => return,
            };
            (
                p.name.clone(),
                p.skin.clone(),
                p.ip.clone(),
                p.stats.clone(),
                self.mode.name().to_string(),
                self.config.scores.min_score_to_save,
                p.is_bot,
            )
        };
        let score = stats.score / 100;
        if score < min_save {
            return;
        }
        let play_seconds = if stats.playstart > 0 {
            ((Utc::now().timestamp_millis() - stats.playstart) / 1000).max(0) as u64
        } else {
            0
        };
        let entry = ScoreEntry {
            name,
            skin,
            score,
            mode: mode_name,
            foodeat: stats.foodeat,
            playereat: stats.playereat,
            viruseat: stats.viruseat,
            surpeat: stats.surpeat,
            play_seconds,
            at: Utc::now(),
        };
        // Local JSON always
        if let Err(e) = self.scores.record(entry.clone()) {
            tracing::warn!("score save failed: {e}");
        }
        // Optional MySQL (JS mysql.ini) — skip bots; connect only for this write
        if self.config.mysql.enabled() && !is_bot {
            let ip = if ip.eq_ignore_ascii_case("bot") {
                "BOT".into()
            } else {
                ip
            };
            crate::mysql_scores::spawn_write(self.config.mysql.clone(), entry, ip);
        }
        if let Some(p) = self.players.get_mut(&pid) {
            p.stats = PlayerStats::default();
        }
    }

    pub fn refresh_sinfo(&mut self) {
        let mut players = 0u32;
        let mut humans = 0u32;
        let mut spectate = 0u32;
        let mut bots = 0u32;
        for p in self.players.values() {
            if p.is_removed {
                continue;
            }
            if p.is_mi {
                continue;
            }
            players += 1;
            if p.is_bot {
                bots += 1;
                continue;
            }
            if p.tx.is_none() {
                // disconnected leftover — skip
                players = players.saturating_sub(1);
                continue;
            }
            if !p.cells.is_empty() {
                humans += 1;
            } else if p.spectate {
                spectate += 1;
            }
        }
        self.sinfo_players = players;
        self.sinfo_humans = humans;
        self.sinfo_spectate = spectate;
        self.sinfo_bots = bots;
    }

    pub fn build_server_stat_json(&self) -> String {
        serde_json::json!({
            "name": self.config.server.name,
            "mode": self.mode.name(),
            "uptime": self.started.elapsed().as_secs(),
            "update": format!("{:.3}", self.update_time_avg),
            "playersTotal": self.sinfo_players,
            "playersAlive": self.sinfo_humans,
            "playersSpect": self.sinfo_spectate,
            "playersLimit": self.config.server.max_connections
        })
        .to_string()
    }

    pub fn send_server_stat(&mut self, pid: PlayerId) {
        self.refresh_sinfo();
        let json = self.build_server_stat_json();
        if let Some(p) = self.players.get(&pid) {
            p.send(protocol::server_stat_json(&json));
        }
    }

    pub fn send_server_info(&mut self, pid: PlayerId) {
        self.refresh_sinfo();
        let uptime = self.started.elapsed().as_secs_f64();
        let pkt = protocol::server_info(
            uptime,
            self.sinfo_humans as f64,
            self.border.width,
            self.cells.len() as f64,
            self.mode.id() as f64,
        );
        if let Some(p) = self.players.get(&pid) {
            p.send(pkt);
        }
    }

    pub fn tick_once(&mut self) {
        if !self.running {
            return;
        }
        let t0 = std::time::Instant::now();

        // Humans with cells only — spectators do not keep the world running (JS-style),
        // unless bots.idle_when_empty is off (bots keep playing on an empty server).
        self.refresh_sinfo();
        let humans_playing = self.sinfo_humans > 0;
        let run_world = !self.paused && (humans_playing || !self.config.bots.idle_when_empty);

        if run_world {
            self.update_move_engine();

            let interval = self.config.food.spawn_interval_ticks.max(1);
            if self.tick % u64::from(interval) == 0 {
                self.spawn_cells_periodic();
            }

            self.mode_on_tick();

            if (self.tick + 3) % 25 == 0 {
                self.update_mass_decay();
            }

            self.pump_bot_ai();
        } else if !self.paused {
            // No players in-game (empty or all spectating): freeze motion.
            // Still keep bot roster / shrink oversized bots like JS.
            self.maintain_bots();
        }

        self.refresh_sinfo();

        // Clients / minions / bots always get sync (spectators still see the frozen map)
        let pids: Vec<PlayerId> = self.players.keys().copied().collect();
        for pid in &pids {
            // While world is frozen, ignore bot split/eject presses
            if !run_world {
                if let Some(p) = self.players.get_mut(&pid) {
                    if p.is_bot {
                        p.press_space = false;
                        p.press_w = false;
                    }
                }
            }
            player::update_player_tick(self, *pid);
        }
        for pid in &pids {
            player::send_player_update(self, *pid);
        }
        let dt = t0.elapsed().as_secs_f64() * 1000.0;
        self.update_time_avg = self.update_time_avg * 0.9 + dt * 0.1;

        if (self.tick + 7) % 25 == 0 {
            self.update_leaderboard();
            self.send_minimap();
        }

        // Beacon cooldown reactivate
        if let Some(bid) = self.beacon_id {
            if let Some(b) = self.cells.get_mut(&bid) {
                if b.stage == 999 {
                    // count down using tick_of_birth abuse — simpler: just reactivate after 500 ticks from stage set
                }
            }
        }

        self.tick += 1;
        if self.tick % 250 == 0 {
            debug!(
                tick = self.tick,
                food = self.current_food,
                virus = self.virus_count,
                players = self.players.len(),
                cells = self.cells.len(),
                "heartbeat"
            );
        }

        // Occasionally purge tombstones not in any client view — keep simple: purge every 100 ticks
        if self.tick % 100 == 0 {
            let live_clients: Vec<NodeId> = self
                .players
                .values()
                .flat_map(|p| p.client_nodes.iter().copied())
                .collect();
            self.cells.retain(|id, c| {
                if !c.is_removed {
                    return true;
                }
                live_clients.contains(id)
            });
        }
    }

    fn mode_on_tick(&mut self) {
        self.with_mode(|mode, gs| mode.on_tick(gs));
    }

    pub fn spawn_mother(&mut self) {
        let pos = self.random_position();
        if self.will_collide_player(pos, 149.0) {
            return;
        }
        let id = self.next_node_id();
        let mut cell = Cell::new(id, CellType::Virus, None, pos, 149.0, self.tick);
        cell.is_mother = true;
        cell.is_spiked = true;
        let mut rng = rand::rng();
        let jitter = rng.random_range(-20i16..21);
        cell.color = Color {
            r: (self.config.virus.color_r as i16 + jitter).clamp(0, 255) as u8,
            g: (self.config.virus.color_g as i16 + jitter).clamp(0, 255) as u8,
            b: 0,
        };
        self.add_cell(cell);
    }

    pub fn spawn_beacon(&mut self, size: f64) {
        if self.beacon_id.is_some() {
            return;
        }
        let id = self.next_node_id();
        let mut cell = Cell::new(
            id,
            CellType::Beacon,
            None,
            Vec2::new(0.0, 0.0),
            size,
            self.tick,
        );
        cell.color = Color {
            r: self.config.virus.color_r,
            g: self.config.virus.color_g,
            b: self.config.virus.color_b,
        };
        self.add_cell(cell);
        self.broadcast_chat("Beacon spawned!");
    }

    pub fn mother_update(&mut self, id: NodeId) {
        let mut rng = rand::rng();
        let (size, pos) = match self.cells.get(&id) {
            Some(c) if c.is_mother && !c.is_removed => (c.size, c.position),
            _ => return,
        };
        let min = 149.0;
        if size > min {
            let ns = (size - self.config.eject.size / 8.0).max(min);
            if let Some(c) = self.cells.get_mut(&id) {
                c.set_size(ns);
            }
            return;
        }
        if rng.random::<f64>() * 100.0 > 94.0 && !self.players.is_empty() {
            if self.current_food >= self.config.food.max_amount {
                return;
            }
            let size2 =
                self.config.food.max_size - self.config.food.min_size * rng.random::<f64>();
            let angle = rng.random::<f64>() * std::f64::consts::TAU;
            let fpos = Vec2::new(pos.x + size * angle.sin(), pos.y + size * angle.cos());
            let fid = self.next_node_id();
            let mut food = Cell::new(fid, CellType::Food, None, fpos, size2, self.tick);
            food.color = self.random_color();
            food.set_boost(32.0 + 32.0 * rng.random::<f64>(), angle, 78.0);
            if let Some(c) = self.cells.get_mut(&id) {
                let ns = (size * size - size2 * size2).sqrt().max(min);
                c.set_size(ns);
            }
            self.add_cell(food);
        }
    }
}

fn split_masses(mass: f64, max_parts: usize) -> Vec<f64> {
    if max_parts <= 1 {
        return vec![mass];
    }
    let mut masses = vec![mass];
    while masses.len() < max_parts {
        let mut next = None;
        for (i, &m) in masses.iter().enumerate() {
            if m > 36.0 {
                next = Some(i);
                break;
            }
        }
        let Some(i) = next else { break };
        let m = masses[i];
        masses[i] = m / 2.0;
        masses.push(m / 2.0);
    }
    masses
}

fn load_bot_names(config: &AppConfig) -> Vec<String> {
    let file = &config.bots.names_file;
    if file.is_empty() {
        return Vec::new();
    }
    let candidates = [
        PathBuf::from(file),
        PathBuf::from("config").join(file),
        PathBuf::from("..").join(file),
        PathBuf::from("ogar-rs").join("..").join(file),
    ];
    for path in candidates {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            let names: Vec<String> = raw
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect();
            if !names.is_empty() {
                info!(path = %path.display(), count = names.len(), "loaded bot names");
                return names;
            }
        }
    }
    Vec::new()
}

pub async fn run_tick_loop(server: Arc<Mutex<GameServer>>) {
    let tick_ms = {
        let mut s = server.lock().await;
        s.attach_bot_ai();
        if s.config.tracker.enabled {
            info!(
                url = %s.config.tracker.url,
                server_url = %s.config.tracker.server_url,
                "master tracker enabled"
            );
        }
        s.config.world.tick_ms.max(1)
    };
    info!(tick_ms, "world tick loop started");
    let mut ticker = interval(Duration::from_millis(tick_ms));
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
    loop {
        ticker.tick().await;
        let ping = {
            let mut s = server.lock().await;
            if !s.running {
                break;
            }
            s.tick_once();
            s.take_tracker_ping()
        };
        if let Some((url, body)) = ping {
            tokio::spawn(async move {
                crate::tracker::post_tracker_ping(url, body).await;
            });
        }
    }
}
