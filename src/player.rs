use crate::protocol::{self, Color, NodeView};
use crate::world::cell::{Cell, CellType, NodeId, PlayerId, Vec2};
use crate::world::quad::Bound;
use crate::world::GameServer;
use bytes::Bytes;
use rand::Rng;
use std::collections::HashMap;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone, Debug, Default)]
pub struct PlayerStats {
    pub score: u64,
    pub playereat: u32,
    pub viruseat: u32,
    pub foodeat: u32,
    /// SurpriseCells eaten (JS `surpeat` / MySQL `eat_surprice`)
    pub surpeat: u32,
    pub playstart: i64,
}

pub struct Player {
    pub id: PlayerId,
    pub name: String,
    pub skin: String,
    pub color: Color,
    pub cells: Vec<NodeId>,
    pub mouse: Vec2,
    pub center: Vec2,
    pub view_box: Bound,
    pub scale: f64,
    pub score: f64,
    pub scramble_x: f64,
    pub scramble_y: f64,
    pub scramble_id: u32,
    pub protocol: u32,
    pub handshake: bool,
    pub spectate: bool,
    /// Locked follow target while spectating (None = largest / free-roam)
    pub spectate_target: Option<PlayerId>,
    /// Q toggles free-roam camera (JS freeRoam)
    pub free_roam: bool,
    pub free_mouse: bool,
    pub press_space: bool,
    pub press_w: bool,
    pub press_q: bool,
    pub last_spectate_switch_tick: u64,
    pub eject_cooldown: u32,
    pub tick_leaderboard: u32,
    pub client_nodes: Vec<NodeId>,
    pub view_nodes: Vec<NodeId>,
    pub stats: PlayerStats,
    pub is_removed: bool,
    /// None for minions / fake clients (packets discarded)
    pub tx: Option<UnboundedSender<Bytes>>,
    pub ip: String,
    /// Controlled minion (not a real websocket client)
    pub is_mi: bool,
    /// AI bot (no websocket; mouse/split from bot worker)
    pub is_bot: bool,
    /// Team index for Teams mode (ignored when have_teams is false)
    pub team: i32,
    pub owner_id: Option<PlayerId>,
    pub minion_control: bool,
    pub minion_split: bool,
    pub minion_eject: bool,
    pub minion_frozen: bool,
    pub collect_pellets: bool,
    pub frozen: bool,
    /// Rate-limit ServerStat (packet 254 after handshake), millis since unix epoch
    pub last_stat_ms: u64,
    /// Client opted into MiniMap updates (packet 104)
    pub mini_map: bool,
    pub bot_split_cd: u32,
    pub bot_wander: Option<Vec2>,
}

impl Player {
    pub fn new(id: PlayerId, tx: UnboundedSender<Bytes>, ip: String, center: Vec2) -> Self {
        Self {
            id,
            name: String::new(),
            skin: String::new(),
            color: Color {
                r: 0x9B,
                g: 0x9B,
                b: 0x9B,
            },
            cells: Vec::new(),
            mouse: center,
            center,
            view_box: Bound {
                minx: 0.0,
                miny: 0.0,
                maxx: 0.0,
                maxy: 0.0,
            },
            scale: 1.0,
            score: 0.0,
            scramble_x: 0.0,
            scramble_y: 0.0,
            scramble_id: 0,
            protocol: 11,
            handshake: false,
            spectate: false,
            spectate_target: None,
            free_roam: false,
            free_mouse: true,
            press_space: false,
            press_w: false,
            press_q: false,
            last_spectate_switch_tick: 0,
            eject_cooldown: 0,
            tick_leaderboard: 0,
            client_nodes: Vec::new(),
            view_nodes: Vec::new(),
            stats: PlayerStats::default(),
            is_removed: false,
            tx: Some(tx),
            ip,
            is_mi: false,
            is_bot: false,
            team: 0,
            owner_id: None,
            minion_control: false,
            minion_split: false,
            minion_eject: false,
            minion_frozen: false,
            collect_pellets: false,
            frozen: false,
            last_stat_ms: 0,
            mini_map: false,
            bot_split_cd: 0,
            bot_wander: None,
        }
    }

    pub fn new_minion(id: PlayerId, owner_id: PlayerId, center: Vec2) -> Self {
        let mut p = Self::new(id, {
            let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
            tx
        }, "minion".into(), center);
        p.tx = None;
        p.is_mi = true;
        p.owner_id = Some(owner_id);
        p.handshake = true;
        p
    }

