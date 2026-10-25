mod tls;

use crate::player::Player;
use crate::protocol::{self, BinaryReader, Color};
use crate::world::cell::Vec2;
use crate::world::GameServer;
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::{
    accept_hdr_async,
    tungstenite::{
        handshake::server::{Request, Response},
        Message,
    },
};
use tracing::{info, warn};

pub async fn run_ws_server(server: Arc<Mutex<GameServer>>) -> anyhow::Result<()> {
    let (bind_addr, http_addr, tls_port, tls_dir, tls_cert, tls_key, max_conn) = {
        let s = server.lock().await;
        let port = s.config.server.port;
        let http = s.config.server.http_port;
        let tls = s.config.server.tls_port;
        (
            format!("0.0.0.0:{port}"),
            if http > 0 {
                Some(format!("0.0.0.0:{http}"))
            } else {
                None
            },
            tls,
            s.config.server.tls_dir.clone(),
            s.config.server.tls_cert.clone(),
            s.config.server.tls_key.clone(),
            s.config.server.max_connections,
        )
    };

    warn!(
        "If the web client page is HTTPS, the browser BLOCKS ws://127.0.0.1 — use HTTP client page OR wss://127.0.0.1:{}",
        if tls_port > 0 { tls_port } else { 8443 }
    );

    if let Some(addr) = http_addr {
        let http_srv = server.clone();
        tokio::spawn(async move {
            if let Err(e) = run_http_info(addr, http_srv).await {
                warn!(error = %e, "http info server stopped");
            }
        });
    }

    if tls_port > 0 {
        let tls_srv = server.clone();
        tokio::spawn(async move {
            if let Err(e) =
                run_wss_server(tls_port, max_conn, tls_dir, tls_cert, tls_key, tls_srv).await
            {
                warn!(error = %e, "WSS server stopped");
            }
        });
    }

    let listener = TcpListener::bind(&bind_addr).await?;
    info!(%bind_addr, "WebSocket game port listening (ws://)");

    loop {
        let (stream, peer) = listener.accept().await?;
        let srv = server.clone();
        let count = {
            let s = srv.lock().await;
            s.players.values().filter(|p| !p.is_mi).count() as u32
        };
        if count >= max_conn {
            warn!(%peer, "rejecting — max connections");
            continue;
        }
        tokio::spawn(async move {
            // Peek HTTP first: Chrome PNA sends OPTIONS before WS when the
            // client page is a public origin (ogar.mivabe.nl) talking to 127.0.0.1.
            if let Err(e) = handle_plain_tcp(stream, peer, srv).await {
                log_client_err(peer, &e);
            }
        });
    }
}

/// Plain TCP on the game port: CORS/PNA preflight, then WebSocket upgrade.
async fn handle_plain_tcp(
    mut stream: TcpStream,
    peer: SocketAddr,
    server: Arc<Mutex<GameServer>>,
) -> anyhow::Result<()> {
    let headers = read_http_headers(&mut stream).await?;
    if headers.is_empty() {
        return Ok(());
    }
    let head = String::from_utf8_lossy(&headers);
    let first = head.lines().next().unwrap_or("");
    let lower = head.to_ascii_lowercase();
    let origin = header_value(&head, "origin").unwrap_or("*");

    // Private Network Access / CORS preflight (separate TCP from the upgrade).
    if first.starts_with("OPTIONS") {
        info!(%peer, %origin, "PNA/CORS preflight");
        let resp = format!(
            "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: {origin}\r\n\
Access-Control-Allow-Methods: GET, OPTIONS\r\n\
Access-Control-Allow-Headers: content-type, sec-websocket-key, sec-websocket-version, sec-websocket-protocol, sec-websocket-extensions, upgrade, connection\r\n\
Access-Control-Allow-Private-Network: true\r\n\
Access-Control-Max-Age: 86400\r\n\
Vary: Origin\r\n\
Content-Length: 0\r\n\
Connection: close\r\n\r\n"
        );
        stream.write_all(resp.as_bytes()).await?;
        let _ = stream.shutdown().await;
        return Ok(());
    }

    if !lower.contains("upgrade: websocket") {
        // Non-WS GET — tiny status so probes don't hang (stats stay on http_port).
        let body = b"ogar-rs ws port - connect with WebSocket";
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\
Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Private-Network: true\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream.write_all(resp.as_bytes()).await?;
        stream.write_all(body).await?;
        let _ = stream.shutdown().await;
        return Ok(());
    }

    let prefixed = PrefixedStream {
        prefix: std::io::Cursor::new(headers),
        inner: stream,
    };
    handle_client(prefixed, peer, server).await
}

