use crate::config::ModeConfig;
use crate::world::cell::PlayerId;
use crate::world::GameServer;
use rand::Rng;

pub trait GameMode: Send {
    fn id(&self) -> i32;
    fn name(&self) -> &str;
    fn on_server_init(&mut self, _gs: &mut GameServer) {}
    fn on_tick(&mut self, _gs: &mut GameServer) {}
    /// Called once when a player/bot is created (assign team, etc.).
    fn on_player_init(&mut self, _gs: &mut GameServer, _pid: PlayerId) {}
    fn on_player_spawn(&mut self, gs: &mut GameServer, pid: PlayerId) {
        gs.spawn_player(pid);
    }
    fn update_lb(&mut self, gs: &mut GameServer) {
        ffa_update_lb(gs);
    }
}

/// Used temporarily while `mode` is borrowed for on_tick.
pub struct PlaceholderMode;
impl GameMode for PlaceholderMode {
    fn id(&self) -> i32 {
        -1
    }
    fn name(&self) -> &str {
        ""
    }
}

pub struct FfaMode {
    cfg: ModeConfig,
}

impl FfaMode {
    pub fn new(cfg: ModeConfig) -> Self {
        Self { cfg }
    }
}

impl GameMode for FfaMode {
    fn id(&self) -> i32 {
        self.cfg.id
    }
    fn name(&self) -> &str {
        &self.cfg.name
    }
    fn on_player_spawn(&mut self, gs: &mut GameServer, pid: PlayerId) {
        let color = gs.random_color();
        gs.set_player_color(pid, color);
        gs.spawn_player(pid);
    }
    fn update_lb(&mut self, gs: &mut GameServer) {
        ffa_update_lb(gs);
    }
}

/// Virus Off — FFA with no map viruses; W shoots viruses instead of mass.
pub struct VirusOffMode {
    cfg: ModeConfig,
}

impl VirusOffMode {
    pub fn new(cfg: ModeConfig) -> Self {
        Self { cfg }
    }
}

impl GameMode for VirusOffMode {
    fn id(&self) -> i32 {
        self.cfg.id
    }
    fn name(&self) -> &str {
        &self.cfg.name
    }
    fn on_server_init(&mut self, gs: &mut GameServer) {
        gs.running = true;
        gs.config.virus.spirals = false;
        gs.config.virus.moving = false;
        gs.config.virus.min_amount = 0;
        gs.config.virus.max_amount = 0;
        gs.config.eject.eject_virus = true;
    }
    fn on_player_spawn(&mut self, gs: &mut GameServer, pid: PlayerId) {
        let color = gs.random_color();
        gs.set_player_color(pid, color);
        gs.spawn_player(pid);
    }
    fn update_lb(&mut self, gs: &mut GameServer) {
        ffa_update_lb(gs);
    }
}

/// Experimental / Halloween / Christmas — mother cells, optional beacon + virus theme.
pub struct ExtMode {
    cfg: ModeConfig,
    mother_spawn_interval: u32,
    mother_update_interval: u32,
    tick_mother_spawn: u32,
    tick_mother_update: u32,
    mother_min: u32,
    mother_max: u32,
    beacon: bool,
    beacon_size: f64,
    disable_viruses: bool,
    /// When true, scale food/virus amounts from map size (Halloween/Christmas).
    scale_map_amounts: bool,
}

impl ExtMode {
    pub fn halloween(cfg: ModeConfig) -> Self {
        let h = cfg.halloween.clone();
        Self {
            mother_spawn_interval: h.as_ref().map(|x| x.mother_spawn_interval).unwrap_or(125),
            mother_update_interval: h.as_ref().map(|x| x.mother_update_interval).unwrap_or(5),
            beacon: h.as_ref().map(|x| x.beacon).unwrap_or(true),
            beacon_size: h.as_ref().map(|x| x.beacon_size).unwrap_or(300.0),
            disable_viruses: h.as_ref().map(|x| x.disable_viruses).unwrap_or(false),
            tick_mother_spawn: 0,
            tick_mother_update: 0,
            mother_min: 20,
            mother_max: 30,
            scale_map_amounts: true,
            cfg,
        }
    }

    pub fn christmas(cfg: ModeConfig) -> Self {
        Self::halloween(cfg)
    }

