//! MySQL high scores — same tables/columns as Node `modules/mysql.js` writeScore.
//! Connect only when writing a score (no persistent connection / ping).

use crate::config::MysqlSection;
use crate::scores::ScoreEntry;
use mysql::prelude::*;
use mysql::{OptsBuilder, Pool};
use tracing::{debug, info, warn};

/// Fire-and-forget score write on a blocking pool thread.
pub fn spawn_write(cfg: MysqlSection, entry: ScoreEntry, ip: String) {
    if !cfg.enabled() {
        return;
    }
    tokio::task::spawn_blocking(move || {
        if let Err(e) = write_score(&cfg, &entry, &ip) {
            warn!(
                name = %entry.name,
                score = entry.score,
                error = %e,
                "mysql score write failed"
            );
        }
    });
}

fn write_score(cfg: &MysqlSection, entry: &ScoreEntry, ip: &str) -> anyhow::Result<()> {
    let (host, port) = cfg.host_and_port();
    // mysqld often binds only 127.0.0.1:3306. Resolving "localhost" can hit ::1 first
    // → connection refused. Force IPv4 loopback for local hosts.
    let host = if host.eq_ignore_ascii_case("localhost") || host == "::1" {
        "127.0.0.1".to_string()
    } else {
        host
    };
    let local = host == "127.0.0.1";
    let opts = OptsBuilder::new()
        .ip_or_hostname(Some(host.as_str()))
        .tcp_port(port)
        .user(Some(cfg.user.as_str()))
        .pass(Some(cfg.password.as_str()))
        .db_name(Some(cfg.database.as_str()))
        .prefer_socket(local);

    let pool = Pool::new(opts)?;
    let mut conn = pool.get_conn()?;

    let daily = sanitize_ident(&cfg.table)?;
    let alltime = format!("{daily}all");
    ensure_table(&mut conn, &daily)?;
    ensure_table(&mut conn, &alltime)?;

    let skin = entry.skin.trim_start_matches('%');
    let score = entry.score as i64;
    let playtime = entry.play_seconds as i64;
    let eat_players = entry.playereat as i64;
    let eat_virus = entry.viruseat as i64;
    let eat_food = entry.foodeat as i64;
    let eat_surprice = entry.surpeat as i64;

    upsert(
        &mut conn,
        &daily,
        &entry.name,
        skin,
        ip,
        score,
        eat_players,
        eat_virus,
        eat_food,
        eat_surprice,
        playtime,
    )?;
    upsert(
        &mut conn,
        &alltime,
        &entry.name,
        skin,
        ip,
        score,
        eat_players,
        eat_virus,
        eat_food,
        eat_surprice,
        playtime,
    )?;

    info!(
        name = %entry.name,
        score = entry.score,
        table = %daily,
        "mysql score saved"
    );
    debug!(host = %host, port, db = %cfg.database, "mysql write ok");
    Ok(())
}

fn sanitize_ident(name: &str) -> anyhow::Result<String> {
    let t = name.trim();
    if t.is_empty()
        || !t
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        anyhow::bail!("invalid mysql table name {name:?}");
    }
    Ok(t.to_string())
}

fn ensure_table(conn: &mut mysql::PooledConn, table: &str) -> anyhow::Result<()> {
    // Matches classic OgarServ high-score schema (daily + *all).
    let sql = format!(
        "CREATE TABLE IF NOT EXISTS `{table}` (\
            `name` VARCHAR(255) NOT NULL,\
            `skin` VARCHAR(255) NOT NULL DEFAULT '',\
            `ip` VARCHAR(45) NOT NULL DEFAULT '',\
            `score` BIGINT NOT NULL DEFAULT 0,\
            `eat_players` INT NOT NULL DEFAULT 0,\
            `eat_virus` INT NOT NULL DEFAULT 0,\
            `eat_food` INT NOT NULL DEFAULT 0,\
            `eat_surprice` INT NOT NULL DEFAULT 0,\
            `timeplayed` INT NOT NULL DEFAULT 0,\
            `lastseen` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
            PRIMARY KEY (`name`)\
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    conn.query_drop(sql)?;
    Ok(())
}

fn upsert(
    conn: &mut mysql::PooledConn,
    table: &str,
    name: &str,
    skin: &str,
    ip: &str,
    score: i64,
    eat_players: i64,
    eat_virus: i64,
    eat_food: i64,
    eat_surprice: i64,
    playtime: i64,
) -> anyhow::Result<()> {
    // Same ON DUPLICATE KEY semantics as Node writeScore.
    let sql = format!(
        "INSERT INTO `{table}` \
            (`name`,`skin`,`ip`,`score`,`eat_players`,`eat_virus`,`eat_food`,`eat_surprice`,`timeplayed`,`lastseen`) \
         VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) \
         ON DUPLICATE KEY UPDATE \
            `score` = IF(`score` < VALUES(`score`), VALUES(`score`), `score`), \
            `skin` = VALUES(`skin`), \
            `ip` = VALUES(`ip`), \
            `eat_players` = `eat_players` + VALUES(`eat_players`), \
            `eat_virus` = `eat_virus` + VALUES(`eat_virus`), \
            `eat_food` = `eat_food` + VALUES(`eat_food`), \
            `eat_surprice` = `eat_surprice` + VALUES(`eat_surprice`), \
            `timeplayed` = `timeplayed` + VALUES(`timeplayed`), \
            `lastseen` = CURRENT_TIMESTAMP"
    );
    conn.exec_drop(
        sql,
        (
            name,
            skin,
            ip,
            score,
            eat_players,
            eat_virus,
            eat_food,
            eat_surprice,
            playtime,
        ),
    )?;
    Ok(())
}