fn header_value<'a>(head: &'a str, name: &str) -> Option<&'a str> {
    let want = name.to_ascii_lowercase();
    for line in head.lines() {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case(&want) {
                return Some(v.trim());
            }
        }
    }
    None
}

fn log_client_err(peer: SocketAddr, e: &anyhow::Error) {
    let msg = e.to_string();
    if msg.contains("Handshake not finished") || msg.contains("Connection reset") {
        tracing::debug!(%peer, error = %msg, "ws probe closed");
    } else {
        warn!(%peer, error = %msg, "client ended");
    }
}

async fn run_wss_server(
    port: u16,
    max_conn: u32,
    tls_dir: String,
    tls_cert: String,
    tls_key: String,
    server: Arc<Mutex<GameServer>>,
) -> anyhow::Result<()> {
    let acceptor =
        tls::load_or_create_acceptor(PathBuf::from(&tls_dir), &tls_cert, &tls_key)?;
    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr).await?;
    info!(
        %addr,
        dir = %tls_dir,
        cert = %tls_cert,
        key = %tls_key,
        "WSS game port listening (wss://) — open https://YOUR_DOMAIN:{port}/ once to verify the cert"
    );

    loop {
        let (tcp, peer) = listener.accept().await?;
        let acceptor = acceptor.clone();
        let srv = server.clone();
        let count = {
            let s = srv.lock().await;
            s.players.values().filter(|p| !p.is_mi).count() as u32
        };
        if count >= max_conn {
            warn!(%peer, "rejecting WSS — max connections");
            continue;
        }
        tokio::spawn(async move {
            match acceptor.accept(tcp).await {
                Ok(tls_stream) => {
                    if let Err(e) = handle_tls_connection(tls_stream, peer, srv).await {
                        log_client_err(peer, &e);
                    }
                }
                Err(e) => {
                    tracing::debug!(%peer, error = %e, "TLS accept failed");
                }
            }
        });
    }
}

async fn handle_tls_connection(
    mut stream: tokio_rustls::server::TlsStream<TcpStream>,
    peer: SocketAddr,
    server: Arc<Mutex<GameServer>>,
) -> anyhow::Result<()> {
    // Read full HTTP headers, then either serve trust page or complete WS upgrade.
    let headers = read_http_headers(&mut stream).await?;
    let head = String::from_utf8_lossy(&headers);
    let head_l = head.to_ascii_lowercase();
    let is_ws = head_l.contains("upgrade: websocket");
    let is_options = head_l.starts_with("options ");

    // Chromium PNA/LNA: public HTTPS page → private/loopback WSS sends OPTIONS first.
    // Must not answer with the HTML trust page or the real WS connect never happens.
    if is_options {
        let origin = head
            .lines()
            .find(|l| l.to_ascii_lowercase().starts_with("origin:"))
            .and_then(|l| l.split_once(':').map(|(_, v)| v.trim()))
            .unwrap_or("*");
        let resp = format!(
            "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: {origin}\r\n\
Access-Control-Allow-Methods: GET, OPTIONS\r\n\
Access-Control-Allow-Headers: content-type, authorization, sec-websocket-protocol, sec-websocket-extensions, sec-websocket-key, sec-websocket-version\r\n\
Access-Control-Allow-Private-Network: true\r\n\
Access-Control-Max-Age: 86400\r\n\
Content-Length: 0\r\n\
Connection: close\r\n\r\n"
        );
        stream.write_all(resp.as_bytes()).await?;
        let _ = stream.shutdown().await;
        info!(%peer, %origin, "WSS PNA preflight OK");
        return Ok(());
    }

    if !is_ws {
        let body = WSS_TRUST_PAGE;
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        stream.write_all(resp.as_bytes()).await?;
        let _ = stream.shutdown().await;
        return Ok(());
    }
    let prefixed = PrefixedStream {
        prefix: std::io::Cursor::new(headers),
        inner: stream,
    };
    handle_client(prefixed, peer, server).await
}

async fn read_http_headers<S: AsyncRead + Unpin>(stream: &mut S) -> anyhow::Result<Vec<u8>> {
    let mut buf = Vec::with_capacity(1024);
    let mut tmp = [0u8; 256];
    loop {
        let n = stream.read(&mut tmp).await?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() > 8192 {
            break;
        }
    }
    Ok(buf)
}

struct PrefixedStream<S> {
    prefix: std::io::Cursor<Vec<u8>>,
    inner: S,
}