    pub fn experimental(cfg: ModeConfig) -> Self {
        let h = cfg.halloween.clone();
        Self {
            mother_spawn_interval: h.as_ref().map(|x| x.mother_spawn_interval).unwrap_or(125),
            mother_update_interval: h.as_ref().map(|x| x.mother_update_interval).unwrap_or(5),
            beacon: h.as_ref().map(|x| x.beacon).unwrap_or(false),
            beacon_size: h.as_ref().map(|x| x.beacon_size).unwrap_or(300.0),
            disable_viruses: h.as_ref().map(|x| x.disable_viruses).unwrap_or(true),
            tick_mother_spawn: 0,
            tick_mother_update: 0,
            mother_min: 7,
            mother_max: 11,
            scale_map_amounts: false,
            cfg,
        }
    }
}

impl GameMode for ExtMode {
    fn id(&self) -> i32 {
        self.cfg.id
    }
    fn name(&self) -> &str {
        &self.cfg.name
    }

    fn on_server_init(&mut self, gs: &mut GameServer) {
        gs.running = true;
        let map = gs.border.width.max(gs.border.height);

        if self.disable_viruses {
            gs.config.virus.min_amount = 0;
            gs.config.virus.max_amount = 0;
        }

        if self.scale_map_amounts {
            gs.config.food.min_amount = (map / 6.0).ceil() as u32;
            gs.config.food.max_amount = (map / 4.0).ceil() as u32;
            if !self.disable_viruses {
                gs.config.virus.min_amount = (map / 850.0).ceil() as u32;
                gs.config.virus.max_amount = (map / 350.0).ceil() as u32;
            }
            self.mother_min = (map / 2000.0).ceil() as u32;
            self.mother_max = (self.mother_min as f64 * 1.5).ceil() as u32;
            gs.spawn_food_amount(gs.config.food.min_amount.min(500));
            if !self.disable_viruses {
                gs.spawn_virus_amount(gs.config.virus.min_amount.min(30));
            }
        } else {
            self.mother_min = (map / 2000.0).ceil() as u32;
            self.mother_max = (self.mother_min as f64 * 1.5).ceil() as u32;
        }
    }

    fn on_tick(&mut self, gs: &mut GameServer) {
        if self.beacon {
            if gs.beacon_id.is_none() {
                gs.spawn_beacon(self.beacon_size);
            }

            // Reactivate beacon ~20s after zap
            if let Some(bid) = gs.beacon_id {
                let tick = gs.tick;
                if let Some(b) = gs.cells.get_mut(&bid) {
                    if !b.beacon_active && b.stage == 999 && tick.saturating_sub(b.tick_of_birth) > 500
                    {
                        b.stage = 0;
                        b.beacon_active = true;
                        b.tick_of_birth = tick;
                        b.color = crate::protocol::Color {
                            r: gs.config.virus.color_r,
                            g: gs.config.virus.color_g,
                            b: gs.config.virus.color_b,
                        };
                    }
                }
            }
        }

        self.tick_mother_spawn += 1;
        if self.tick_mother_spawn >= self.mother_spawn_interval {
            self.tick_mother_spawn = 0;
            if (gs.mother_ids.len() as u32) < self.mother_min {
                gs.spawn_mother();
            }
        }

        self.tick_mother_update += 1;
        if self.tick_mother_update >= self.mother_update_interval {
            self.tick_mother_update = 0;
            let mothers = gs.mother_ids.clone();
            for id in mothers {
                gs.mother_update(id);
            }
        }
    }

    fn on_player_spawn(&mut self, gs: &mut GameServer, pid: PlayerId) {
        let color = gs.random_color();
        gs.set_player_color(pid, color);
        gs.spawn_player(pid);
    }

    fn update_lb(&mut self, gs: &mut GameServer) {
        ffa_update_lb(gs);
    }
}

fn ffa_update_lb(gs: &mut GameServer) {
    gs.leaderboard_kind = crate::world::LeaderboardKind::Ffa;
    let max = gs.config.server.max_leaderboard as usize;
    let mut scored: Vec<(PlayerId, f64)> = gs
        .players
        .iter()
        .filter(|(_, p)| !p.is_mi && !p.cells.is_empty() && !p.is_removed)
        .map(|(id, p)| (*id, p.score))
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(max);
    gs.leaderboard = scored.into_iter().map(|(id, _)| id).collect();
    gs.team_scores.clear();
}

