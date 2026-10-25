use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreBoard {
    pub updated_at: Option<DateTime<Utc>>,
    pub entries: Vec<ScoreEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreEntry {
    pub name: String,
    #[serde(default)]
    pub skin: String,
    pub score: u64,
    pub mode: String,
    #[serde(default)]
    pub foodeat: u32,
    #[serde(default)]
    pub playereat: u32,
    #[serde(default)]
    pub viruseat: u32,
    #[serde(default)]
    pub surpeat: u32,
    pub play_seconds: u64,
    pub at: DateTime<Utc>,
}

impl Default for ScoreBoard {
    fn default() -> Self {
        Self {
            updated_at: None,
            entries: Vec::new(),
        }
    }
}

pub struct ScoreStore {
    path: PathBuf,
    max_per_mode: usize,
    board: ScoreBoard,
}

impl ScoreStore {
    pub fn open(path: impl AsRef<Path>, max_per_mode: usize) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let board = if path.exists() {
            let raw = fs::read_to_string(&path)
                .with_context(|| format!("reading scores {}", path.display()))?;
            serde_json::from_str(&raw).unwrap_or_else(|e| {
                warn!("corrupt highscores, starting empty: {e}");
                ScoreBoard::default()
            })
        } else {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            ScoreBoard::default()
        };
        Ok(Self {
            path,
            max_per_mode,
            board,
        })
    }

    pub fn board(&self) -> &ScoreBoard {
        &self.board
    }

    pub fn board_mut(&mut self) -> &mut ScoreBoard {
        &mut self.board
    }

    pub fn record(&mut self, entry: ScoreEntry) -> Result<()> {
        let mode = entry.mode.clone();
        info!(name = %entry.name, score = entry.score, mode = %mode, "high score");
        self.board.entries.push(entry);
        self.trim_mode(&mode);
        self.board.updated_at = Some(Utc::now());
        self.flush()
    }

    fn trim_mode(&mut self, mode: &str) {
        let mut indexed: Vec<(usize, u64)> = self
            .board
            .entries
            .iter()
            .enumerate()
            .filter(|(_, e)| e.mode == mode)
            .map(|(i, e)| (i, e.score))
            .collect();
        indexed.sort_by(|a, b| b.1.cmp(&a.1));
        if indexed.len() <= self.max_per_mode {
            return;
        }
        let mut drop: Vec<usize> = indexed
            .into_iter()
            .skip(self.max_per_mode)
            .map(|(i, _)| i)
            .collect();
        drop.sort_unstable_by(|a, b| b.cmp(a));
        for i in drop {
            self.board.entries.remove(i);
        }
    }

    fn flush(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(&self.board)?;
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}