    pub fn new_bot(id: PlayerId, center: Vec2) -> Self {
        let mut p = Self::new(id, {
            let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
            tx
        }, "bot".into(), center);
        p.tx = None;
        p.is_bot = true;
        p.handshake = true;
        p.skin = "%bot".into();
        p
    }

    pub fn send(&self, data: Vec<u8>) {
        if let Some(tx) = &self.tx {
            let _ = tx.send(Bytes::from(data));
        }
    }

    pub fn scramble(&mut self, level: u8, border_w: f64, border_h: f64) {
        if level == 0 {
            self.scramble_id = 0;
            self.scramble_x = 0.0;
            self.scramble_y = 0.0;
            return;
        }
        let mut rng = rand::rng();
        self.scramble_id = rng.random::<u32>();
        let maxx = (32767.0_f64 - 1000.0 - border_w).max(0.0);
        let maxy = (32767.0_f64 - 1000.0 - border_h).max(0.0);
        let mut x = if maxx > 0.0 {
            rng.random::<f64>() * maxx
        } else {
            0.0
        };
        let mut y = if maxy > 0.0 {
            rng.random::<f64>() * maxy
        } else {
            0.0
        };
        if rng.random::<bool>() {
            x = -x;
        }
        if rng.random::<bool>() {
            y = -y;
        }
        self.scramble_x = x;
        self.scramble_y = y;
    }

    pub fn recompute_score(&mut self, cells: &HashMap<NodeId, Cell>) {
        let mut total = 0.0;
        let mut size_sum = 0.0;
        for &cid in &self.cells {
            if let Some(c) = cells.get(&cid) {
                if !c.is_removed {
                    total += c.size_squared();
                    size_sum += c.size;
                }
            }
        }
        self.score = total;
        let score_u = total as u64;
        if score_u > self.stats.score {
            self.stats.score = score_u;
        }
        self.scale = (128.0 / size_sum.max(1.0)).min(1.0).powf(0.4);
    }
}

pub fn update_player_tick(gs: &mut GameServer, pid: PlayerId) {
    // Minion AI / owner sync before input
    if gs.players.get(&pid).map(|p| p.is_mi).unwrap_or(false) {
        gs.tick_minion(pid);
    }

    let (space, w, q, has_cells, frozen, spectate) = {
        let p = match gs.players.get(&pid) {
            Some(p) if !p.is_removed => p,
            _ => return,
        };
        (
            p.press_space,
            p.press_w,
            p.press_q,
            !p.cells.is_empty(),
            p.frozen,
            p.spectate,
        )
    };

    if let Some(p) = gs.players.get_mut(&pid) {
        p.press_space = false;
        p.press_w = false;
        p.press_q = false;
        if p.eject_cooldown > 0 {
            p.eject_cooldown -= 1;
        }
    }

    if spectate {
        // Works even when world is idle-frozen (bots still visible)
        if space {
            gs.spectate_next(pid);
        }
        if q {
            gs.spectate_toggle_q(pid);
        }
        if w {
            if let Some(p) = gs.players.get_mut(&pid) {
                p.free_mouse = !p.free_mouse;
            }
        }
    } else if !frozen {
        if space && has_cells {
            gs.split_cells(pid);
        }
        if w && has_cells {
            gs.eject_mass(pid);
        }
    }

    gs.update_center_view(pid);
}

