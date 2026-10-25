use anyhow::{Context, Result};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerSection,
    pub world: WorldSection,
    pub food: FoodSection,
    pub virus: VirusSection,
    pub player: PlayerSection,
    pub eject: EjectSection,
    #[serde(default)]
    pub minions: MinionSection,
    #[serde(default)]
    pub surprise: SurpriseSection,
    #[serde(default)]
    pub bots: BotsSection,
    #[serde(default)]
    pub tracker: TrackerSection,
    #[serde(default)]
    pub mysql: MysqlSection,
    pub scores: ScoresSection,
    #[serde(skip)]
    pub mode: ModeConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerSection {
    pub name: String,
    pub welcome1: String,
    pub welcome2: String,
    pub port: u16,
    /// Optional HTTP stats/scores port (0 = disabled). Keep off the game WS port.
    #[serde(default = "default_http_port")]
    pub http_port: u16,
    /// Optional TLS / WSS port for HTTPS-hosted web clients (0 = disabled).
    /// Browser blocks ws:// from https:// pages — use wss://your.domain:8443 instead.
    #[serde(default = "default_tls_port")]
    pub tls_port: u16,
    /// Directory for WSS PEM files (default `data/tls`). Symlink Let's Encrypt here.
    #[serde(default = "default_tls_dir")]
    pub tls_dir: String,
    /// Cert file name inside tls_dir — Let's Encrypt `fullchain.pem` (not leaf-only cert.pem).
    #[serde(default = "default_tls_cert")]
    pub tls_cert: String,
    /// Key file name inside tls_dir — Let's Encrypt `privkey.pem`.
    #[serde(default = "default_tls_key")]
    pub tls_key: String,
    pub rcon_port: i32,
    pub max_connections: u32,
    pub ip_limit: u32,
    pub timeout_secs: u64,
    pub chat: bool,
    pub scramble_level: u8,
    pub max_leaderboard: u32,
    /// Legacy: if `[bots]` is absent, `server.bots` (≥0) seeds `bots.count`.
    #[serde(default = "default_legacy_bots")]
    pub bots: i32,
    pub protocol: u32,
    pub mode: String,
}

fn default_legacy_bots() -> i32 {
    -1
}

#[derive(Debug, Clone, Deserialize)]
pub struct BotsSection {
    /// Target bot count (-1 = off). Node-style: spawn/respawn only while
    /// humans < count and bots < count; do not cull bots when humans exceed count.
    #[serde(default = "default_bot_count")]
    pub count: i32,
    /// Pattern: `{n}` = 1-based index, `{name}` = from names file / Bot{n}
    #[serde(default = "default_bot_name")]
    pub name: String,
    /// Optional names list (one per line), relative to config dir or cwd
    #[serde(default = "default_bot_names_file")]
    pub names_file: String,
    /// AI thinks every N world ticks (2 ≈ 80ms). Decisions run off the game lock.
    #[serde(default = "default_bot_think")]
    pub think_interval: u32,
    /// When no humans are playing, freeze the world and keep bots small (JS behavior)
    #[serde(default = "default_true")]
    pub idle_when_empty: bool,
}

fn default_bot_count() -> i32 {
    -1
}
fn default_bot_name() -> String {
    "[BOT] {name}".into()
}
fn default_bot_names_file() -> String {
    "botnames.txt".into()
}
fn default_bot_think() -> u32 {
    2
}
fn default_true() -> bool {
    true
}