impl<S: AsyncRead + Unpin> AsyncRead for PrefixedStream<S> {
    fn poll_read(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        let this = self.get_mut();
        let pos = this.prefix.position() as usize;
        let data = this.prefix.get_ref();
        if pos < data.len() {
            let rest = &data[pos..];
            let n = rest.len().min(buf.remaining());
            buf.put_slice(&rest[..n]);
            this.prefix.set_position((pos + n) as u64);
            return std::task::Poll::Ready(Ok(()));
        }
        std::pin::Pin::new(&mut this.inner).poll_read(cx, buf)
    }
}

impl<S: AsyncWrite + Unpin> AsyncWrite for PrefixedStream<S> {
    fn poll_write(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<Result<usize, std::io::Error>> {
        std::pin::Pin::new(&mut self.get_mut().inner).poll_write(cx, buf)
    }
    fn poll_flush(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), std::io::Error>> {
        std::pin::Pin::new(&mut self.get_mut().inner).poll_flush(cx)
    }
    fn poll_shutdown(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), std::io::Error>> {
        std::pin::Pin::new(&mut self.get_mut().inner).poll_shutdown(cx)
    }
}

async fn run_http_info(addr: String, server: Arc<Mutex<GameServer>>) -> anyhow::Result<()> {
    let listener = TcpListener::bind(&addr).await?;
    info!(%addr, "HTTP stats/scores listening");
    loop {
        let (mut stream, _) = listener.accept().await?;
        let srv = server.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf).await;
            let head = String::from_utf8_lossy(&buf);
            let path = head
                .lines()
                .next()
                .and_then(|l| l.split_whitespace().nth(1))
                .unwrap_or("/")
                .split('?')
                .next()
                .unwrap_or("/");

            let (ctype, body) = if path.starts_with("/highscores") || path.starts_with("/scores") {
                let gs = srv.lock().await;
                let json = serde_json::to_string_pretty(gs.scores.board())
                    .unwrap_or_else(|_| "{\"entries\":[]}".into());
                ("application/json", json)
            } else if path.starts_with("/stats") {
                let mut gs = srv.lock().await;
                gs.refresh_sinfo();
                ("application/json", gs.build_server_stat_json())
            } else {
                (
                    "application/json",
                    r#"{"status":"ok","server":"OgarServ Rust","game_ws":"ws://HOST:8080","stats":"/stats","highscores":"/highscores"}"#
                        .to_string(),
                )
            };
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(resp.as_bytes()).await;
            let _ = stream.shutdown().await;
        });
    }
}

async fn handle_client<S>(
    stream: S,
    peer: SocketAddr,
    server: Arc<Mutex<GameServer>>,
) -> anyhow::Result<()>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let callback = move |req: &Request, mut response: Response| {
        let origin = req
            .headers()
            .get("origin")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("-");
        let ua = req
            .headers()
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("-");
        info!(%peer, %origin, %ua, "ws upgrade");
        // Echo Origin + PNA so Chromium allows public page → localhost WS.
        let allow_origin = if origin == "-" { "*" } else { origin };
        let headers = response.headers_mut();
        if let Ok(v) = allow_origin.parse() {
            headers.insert("Access-Control-Allow-Origin", v);
        }
        if let Ok(v) = "true".parse() {
            headers.insert("Access-Control-Allow-Private-Network", v);
        }
        Ok(response)
    };

    let ws = accept_hdr_async(stream, callback).await?;
    let (mut write, mut read) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Bytes>();

    let pid = {
        let mut gs = server.lock().await;
        let id = gs.next_player_id();
        let center = Vec2::new(0.0, 0.0);
        let mut player = Player::new(id, tx, peer.ip().to_string(), center);
        player.scramble(
            gs.config.server.scramble_level,
            gs.border.width,
            gs.border.height,
        );
        player.color = gs.gray_color(gs.random_color());
        gs.players.insert(id, player);
        gs.with_mode(|mode, gs| mode.on_player_init(gs, id));
        info!(%peer, player = id, "connected");
        id
    };

    let writer = tokio::spawn(async move {
        while let Some(buf) = rx.recv().await {
            if write.send(Message::Binary(buf)).await.is_err() {
                break;
            }
        }
    });

    while let Some(msg) = read.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(_) => break,
        };
        match msg {
            Message::Binary(data) => {
                let mut gs = server.lock().await;
                handle_packet(&mut gs, pid, &data);
            }
            Message::Ping(_) | Message::Pong(_) | Message::Text(_) | Message::Frame(_) => {}
            Message::Close(_) => break,
        }
    }

    {
        let mut gs = server.lock().await;
        if gs
            .players
            .get(&pid)
            .map(|p| !p.cells.is_empty() && !p.is_mi)
            .unwrap_or(false)
        {
            gs.record_score(pid);
        }
        gs.remove_player_fully(pid);
        info!(%peer, player = pid, "disconnected");
    }

    writer.abort();
    Ok(())
}