pub fn send_player_update(gs: &mut GameServer, pid: PlayerId) {
    // Minions / pre-handshake clients must not get UpdateNodes yet
    if gs
        .players
        .get(&pid)
        .map(|p| p.is_mi || p.is_bot || p.tx.is_none() || !p.handshake)
        .unwrap_or(true)
    {
        return;
    }
    let protocol = gs.players.get(&pid).map(|p| p.protocol).unwrap_or(11);
    let scramble_id = gs.players.get(&pid).map(|p| p.scramble_id).unwrap_or(0);
    let scramble_x = gs.players.get(&pid).map(|p| p.scramble_x).unwrap_or(0.0);
    let scramble_y = gs.players.get(&pid).map(|p| p.scramble_y).unwrap_or(0.0);

    // Build view node list
    let view_ids = {
        let p = match gs.players.get(&pid) {
            Some(p) => p,
            None => return,
        };
        let mut found = Vec::new();
        gs.quad.find(p.view_box, &mut found);
        found.sort_unstable();
        found.dedup();
        // ensure own cells included
        let mut view = found;
        for &c in &p.cells {
            if !view.contains(&c) {
                view.push(c);
            }
        }
        view.sort_unstable();
        view
    };

    let client_nodes = gs
        .players
        .get(&pid)
        .map(|p| p.client_nodes.clone())
        .unwrap_or_default();

    let mut add = Vec::new();
    let mut upd = Vec::new();
    let mut eat = Vec::new();
    let mut del = Vec::new();

    let mut i = 0usize;
    let mut j = 0usize;
    while i < view_ids.len() || j < client_nodes.len() {
        let a = view_ids.get(i).copied();
        let b = client_nodes.get(j).copied();
        match (a, b) {
            (Some(va), Some(vb)) if va == vb => {
                if let Some(cell) = gs.cells.get(&va) {
                    if cell.is_moving || !matches!(cell.cell_type, CellType::Food | CellType::Ejected)
                    {
                        upd.push(node_view(gs, cell, scramble_x, scramble_y));
                    }
                }
                i += 1;
                j += 1;
            }
            (Some(va), Some(vb)) if va < vb => {
                if let Some(cell) = gs.cells.get(&va) {
                    add.push(node_view(gs, cell, scramble_x, scramble_y));
                }
                i += 1;
            }
            (Some(_), Some(vb)) => {
                // only in client
                classify_remove(gs, vb, pid, &mut eat, &mut del);
                j += 1;
            }
            (Some(va), None) => {
                if let Some(cell) = gs.cells.get(&va) {
                    add.push(node_view(gs, cell, scramble_x, scramble_y));
                }
                i += 1;
            }
            (None, Some(vb)) => {
                classify_remove(gs, vb, pid, &mut eat, &mut del);
                j += 1;
            }
            (None, None) => break,
        }
    }

    if let Some(p) = gs.players.get_mut(&pid) {
        p.view_nodes = view_ids.clone();
        p.client_nodes = view_ids;
    }

    let packet = protocol::update_nodes(protocol, scramble_id, &eat, &upd, &add, &del);
    if let Some(p) = gs.players.get(&pid) {
        p.send(packet);
    }

    // Leaderboard ~1 Hz
    let send_lb = {
        let p = gs.players.get_mut(&pid);
        if let Some(p) = p {
            p.tick_leaderboard += 1;
            if p.tick_leaderboard >= 25 {
                p.tick_leaderboard = 0;
                true
            } else {
                false
            }
        } else {
            false
        }
    };
    if send_lb {
        gs.send_leaderboard(pid);
    }

    if gs.players.get(&pid).map(|p| p.spectate).unwrap_or(false) {
        if let Some(p) = gs.players.get(&pid) {
            p.send(protocol::update_position(
                (p.center.x + p.scramble_x) as f32,
                (p.center.y + p.scramble_y) as f32,
                p.scale as f32,
            ));
        }
    }
}

fn classify_remove(
    gs: &GameServer,
    node_id: NodeId,
    viewer: PlayerId,
    eat: &mut Vec<(u32, u32)>,
    del: &mut Vec<u32>,
) {
    if let Some(cell) = gs.cells.get(&node_id) {
        if cell.is_removed {
            if let Some(killer_id) = cell.killed_by {
                if let Some(killer) = gs.cells.get(&killer_id) {
                    let same_owner = match (cell.owner, killer.owner) {
                        (Some(a), Some(b)) => a == b,
                        _ => false,
                    };
                    if !same_owner {
                        eat.push((killer_id, node_id));
                        return;
                    }
                }
            }
        }
    }
    let _ = viewer;
    del.push(node_id);
}

fn node_view(gs: &GameServer, cell: &Cell, sx: f64, sy: f64) -> NodeView {
    // Player cells: owner color is source of truth (JS addNode copies owner.color)
    let (skin, name, color) = if let Some(oid) = cell.owner {
        if let Some(p) = gs.players.get(&oid) {
            let skin = if p.skin.is_empty() {
                None
            } else {
                Some(p.skin.clone())
            };
            let name = if p.name.is_empty() {
                None
            } else {
                Some(p.name.clone())
            };
            (skin, name, p.color)
        } else {
            (None, None, cell.color)
        }
    } else {
        let skin = match cell.cell_type {
            CellType::Virus | CellType::Beacon | CellType::Surprise => Some("%gas".into()),
            CellType::Ejected => Some("%proton".into()),
            _ => None,
        };
        (skin, None, cell.color)
    };

    NodeView {
        node_id: cell.node_id,
        x: cell.position.x + sx,
        y: cell.position.y + sy,
        size: cell.size,
        color,
        is_spiked: cell.is_spiked,
        is_agitated: cell.is_agitated,
        cell_type: cell.cell_type as u8,
        skin,
        name,
    }
}
