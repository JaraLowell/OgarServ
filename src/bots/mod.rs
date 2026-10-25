//! Player bots — AI runs on a dedicated thread; only short lock to snapshot/apply.

use crate::world::cell::{CellType, NodeId, PlayerId, Vec2};
use rand::Rng;
use std::sync::mpsc::{Receiver, SyncSender, TryRecvError, TrySendError};

#[derive(Clone, Debug)]
pub struct SeenNode {
    pub id: NodeId,
    pub cell_type: CellType,
    pub x: f64,
    pub y: f64,
    pub size: f64,
    pub owner: Option<PlayerId>,
    pub team: i32,
    pub is_mother: bool,
}

#[derive(Clone, Debug)]
pub struct BotSnapshot {
    pub pid: PlayerId,
    pub cell_x: f64,
    pub cell_y: f64,
    pub cell_size: f64,
    pub cell_count: usize,
    pub max_cells: usize,
    pub split_cd: u32,
    pub wander: Option<Vec2>,
    pub nearby: Vec<SeenNode>,
    pub humans_online: bool,
    pub have_teams: bool,
    pub team: i32,
}

#[derive(Clone, Debug)]
pub struct BotIntent {
    pub pid: PlayerId,
    pub mouse: Vec2,
    pub split: bool,
    pub wander: Option<Vec2>,
    pub split_cd: u32,
}

/// Blocking AI worker — never touches GameServer.
pub fn run_ai_worker(snap_rx: Receiver<Vec<BotSnapshot>>, intent_tx: SyncSender<Vec<BotIntent>>) {
    while let Ok(snaps) = snap_rx.recv() {
        let intents: Vec<BotIntent> = snaps.iter().map(decide).collect();
        match intent_tx.try_send(intents) {
            Ok(()) | Err(TrySendError::Full(_)) => {}
            Err(TrySendError::Disconnected(_)) => break,
        }
    }
}

fn decide(snap: &BotSnapshot) -> BotIntent {
    let mut rng = rand::rng();
    let mut split_cd = snap.split_cd.saturating_sub(1);

    // Idle: no humans — drift slowly, no splits (JS pauses aggression)
    if !snap.humans_online {
        let wander = snap.wander.unwrap_or(Vec2::new(snap.cell_x, snap.cell_y));
        return BotIntent {
            pid: snap.pid,
            mouse: wander,
            split: false,
            wander: Some(wander),
            split_cd,
        };
    }

    let cell_pos = Vec2::new(snap.cell_x, snap.cell_y);
    let mut force_x = 0.0;
    let mut force_y = 0.0;
    let mut split_target: Option<Vec2> = None;

    for n in &snap.nearby {
        if n.owner == Some(snap.pid) {
            continue;
        }
        let dx = n.x - snap.cell_x;
        let dy = n.y - snap.cell_y;
        let dist = (dx * dx + dy * dy).sqrt().max(1.0);

        let influence = match n.cell_type {
            CellType::Player => {
                if snap.have_teams && n.team == snap.team {
                    0.0 // same team — ignore (JS BotPlayer)
                } else if snap.cell_size > n.size * 1.15 {
                    // Prey — stronger pull when close / bigger meal
                    n.size * 2.8 * (1.0 + (400.0 / dist).min(2.0))
                } else if n.size > snap.cell_size * 1.15 {
                    // Predator — flee harder when close
                    let threat = n.size / snap.cell_size.max(1.0);
                    -n.size * (1.2 + threat) * (1.0 + (500.0 / dist).min(3.0))
                } else {
                    -(n.size / snap.cell_size.max(1.0)) / 2.5
                }
            }
            CellType::Food => {
                // Prefer nearby pellets when small
                let hunger = (80.0 / snap.cell_size.max(20.0)).clamp(0.6, 3.0);
                1.2 * hunger
            }
            CellType::Virus | CellType::Beacon => {
                if snap.cell_size > n.size * 1.15 {
                    if snap.cell_count >= snap.max_cells {
                        n.size * 2.5
                    } else {
                        -2.5 // avoid pop-split
                    }
                } else if n.is_mother && n.size > snap.cell_size * 1.15 {
                    -3.0
                } else {
                    0.0
                }
            }
            CellType::Ejected => {
                if snap.cell_size > n.size * 1.15 {
                    n.size * 1.2
                } else {
                    0.0
                }
            }
            CellType::Surprise => {
                // Mild curiosity — can be lucky or unlucky
                if snap.cell_size > n.size * 1.15 {
                    n.size * 0.8
                } else {
                    -0.5
                }
            }
        };

        if influence.abs() < 1e-6 {
            continue;
        }

        let inv = influence / dist;
        let nx = dx / dist;
        let ny = dy / dist;
        force_x += nx * inv;
        force_y += ny * inv;

        // Split-kill: edible player, in range, safe-ish
        if n.cell_type == CellType::Player
            && snap.cell_size > n.size * 1.15
            && split_cd == 0
            && snap.cell_count < 8
            && snap.cell_count < snap.max_cells
        {
            let reach = 820.0 - snap.cell_size / 2.0 - n.size;
            if dist <= reach && influence > 0.0 {
                // Don't split into a bigger threat nearby
                let danger = snap.nearby.iter().any(|t| {
                    t.cell_type == CellType::Player
                        && t.owner != Some(snap.pid)
                        && t.size > snap.cell_size * 0.9
                        && {
                            let tdx = t.x - n.x;
                            let tdy = t.y - n.y;
                            (tdx * tdx + tdy * tdy).sqrt() < snap.cell_size * 4.0
                        }
                });
                if !danger {
                    split_target = Some(Vec2::new(n.x, n.y));
                }
            }
        }
    }

    if let Some(target) = split_target {
        split_cd = 15;
        return BotIntent {
            pid: snap.pid,
            mouse: target,
            split: true,
            wander: None,
            split_cd,
        };
    }

    let flen = (force_x * force_x + force_y * force_y).sqrt();
    if flen < 1e-4 {
        // Wander
        let mut wander = snap.wander;
        if wander.is_none() || rng.random::<f64>() < 0.08 {
            wander = Some(Vec2::new(
                snap.cell_x + (rng.random::<f64>() - 0.5) * 4000.0,
                snap.cell_y + (rng.random::<f64>() - 0.5) * 4000.0,
            ));
        }
        let w = wander.unwrap();
        return BotIntent {
            pid: snap.pid,
            mouse: w,
            split: false,
            wander: Some(w),
            split_cd,
        };
    }

    force_x /= flen;
    force_y /= flen;
    BotIntent {
        pid: snap.pid,
        mouse: Vec2::new(cell_pos.x + force_x * 900.0, cell_pos.y + force_y * 900.0),
        split: false,
        wander: None,
        split_cd,
    }
}

pub fn try_recv_intents(rx: &Receiver<Vec<BotIntent>>) -> Option<Vec<BotIntent>> {
    match rx.try_recv() {
        Ok(v) => Some(v),
        Err(TryRecvError::Empty) => None,
        Err(TryRecvError::Disconnected) => None,
    }
}
