# OgarServ (Rust)

From-scratch Agar.io private server (OgarServ / MultiOgar lineage) — no Node.js.  
Binary WebSocket protocol compatible with clients such as [ogar.mivabe.nl](http://ogar.mivabe.nl/).

## Run

```bash
cd ogar-rs
cargo run --release
```

Listens on `config/server.toml` → `server.port` (default **8080**).  
Admin is via the **terminal** (`help`) — no RCon.

### Connect a web client

```
http://ogar.mivabe.nl/index.php?ip=127.0.0.1:8080
```

Plain `ws://` works from an **http://** client page (`host:8080`).  
HTTPS client pages always open `wss://` + host:port (see OgarClient) — use your cert hostname and **`tls_port` (8443)**, not 8080.

**Edge note:** public site → loopback may be blocked by Local Network Access (`edge://flags/#local-network-access-check`).

### Client skins

In `client/gameclient.js`, `SKIN_URL = "//ogar.mivabe.nl/skins/"` uses the
client page's protocol: HTTP on HTTP pages and HTTPS on HTTPS pages. Keep the
leading `//`; a bare `ogar.mivabe.nl/skins/` is a relative path, not a hostname.
The skin host must serve HTTPS with a valid certificate for HTTPS clients;
falling back to HTTP can be blocked as mixed content. If hosting your own client,
point this URL at your own skin host.

The client sends only a skin name, not its image URL, in the spawn nickname
(`<skin-name>Player`). The server stores and broadcasts that skin name; each
client loads the image from its own `SKIN_URL`. Selection updates `#myskin`, which
Play reads, even when reselecting the saved skin.

Browser local storage is separate for HTTP and HTTPS, so a skin saved on HTTP
will not automatically be selected on HTTPS. Select it once on each origin.

### WSS / Let's Encrypt

Defaults match certbot file names (no rename needed — symlink):

```bash
mkdir -p data/tls
ln -sf /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem data/tls/fullchain.pem
ln -sf /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem   data/tls/privkey.pem
```

Config (`config/server.toml`):

```toml
tls_port = 8443
tls_dir = "data/tls"
tls_cert = "fullchain.pem"   # full chain, not leaf-only cert.pem
tls_key = "privkey.pem"
```

Use `fullchain.pem` (leaf + intermediate). Legacy `cert.pem` / `key.pem` in `tls_dir` still work as a fallback. If nothing is present, a self-signed pair is generated for local testing only.

From **https://ogar.mivabe.nl** enter `YOUR_DOMAIN:8443` (must match the certificate name — not `127.0.0.1` unless the cert is for that).

## Switch gamemode

In `config/server.toml`:

```toml
mode = "halloween"   # filename under config/modes/ (without .toml)
```

| Mode | ID | Status | Notes |
|------|----|--------|--------|
| `ffa` | 0 | Done | Classic free-for-all (LB opcode `0x31`) |
| `teams` | 1 | Done | RGB teams, teammate collide / no eat, pie LB opcode `0x32` |
| `experimental` | 2 | Done | Mother cells, no map viruses, virus push-on-eat |
| `halloween` | 3 | Done | Mothers, beacon, orange viruses, spirals, moving viruses, SurpriseCells |
| `christmas` | 4 | Done | Same as Halloween with green virus theme |
| `virusoff` | 15 | Done | No map viruses; **W** shoots viruses (`eject_virus`) |

Still to port from the Node server: LMS, Tournament, HungerGames, Zombie, TeamZ, TeamX, Rainbow.

## Features

- MultiOgar-style binary WS (handshake 254, nick, spectate, mouse, split, eject, chat, ServerStat, MiniMap 104)
- Chrome Private Network Access: `OPTIONS` preflight + CORS on the game port
- `scramble_level = 0` by default (typical web clients)
- Cells: player, food, virus, ejected mass, SurpriseCell, beacon; mothers as flagged viruses
- Virus spirals, moving viruses, push-on-eat (mode/config)
- Minions (client keys E/R/T/P) via `minions.per_player` or console `minion`
- AI bots on a **dedicated thread** (`[bots]` — Node-style: fill to `count`, spawn/respawn only while humans & bots are below that count)
- Idle freeze when no human is playing (`bots.idle_when_empty = true`; spectators do not count); set it to `false` to let bots keep playing on an empty server (useful for stress tests). Spectate **Space** / **Q** still cycles humans + bots
- Larger view via `world.view_base_x` / `view_base_y`
- High scores → `data/highscores.json`
- Optional MySQL high scores (`[mysql]` — same `{table}` / `{table}all` as Node; enabled when `host` is set; connect-on-write only)
- Optional HTTP JSON stats/scores (`server.http_port`; `0` = off)
- Optional master-list alive ping (`[tracker]` → same JSON as Node `masterjs.php`: players / alive / spectators / port / gamemode / …; outbound forced to **IPv4**)

## Terminal commands

`help`, `status`, `playerlist` / `pl`, `addbot`, `kickbot`, `minion` / `mn`, `kick`, `kill`, `killall`, `mass`, `pause`, `exit`

## Config

| File | Purpose |
|------|---------|
| `config/server.toml` | Port, TLS, tracker, mysql, world, food/virus, bots, minions, surprise, mode name |
| `config/modes/*.toml` | Per-mode id, decay, spawn/rules, Halloween-family toggles |
| `botnames.txt` | Bot name pool (`[bots].names_file`) |
| `data/highscores.json` | Saved scores |
| `data/tls/fullchain.pem` + `privkey.pem` | WSS (symlink Let's Encrypt live files) |

Change `mode`, tweak `[bots].count`, rebuild/restart, and play.
