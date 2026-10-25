//! Interactive terminal admin (replaces RCon for local ops).

use crate::world::GameServer;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;
use tracing::info;

pub async fn run_console(server: Arc<Mutex<GameServer>>) {
    info!("terminal console ready — type `help`");
    let stdin = BufReader::new(tokio::io::stdin());
    let mut lines = stdin.lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        let mut gs = server.lock().await;
        dispatch(&mut gs, &line);
    }
}

fn dispatch(gs: &mut GameServer, line: &str) {
    let parts: Vec<&str> = line.split_whitespace().collect();
    let cmd = parts.first().copied().unwrap_or("").to_lowercase();
    match cmd.as_str() {
        "help" | "?" => {
            println!(
                "Commands:
  help                         This list
  status                       Tick / players / food / virus / surprise
  playerlist | pl              Connected players
  minion | mn <id> [n] [name]  Add n minions (default 1); omit n to remove
  addbot [n]                   Spawn n bots (default 1); raises bots.count
  kickbot [n]                  Remove n bots (default all)
  kick <id>                    Disconnect player
  kill <id>                    Kill player cells
  killall                      Kill all player cells
  mass <id> <size>             Set all cells of player to size
  pause                        Toggle physics pause
  exit | quit                  Shut down server"
            );
        }
        "status" => {
            let humans = gs
                .players
                .values()
                .filter(|p| !p.is_mi && !p.is_bot && p.tx.is_some())
                .count();
            let bots = gs.bot_count();
            let minions = gs.players.values().filter(|p| p.is_mi).count();
            println!(
                "tick={} paused={} humans={} bots={} minions={} food={} virus={} surprise={} cells={}",
                gs.tick,
                gs.paused,
                humans,
                bots,
                minions,
                gs.current_food,
                gs.virus_count,
                gs.surprise_count,
                gs.cells.len()
            );
        }
        "playerlist" | "pl" => {
            println!(
                "{:>4}  {:>6}  {:<16}  cells  score  ip",
                "id", "type", "name"
            );
            let mut rows: Vec<_> = gs.players.values().collect();
            rows.sort_by_key(|p| p.id);
            for p in rows {
                let kind = if p.is_mi {
                    "minion"
                } else if p.is_bot {
                    "bot"
                } else {
                    "human"
                };
                println!(
                    "{:>4}  {:>6}  {:<16}  {:>5}  {:>5}  {}",
                    p.id,
                    kind,
                    if p.name.is_empty() { "-" } else { &p.name },
                    p.cells.len(),
                    (p.score / 100.0) as u64,
                    p.ip
                );
            }
        }
        "addbot" => {
            let n: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);
            if gs.config.bots.count < 0 {
                gs.config.bots.count = 0;
            }
            for _ in 0..n {
                gs.add_bot();
            }
            gs.config.bots.count = gs.config.bots.count.max(gs.bot_count() as i32);
            println!("bots now {}", gs.bot_count());
        }
        "kickbot" => {
            let n: Option<usize> = parts.get(1).and_then(|s| s.parse().ok());
            let mut bots: Vec<_> = gs
                .players
                .iter()
                .filter(|(_, p)| p.is_bot)
                .map(|(id, _)| *id)
                .collect();
            let remove = n.unwrap_or(bots.len());
            for id in bots.drain(..remove.min(bots.len())) {
                gs.remove_player_fully(id);
            }
            gs.config.bots.count = gs.bot_count() as i32;
            println!("bots now {}", gs.bot_count());
        }
        "minion" | "mn" => {
            let id: u32 = match parts.get(1).and_then(|s| s.parse().ok()) {
                Some(v) => v,
                None => {
                    println!("usage: minion <playerId> [count] [name]");
                    return;
                }
            };
            if !gs.players.contains_key(&id) || gs.players.get(&id).map(|p| p.is_mi).unwrap_or(true)
            {
                println!("player {id} not found");
                return;
            }
            let count_arg = parts.get(2).and_then(|s| s.parse::<u32>().ok());
            if count_arg.is_none() && parts.get(2).is_none() {
                // remove
                gs.remove_minions_for(id);
                println!("removed minions for {id}");
                return;
            }
            let n = count_arg.unwrap_or(1);
            let name = if count_arg.is_some() {
                parts.get(3..).map(|s| s.join(" ")).unwrap_or_default()
            } else {
                parts.get(2..).map(|s| s.join(" ")).unwrap_or_default()
            };
            if let Some(p) = gs.players.get_mut(&id) {
                p.minion_control = true;
            }
            for _ in 0..n {
                gs.add_minion(id, &name);
            }
            println!("added {n} minion(s) for {id}");
        }
        "kick" => {
            let id: u32 = match parts.get(1).and_then(|s| s.parse().ok()) {
                Some(v) => v,
                None => {
                    println!("usage: kick <id>");
                    return;
                }
            };
            if gs.players.contains_key(&id) {
                gs.remove_player_fully(id);
                println!("kicked {id}");
            } else {
                println!("no such player");
            }
        }
        "kill" => {
            let id: u32 = match parts.get(1).and_then(|s| s.parse().ok()) {
                Some(v) => v,
                None => {
                    println!("usage: kill <id>");
                    return;
                }
            };
            let cells = gs
                .players
                .get(&id)
                .map(|p| p.cells.clone())
                .unwrap_or_default();
            for cid in cells {
                gs.remove_cell(cid);
            }
            println!("killed cells of {id}");
        }
        "killall" => {
            let cells: Vec<_> = gs
                .cells
                .values()
                .filter(|c| c.cell_type == crate::world::cell::CellType::Player && !c.is_removed)
                .map(|c| c.node_id)
                .collect();
            for cid in cells {
                gs.remove_cell(cid);
            }
            println!("killed all player cells");
        }
        "mass" => {
            let id: u32 = match parts.get(1).and_then(|s| s.parse().ok()) {
                Some(v) => v,
                None => {
                    println!("usage: mass <id> <size>");
                    return;
                }
            };
            let size: f64 = match parts.get(2).and_then(|s| s.parse().ok()) {
                Some(v) => v,
                None => {
                    println!("usage: mass <id> <size>");
                    return;
                }
            };
            let cells = gs
                .players
                .get(&id)
                .map(|p| p.cells.clone())
                .unwrap_or_default();
            for cid in cells {
                if let Some(c) = gs.cells.get_mut(&cid) {
                    c.set_size(size);
                }
            }
            println!("set mass/size for {id}");
        }
        "pause" => {
            gs.paused = !gs.paused;
            println!("paused = {}", gs.paused);
        }
        "exit" | "quit" => {
            println!("shutting down…");
            gs.running = false;
            std::process::exit(0);
        }
        other => println!("unknown command `{other}` — try `help`"),
    }
}
