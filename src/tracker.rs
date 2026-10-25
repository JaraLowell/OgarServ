//! Master-server alive ping (same JSON as Node `GameServer.pingServerTracker`).

use crate::world::GameServer;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, warn};

#[derive(Debug, Serialize)]
struct TrackerPayload<'a> {
    players: u32,
    alive: u32,
    spectators: u32,
    maxplayers: u32,
    port: u16,
    gamemode: &'a str,
    protocol: u32,
    name: &'a str,
    url: &'a str,
    opp: String,
    uptime: u64,
    version: String,
    starttime: u64,
}

impl GameServer {
    /// If tracker is due, return `(url, json body)` and advance the schedule.
    /// Caller should POST without holding the game lock.
    pub fn take_tracker_ping(&mut self) -> Option<(String, String)> {
        if !self.config.tracker.enabled || self.config.tracker.url.is_empty() {
            return None;
        }
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        if now_ms < self.tracker_next_ms {
            return None;
        }

        let url = self.config.tracker.url.clone();
        let server_url = self.config.tracker.server_url.clone();
        let interval_secs = self.config.tracker.interval_secs;
        let empty_interval_secs = self.config.tracker.empty_interval_secs;
        let name = self.config.server.name.clone();
        let maxplayers = self.config.server.max_connections;
        let port = self.config.server.port;

        // Refresh counts so the ping matches current lobby state
        self.refresh_sinfo();

        let interval_ms = if self.sinfo_players == 0 {
            empty_interval_secs.saturating_mul(1000)
        } else {
            interval_secs.saturating_mul(1000)
        }
        .max(1000);
        self.tracker_next_ms = now_ms.saturating_add(interval_ms);

        let gamemode = self.mode.name().to_string();
        let payload = TrackerPayload {
            players: self.sinfo_players,
            alive: self.sinfo_humans,
            spectators: self.sinfo_spectate,
            maxplayers,
            port,
            gamemode: &gamemode,
            // JS sends 100 (= “all protocols”)
            protocol: 100,
            name: &name,
            url: &server_url,
            opp: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
            uptime: self.started.elapsed().as_secs(),
            version: format!("OgarServ {}", env!("CARGO_PKG_VERSION")),
            starttime: self.start_unix_ms,
        };

        let body = serde_json::to_string(&payload).ok()?;
        Some((url, body))
    }
}

pub async fn post_tracker_ping(url: String, body: String) {
    // Bind to 0.0.0.0 so the outbound socket is IPv4-only. Dual-stack hosts
    // otherwise often pick AAAA and the master tracker never sees a usable IPv4.
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .local_address(std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            warn!(error = %e, "tracker client build failed");
            return;
        }
    };
    match client
        .post(&url)
        .header("Content-Type", "application/json;charset=UTF-8")
        .body(body)
        .send()
        .await
    {
        Ok(resp) => {
            debug!(%url, status = %resp.status(), "tracker ping sent");
        }
        Err(e) => {
            warn!(%url, error = %e, "tracker ping failed");
        }
    }
}