/// Classic 3-color Teams — pie leaderboard (opcode 0x32).
pub struct TeamsMode {
    cfg: ModeConfig,
    team_amount: usize,
    color_fuzziness: u8,
    colors: [(u8, u8, u8); 3],
}

impl TeamsMode {
    pub fn new(cfg: ModeConfig) -> Self {
        let n = cfg.teams.max(1).min(3) as usize;
        Self {
            team_amount: n,
            color_fuzziness: 32,
            colors: [(223, 0, 0), (0, 223, 0), (0, 0, 223)],
            cfg,
        }
    }

    fn fuzz(&self, component: u8) -> u8 {
        let mut rng = rand::rng();
        // Match JS: component += Math.random() * fuzziness >> 0
        let add = (rng.random::<f64>() * self.color_fuzziness as f64) as u8;
        component.saturating_add(add)
    }

    fn team_color(&self, team: i32) -> crate::protocol::Color {
        let idx = (team.rem_euclid(self.team_amount as i32)) as usize;
        let (r, g, b) = self.colors[idx.min(2)];
        crate::protocol::Color {
            r: self.fuzz(r),
            g: self.fuzz(g),
            b: self.fuzz(b),
        }
    }
}

impl GameMode for TeamsMode {
    fn id(&self) -> i32 {
        self.cfg.id
    }
    fn name(&self) -> &str {
        &self.cfg.name
    }

    fn on_server_init(&mut self, gs: &mut GameServer) {
        gs.running = true;
        gs.leaderboard_kind = crate::world::LeaderboardKind::Team;
        gs.team_scores = vec![0.0; self.team_amount];
        // Assign teams to anyone already connected
        let pids: Vec<PlayerId> = gs.players.keys().copied().collect();
        for pid in pids {
            self.on_player_init(gs, pid);
            let color = gs
                .players
                .get(&pid)
                .map(|p| self.team_color(p.team))
                .unwrap_or(crate::protocol::Color { r: 200, g: 0, b: 0 });
            gs.set_player_color(pid, color);
        }
    }

    fn on_player_init(&mut self, gs: &mut GameServer, pid: PlayerId) {
        let (is_mi, owner_id) = match gs.players.get(&pid) {
            Some(p) => (p.is_mi, p.owner_id),
            None => return,
        };
        let team = if is_mi {
            owner_id
                .and_then(|oid| gs.players.get(&oid).map(|o| o.team))
                .unwrap_or(0)
        } else {
            let mut rng = rand::rng();
            rng.random_range(0..self.team_amount as i32)
        };
        if let Some(p) = gs.players.get_mut(&pid) {
            p.team = team;
        }
    }

    fn on_player_spawn(&mut self, gs: &mut GameServer, pid: PlayerId) {
        let team = gs.players.get(&pid).map(|p| p.team).unwrap_or(0);
        let color = self.team_color(team);
        gs.set_player_color(pid, color);
        gs.spawn_player(pid);
    }

    fn update_lb(&mut self, gs: &mut GameServer) {
        gs.leaderboard_kind = crate::world::LeaderboardKind::Team;
        gs.leaderboard.clear();
        let n = self.team_amount;
        let mut mass = vec![0.0_f64; n];
        let mut total = 0.0_f64;
        for p in gs.players.values() {
            if p.is_removed || p.cells.is_empty() {
                continue;
            }
            let t = p.team.rem_euclid(n as i32) as usize;
            for &cid in &p.cells {
                if let Some(c) = gs.cells.get(&cid) {
                    if !c.is_removed {
                        let m = c.mass();
                        mass[t] += m;
                        total += m;
                    }
                }
            }
        }
        gs.team_scores = if total <= 0.0 {
            vec![0.0; n]
        } else {
            mass.iter().map(|m| (m / total) as f32).collect()
        };
    }
}

pub fn create_mode(cfg: &ModeConfig) -> Box<dyn GameMode> {
    match cfg.id {
        1 => Box::new(TeamsMode::new(cfg.clone())),
        2 => Box::new(ExtMode::experimental(cfg.clone())),
        3 => Box::new(ExtMode::halloween(cfg.clone())),
        4 => Box::new(ExtMode::christmas(cfg.clone())),
        15 => Box::new(VirusOffMode::new(cfg.clone())),
        _ => Box::new(FfaMode::new(cfg.clone())),
    }
}