fn handle_packet(gs: &mut GameServer, pid: u32, data: &[u8]) {
    if data.is_empty() || data.len() > 256 {
        return;
    }
    let Some(player) = gs.players.get(&pid) else {
        return;
    };
    if !player.handshake {
        if data[0] != 254 || data.len() != 5 {
            return;
        }
        let mut r = BinaryReader::new(data.to_vec());
        r.skip(1);
        let mut protocol = r.read_u32().unwrap_or(0);
        if !(1..=11).contains(&protocol) {
            warn!(player = pid, protocol, "unsupported protocol");
            return;
        }
        if protocol < 4 {
            protocol = 5;
        }
        let welcome1 = gs.config.server.welcome1.clone();
        let welcome2 = gs.config.server.welcome2.clone();
        let mode_name = gs.mode.name().to_string();
        let version = env!("CARGO_PKG_VERSION");
        let mode_id = gs.mode.id() as u32;
        let server_label = format!("OgarServ {version}");
        let border = (
            gs.border.minx,
            gs.border.miny,
            gs.border.maxx,
            gs.border.maxy,
        );

        if let Some(p) = gs.players.get_mut(&pid) {
            p.protocol = protocol;
            p.handshake = true;
            let sx = p.scramble_x;
            let sy = p.scramble_y;
            p.send(protocol::clear_all());
            p.send(protocol::set_border(
                border.0 + sx,
                border.1 + sy,
                border.2 + sx,
                border.3 + sy,
                Some(mode_id),
                &server_label,
            ));
        }
        info!(player = pid, protocol, "handshake ok");
        gs.send_chat_to(pid, &format!("OgarServ {version} — mode {mode_name}"));
        if !welcome1.is_empty() {
            gs.send_chat_to(pid, &welcome1);
        }
        if !welcome2.is_empty() {
            gs.send_chat_to(pid, &welcome2);
        }
        // Lobby: push active-player stats immediately (client also polls with 254)
        gs.send_server_stat(pid);
        if let Some(p) = gs.players.get_mut(&pid) {
            p.last_stat_ms = chrono::Utc::now().timestamp_millis() as u64;
        }
        return;
    }

    let mut r = BinaryReader::new(data.to_vec());
    let Some(packet_id) = r.read_u8() else {
        return;
    };

    match packet_id {
        0 => {
            if gs
                .players
                .get(&pid)
                .map(|p| !p.cells.is_empty())
                .unwrap_or(true)
            {
                return;
            }
            let protocol = gs.players.get(&pid).map(|p| p.protocol).unwrap_or(11);
            let text = if protocol <= 5 {
                r.read_string_zero_unicode()
            } else {
                r.read_string_zero_utf8()
            };
            let (name, skin) = parse_nick(&text, gs.config.player.max_nick_length);
            info!(player = pid, %name, "nickname");
            gs.join_game(pid, name, skin);
        }
        1 => {
            if let Some(p) = gs.players.get_mut(&pid) {
                if p.cells.is_empty() {
                    p.spectate = true;
                }
            }
        }
        16 => {
            let (sx, sy) = {
                let p = match gs.players.get(&pid) {
                    Some(p) if p.free_mouse => (p.scramble_x, p.scramble_y),
                    _ => return,
                };
                p
            };
            let (mx, my) = if data.len() == 13 {
                (
                    r.read_i32().unwrap_or(0) as f64,
                    r.read_i32().unwrap_or(0) as f64,
                )
            } else if data.len() == 9 {
                (
                    r.read_i16().unwrap_or(0) as f64,
                    r.read_i16().unwrap_or(0) as f64,
                )
            } else if data.len() == 21 {
                (r.read_f64().unwrap_or(0.0), r.read_f64().unwrap_or(0.0))
            } else {
                return;
            };
            if let Some(p) = gs.players.get_mut(&pid) {
                p.mouse.x = mx - sx;
                p.mouse.y = my - sy;
            }
        }
        17 => {
            if let Some(p) = gs.players.get_mut(&pid) {
                p.press_space = true;
            }
        }
        18 => {
            if let Some(p) = gs.players.get_mut(&pid) {
                p.press_q = true;
            }
        }
        21 => {
            if let Some(p) = gs.players.get_mut(&pid) {
                p.press_w = true;
            }
        }
        22 => {
            if let Some(p) = gs.players.get_mut(&pid) {
                p.minion_split = true;
            }
        }
        23 => {
            if let Some(p) = gs.players.get_mut(&pid) {
                p.minion_eject = true;
            }
        }
        24 => {
            if let Some(p) = gs.players.get_mut(&pid) {
                p.minion_frozen = !p.minion_frozen;
            }
        }
        25 => {
            if let Some(p) = gs.players.get_mut(&pid) {
                p.collect_pellets = !p.collect_pellets;
            }
        }
        90 => {
            // ServerInfo — used by some lobby UIs
            info!(player = pid, "server info request");
            gs.send_server_info(pid);
        }
        104 => {
            // Toggle MiniMap (client: setMiniMap → [104, on, 0, 0, 0])
            let on = r.read_u8().unwrap_or(0) != 0;
            if let Some(p) = gs.players.get_mut(&pid) {
                p.mini_map = on;
            }
            info!(player = pid, mini_map = on, "minimap toggle");
        }
        254 => {
            // ServerStat (lobby player counts) — rate limit 1/sec like Node
            let now = chrono::Utc::now().timestamp_millis() as u64;
            let last = gs.players.get(&pid).map(|p| p.last_stat_ms).unwrap_or(0);
            if now.saturating_sub(last) < 1000 {
                return;
            }
            if let Some(p) = gs.players.get_mut(&pid) {
                p.last_stat_ms = now;
            }
            gs.send_server_stat(pid);
        }
        99 => {
            if !gs.config.server.chat || data.len() < 3 {
                return;
            }
            let flags = r.read_u8().unwrap_or(0);
            let rv = (if flags & 2 != 0 { 4 } else { 0 })
                + (if flags & 4 != 0 { 8 } else { 0 })
                + (if flags & 8 != 0 { 16 } else { 0 });
            r.skip(rv);
            let protocol = gs.players.get(&pid).map(|p| p.protocol).unwrap_or(11);
            let text = if protocol < 6 {
                r.read_string_zero_unicode()
            } else {
                r.read_string_zero_utf8()
            };
            let text = text.trim().to_string();
            if text.len() > 1 {
                if let Some(p) = gs.players.get(&pid) {
                    let name = if p.name.is_empty() {
                        "Spectator"
                    } else {
                        &p.name
                    };
                    let color = p.color;
                    let pkt = protocol::chat_message(name, &text, color, 0);
                    for other in gs.players.values() {
                        other.send(pkt.clone());
                    }
                }
            }
        }
        _ => {}
    }
}

