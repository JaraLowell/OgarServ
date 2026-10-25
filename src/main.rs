#![allow(dead_code)]

mod bots;
mod config;
mod console;
mod modes;
mod net;
mod player;
mod protocol;
mod scores;
mod tracker;
mod world;

use crate::config::AppConfig;
use crate::console::run_console;
use crate::modes::create_mode;
use crate::net::run_ws_server;
use crate::scores::ScoreStore;
use crate::world::{run_tick_loop, GameServer};
use std::env;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // rustls 0.23 needs an explicit process-level crypto provider
    let _ = rustls::crypto::ring::default_provider().install_default();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config_dir = resolve_config_dir();
    info!(path = %config_dir.display(), "loading config");

    let cfg = AppConfig::load(&config_dir)?;
    info!(
        name = %cfg.server.name,
        mode = %cfg.mode.name,
        port = cfg.server.port,
        "OgarServ Rust starting"
    );

    // Initial world fill for FFA
    let scores = ScoreStore::open(&cfg.scores.path, cfg.scores.max_entries_per_mode)?;
    info!(
        path = %cfg.scores.path.display(),
        entries = scores.board().entries.len(),
        "high scores loaded"
    );

    let mode = create_mode(&cfg.mode);
    let mut server = GameServer::new(cfg, scores, mode);
    // Halloween / Christmas seed food+virus in on_server_init; others use defaults here.
    if !matches!(server.mode.id(), 3 | 4) {
        server.spawn_food_amount(server.config.food.min_amount.min(800));
        if server.config.virus.min_amount > 0 {
            server.spawn_virus_amount(server.config.virus.min_amount.min(40));
        }
    }
    server.rebuild_quad();

    let server = Arc::new(Mutex::new(server));
    let tick_server = server.clone();
    tokio::spawn(async move {
        run_tick_loop(tick_server).await;
    });
    let console_server = server.clone();
    tokio::spawn(async move {
        run_console(console_server).await;
    });

    run_ws_server(server).await
}

fn resolve_config_dir() -> PathBuf {
    if let Ok(p) = env::var("OGAR_CONFIG") {
        return PathBuf::from(p);
    }
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let local = cwd.join("config");
    if local.is_dir() {
        return local;
    }
    let alt = cwd.join("ogar-rs").join("config");
    if alt.is_dir() {
        return alt;
    }
    local
}