impl Default for BotsSection {
    fn default() -> Self {
        Self {
            count: -1,
            name: default_bot_name(),
            names_file: default_bot_names_file(),
            think_interval: default_bot_think(),
            idle_when_empty: true,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorldSection {
    pub border_width: f64,
    pub border_height: f64,
    pub tick_ms: u64,
    pub view_base_x: f64,
    pub view_base_y: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FoodSection {
    pub min_size: f64,
    pub max_size: f64,
    pub min_amount: u32,
    pub max_amount: u32,
    pub spawn_amount: u32,
    pub spawn_interval_ticks: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VirusSection {
    pub min_size: f64,
    pub max_size: f64,
    pub min_amount: u32,
    pub max_amount: u32,
    #[serde(default)]
    pub spirals: bool,
    #[serde(default)]
    pub moving: bool,
    pub color_r: u8,
    pub color_g: u8,
    pub color_b: u8,
    #[serde(default)]
    pub push_on_eat: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlayerSection {
    pub min_size: f64,
    pub max_size: f64,
    pub min_split_size: f64,
    pub start_size: f64,
    pub max_cells: u32,
    pub speed: f64,
    pub decay_rate: f64,
    pub recombine_time: f64,
    pub max_nick_length: usize,
    pub disconnect_time: f64,
    #[serde(default)]
    pub bot_grow: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EjectSection {
    pub size: f64,
    pub size_loss: f64,
    pub distance: f64,
    pub cooldown_ticks: u32,
    /// When true, W shoots a virus instead of ejected mass (Virus Off mode).
    #[serde(default)]
    pub eject_virus: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MinionSection {
    /// Auto-give this many minions when a human spawns (0 = off; use console `minion`)
    #[serde(default)]
    pub per_player: u32,
    #[serde(default = "default_minion_size")]
    pub start_size: f64,
    #[serde(default = "default_minion_name")]
    pub default_name: String,
    #[serde(default)]
    pub collect_pellets: bool,
}

fn default_minion_size() -> f64 {
    32.0
}
fn default_minion_name() -> String {
    "minion".into()
}

impl Default for MinionSection {
    fn default() -> Self {
        Self {
            per_player: 0,
            start_size: 32.0,
            default_name: "minion".into(),
            collect_pellets: false,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct SurpriseSection {
    /// How many SurpriseCells to keep on the map (0 = disabled)
    #[serde(default)]
    pub amount: u32,
    #[serde(default = "default_surprise_size")]
    pub size: f64,
}

fn default_surprise_size() -> f64 {
    75.0
}

impl Default for SurpriseSection {
    fn default() -> Self {
        Self {
            amount: 0,
            size: 75.0,
        }
    }
}

/// MivaBe-style master list alive ping (`POST` JSON → masterjs.php).
#[derive(Debug, Clone, Deserialize)]
pub struct TrackerSection {
    /// Set true to show this server on the master list (port must be reachable).
    #[serde(default)]
    pub enabled: bool,
    /// Full URL of the master endpoint (JS hardcodes http://ogar.mivabe.nl/masterjs.php).
    #[serde(default = "default_tracker_url")]
    pub url: String,
    /// Client website listed on the tracker, without `http://` (JS `serverURL`).
    #[serde(default)]
    pub server_url: String,
    /// Seconds between pings when anyone is connected (JS comment / intended ~30s).
    #[serde(default = "default_tracker_interval")]
    pub interval_secs: u64,
    /// Seconds between pings when the server is empty (JS comment: ~5 min).
    #[serde(default = "default_tracker_empty_interval")]
    pub empty_interval_secs: u64,
}

impl Default for TrackerSection {
    fn default() -> Self {
        Self {
            enabled: false,
            url: default_tracker_url(),
            server_url: String::new(),
            interval_secs: default_tracker_interval(),
            empty_interval_secs: default_tracker_empty_interval(),
        }
    }
}

fn default_tracker_url() -> String {
    "http://ogar.mivabe.nl/masterjs.php".into()
}
fn default_tracker_interval() -> u64 {
    30
}
fn default_tracker_empty_interval() -> u64 {
    300
}

/// Optional MySQL high scores (JS `mysql.ini` / `sqlconfig`). Empty `host` = disabled.
/// Connects only when a score is written — no keep-alive ping.
#[derive(Debug, Clone, Deserialize)]
pub struct MysqlSection {
    /// MySQL host, or `host:port`. Empty disables MySQL.
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_mysql_port")]
    pub port: u16,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub database: String,
    /// Base table name; also writes to `{table}all` (JS createTable / writeScore).
    #[serde(default = "default_mysql_table")]
    pub table: String,
}

impl Default for MysqlSection {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: default_mysql_port(),
            user: String::new(),
            password: String::new(),
            database: String::new(),
            table: default_mysql_table(),
        }
    }
}

impl MysqlSection {
    pub fn enabled(&self) -> bool {
        !self.host.trim().is_empty()
            && !self.user.is_empty()
            && !self.database.is_empty()
            && !self.table.is_empty()
    }

    /// Split optional `host:port` from `host`, falling back to `port`.
    pub fn host_and_port(&self) -> (String, u16) {
        let h = self.host.trim();
        if let Some((host, port_s)) = h.rsplit_once(':') {
            if !host.is_empty() && !host.contains(':') {
                if let Ok(p) = port_s.parse::<u16>() {
                    return (host.to_string(), p);
                }
            }
        }
        (h.to_string(), self.port)
    }
}

fn default_mysql_port() -> u16 {
    3306
}
fn default_mysql_table() -> String {
    "score".into()
}

#[derive(Debug, Clone, Deserialize)]
pub struct ScoresSection {
    pub path: PathBuf,
    pub max_entries_per_mode: usize,
    #[serde(default = "default_min_score")]
    pub min_score_to_save: u64,
}

fn default_min_score() -> u64 {
    500
}

fn default_http_port() -> u16 {
    0
}

fn default_tls_port() -> u16 {
    8443
}
fn default_tls_dir() -> String {
    "data/tls".into()
}
fn default_tls_cert() -> String {
    "fullchain.pem".into()
}
fn default_tls_key() -> String {
    "privkey.pem".into()
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModeConfig {
    pub id: i32,
    pub name: String,
    pub decay_mod: f64,
    pub leaderboard: String,
    pub have_teams: bool,
    pub teams: u32,
    #[serde(default)]
    pub spec_by_leaderboard: bool,
    #[serde(default)]
    pub spawn: ModeSpawn,
    #[serde(default)]
    pub rules: ModeRules,
    #[serde(default)]
    pub halloween: Option<HalloweenModeCfg>,
    /// Optional override: SurpriseCell count for this mode
    #[serde(default)]
    pub surprise_amount: Option<u32>,
    /// Optional override: auto minions per player for this mode
    #[serde(default)]
    pub minions_per_player: Option<u32>,
}

impl Default for ModeConfig {
    fn default() -> Self {
        Self {
            id: 0,
            name: "Free For All".into(),
            decay_mod: 1.0,
            leaderboard: "list".into(),
            have_teams: false,
            teams: 0,
            spec_by_leaderboard: true,
            spawn: ModeSpawn::default(),
            rules: ModeRules::default(),
            halloween: None,
            surprise_amount: None,
            minions_per_player: None,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ModeSpawn {
    pub player_start_size: Option<f64>,
    pub food_min_amount: Option<u32>,
    pub virus_min_amount: Option<u32>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ModeRules {
    pub player_recombine_time: Option<f64>,
}

/// Shared options for Experimental / Halloween / Christmas (mother cells ± beacon).
#[derive(Debug, Clone, Deserialize)]
pub struct HalloweenModeCfg {
    #[serde(default = "default_true")]
    pub virus_spirals: bool,
    #[serde(default = "default_true")]
    pub virus_moving: bool,
    #[serde(default = "default_true")]
    pub virus_push_on_eat: bool,
    #[serde(default = "default_vr")]
    pub virus_color_r: u8,
    #[serde(default = "default_vg")]
    pub virus_color_g: u8,
    #[serde(default = "default_vb")]
    pub virus_color_b: u8,
    #[serde(default = "default_msi")]
    pub mother_spawn_interval: u32,
    #[serde(default = "default_mui")]
    pub mother_update_interval: u32,
    /// Halloween / Christmas keep a center beacon; Experimental does not.
    #[serde(default = "default_true")]
    pub beacon: bool,
    #[serde(default = "default_beacon")]
    pub beacon_size: f64,
    /// Experimental: no static viruses (mothers only).
    #[serde(default)]
    pub disable_viruses: bool,
}

fn default_vr() -> u8 {
    230
}
fn default_vg() -> u8 {
    60
}
fn default_vb() -> u8 {
    10
}
fn default_msi() -> u32 {
    125
}
fn default_mui() -> u32 {
    5
}
fn default_beacon() -> f64 {
    300.0
}

impl AppConfig {
    pub fn load(config_dir: impl AsRef<Path>) -> Result<Self> {
        let config_dir = config_dir.as_ref();
        let server_path = config_dir.join("server.toml");
        let raw = fs::read_to_string(&server_path)
            .with_context(|| format!("reading {}", server_path.display()))?;
        let mut cfg: AppConfig = toml::from_str(&raw)
            .with_context(|| format!("parsing {}", server_path.display()))?;

        let mode_path = config_dir
            .join("modes")
            .join(format!("{}.toml", cfg.server.mode));
        let mode_raw = fs::read_to_string(&mode_path)
            .with_context(|| format!("reading mode {}", mode_path.display()))?;
        cfg.mode = toml::from_str(&mode_raw)
            .with_context(|| format!("parsing mode {}", mode_path.display()))?;

        // Legacy `server.bots` fills [bots].count when section left at default disabled
        if cfg.bots.count < 0 && cfg.server.bots >= 0 {
            cfg.bots.count = cfg.server.bots;
        }

        cfg.apply_mode_overrides();
        Ok(cfg)
    }

    fn apply_mode_overrides(&mut self) {
        if let Some(v) = self.mode.spawn.player_start_size {
            self.player.start_size = v;
        }
        if let Some(v) = self.mode.spawn.food_min_amount {
            self.food.min_amount = v;
        }
        if let Some(v) = self.mode.spawn.virus_min_amount {
            self.virus.min_amount = v;
        }
        if let Some(v) = self.mode.rules.player_recombine_time {
            self.player.recombine_time = v;
        }
        if let Some(ref h) = self.mode.halloween {
            self.virus.spirals = h.virus_spirals;
            self.virus.moving = h.virus_moving;
            self.virus.push_on_eat = h.virus_push_on_eat;
            self.virus.color_r = h.virus_color_r;
            self.virus.color_g = h.virus_color_g;
            self.virus.color_b = h.virus_color_b;
        }
        if let Some(n) = self.mode.surprise_amount {
            self.surprise.amount = n;
        }
        if let Some(n) = self.mode.minions_per_player {
            self.minions.per_player = n;
        }
    }

    pub fn effective_decay(&self) -> f64 {
        self.player.decay_rate * self.mode.decay_mod
    }
}