fn parse_nick(text: &str, max_len: usize) -> (String, String) {
    let mut skin = String::new();
    let mut name = text.to_string();
    if let Some(rest) = text.strip_prefix('<') {
        if let Some(end) = rest.find('>') {
            let skin_raw = &rest[..end];
            skin = if skin_raw.is_empty() {
                String::new()
            } else {
                format!("%{skin_raw}")
            };
            name = rest[end + 1..].to_string();
        }
    }
    let mut name = name.trim().chars().take(max_len).collect::<String>();
    if name.is_empty() {
        name = "Cell".into();
    }
    (name, skin.trim().to_string())
}

const WSS_TRUST_PAGE: &str = r#"<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OgarServ WSS</title></head>
<body style="font-family:system-ui;background:#111;color:#eee;padding:2rem;max-width:40rem;line-height:1.45">
<h1>Certificate OK</h1>
<p>TLS on this host:port works. That alone does not mean the game client will connect.</p>
<p><b>OgarClient rule:</b> the <em>web page</em> protocol picks the socket scheme — not this port:</p>
<ul>
<li><code>https://</code> client page → always <code>wss://HOST:PORT</code></li>
<li><code>http://</code> client page → always <code>ws://HOST:PORT</code></li>
</ul>
<p>So from an HTTPS client you must enter the host that matches this certificate
(e.g. <code>play.example.com:8443</code>), <b>not</b> <code>127.0.0.1</code> unless the cert is for that.
Do <b>not</b> use port <code>8080</code> from HTTPS — that port is plain WS and <code>wss://…:8080</code> will fail.</p>
<p>From HTTP client pages use <code>HOST:8080</code> instead.</p>
</body></html>
"#;

#[allow(dead_code)]
fn _color_server() -> Color {
    Color {
        r: 0x9B,
        g: 0x9B,
        b: 0x9B,
    }
}
