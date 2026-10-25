//! Binary Agar protocol (LE). Focus: protocol 5–11.

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use std::io::Cursor;

pub struct BinaryReader {
    cur: Cursor<Vec<u8>>,
}

impl BinaryReader {
    pub fn new(data: impl Into<Vec<u8>>) -> Self {
        Self {
            cur: Cursor::new(data.into()),
        }
    }

    pub fn remaining(&self) -> u64 {
        self.cur.get_ref().len() as u64 - self.cur.position()
    }

    pub fn skip(&mut self, n: u64) {
        let pos = self.cur.position() + n;
        self.cur.set_position(pos.min(self.cur.get_ref().len() as u64));
    }

    pub fn read_u8(&mut self) -> Option<u8> {
        self.cur.read_u8().ok()
    }
    pub fn read_u16(&mut self) -> Option<u16> {
        self.cur.read_u16::<LittleEndian>().ok()
    }
    pub fn read_i16(&mut self) -> Option<i16> {
        self.cur.read_i16::<LittleEndian>().ok()
    }
    pub fn read_u32(&mut self) -> Option<u32> {
        self.cur.read_u32::<LittleEndian>().ok()
    }
    pub fn read_i32(&mut self) -> Option<i32> {
        self.cur.read_i32::<LittleEndian>().ok()
    }
    pub fn read_f64(&mut self) -> Option<f64> {
        self.cur.read_f64::<LittleEndian>().ok()
    }

    pub fn read_string_zero_utf8(&mut self) -> String {
        let mut bytes = Vec::new();
        loop {
            match self.read_u8() {
                Some(0) | None => break,
                Some(b) => bytes.push(b),
            }
        }
        String::from_utf8_lossy(&bytes).into_owned()
    }

    pub fn read_string_zero_unicode(&mut self) -> String {
        let mut units = Vec::new();
        loop {
            match self.read_u16() {
                Some(0) | None => break,
                Some(u) => units.push(u),
            }
        }
        String::from_utf16_lossy(&units)
    }
}

pub struct BinaryWriter {
    buf: Vec<u8>,
}

impl BinaryWriter {
    pub fn new() -> Self {
        Self {
            buf: Vec::with_capacity(256),
        }
    }

    pub fn write_u8(&mut self, v: u8) {
        self.buf.write_u8(v).unwrap();
    }
    pub fn write_u16(&mut self, v: u16) {
        self.buf.write_u16::<LittleEndian>(v).unwrap();
    }
    pub fn write_i16(&mut self, v: i16) {
        self.buf.write_i16::<LittleEndian>(v).unwrap();
    }
    pub fn write_u32(&mut self, v: u32) {
        self.buf.write_u32::<LittleEndian>(v).unwrap();
    }
    pub fn write_i32(&mut self, v: i32) {
        self.buf.write_i32::<LittleEndian>(v).unwrap();
    }
    pub fn write_f32(&mut self, v: f32) {
        self.buf.write_f32::<LittleEndian>(v).unwrap();
    }
    pub fn write_f64(&mut self, v: f64) {
        self.buf.write_f64::<LittleEndian>(v).unwrap();
    }
    pub fn write_bytes(&mut self, data: &[u8]) {
        self.buf.extend_from_slice(data);
    }
    pub fn write_string_zero_utf8(&mut self, s: &str) {
        self.buf.extend_from_slice(s.as_bytes());
        self.write_u8(0);
    }
    pub fn write_string_zero_unicode(&mut self, s: &str) {
        for u in s.encode_utf16() {
            self.write_u16(u);
        }
        self.write_u16(0);
    }
    pub fn into_bytes(self) -> Vec<u8> {
        self.buf
    }
}

impl Default for BinaryWriter {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

pub fn clear_all() -> Vec<u8> {
    vec![0x12]
}

pub fn set_border(
    minx: f64,
    miny: f64,
    maxx: f64,
    maxy: f64,
    game_type: Option<u32>,
    server_name: &str,
) -> Vec<u8> {
    let mut w = BinaryWriter::new();
    w.write_u8(0x40);
    w.write_f64(minx);
    w.write_f64(miny);
    w.write_f64(maxx);
    w.write_f64(maxy);
    if let Some(gt) = game_type {
        w.write_u32(gt);
        w.write_string_zero_unicode(server_name);
    }
    w.into_bytes()
}

pub fn add_node(node_id: u32) -> Vec<u8> {
    let mut w = BinaryWriter::new();
    w.write_u8(0x20);
    w.write_u32(node_id);
    w.into_bytes()
}

pub fn clear_owned() -> Vec<u8> {
    vec![0x14]
}

pub fn update_position(x: f32, y: f32, scale: f32) -> Vec<u8> {
    let mut w = BinaryWriter::new();
    w.write_u8(0x11);
    w.write_f32(x);
    w.write_f32(y);
    w.write_f32(scale);
    w.into_bytes()
}

pub fn chat_message(name: &str, text: &str, color: Color, flags: u8) -> Vec<u8> {
    let mut w = BinaryWriter::new();
    w.write_u8(0x63);
    w.write_u8(flags);
    w.write_u8(color.r);
    w.write_u8(color.g);
    w.write_u8(color.b);
    w.write_string_zero_unicode(name);
    w.write_string_zero_unicode(text);
    w.into_bytes()
}

/// Lobby stats — opcode 254 + UTF-8 JSON + NUL (same as MultiOgar ServerStat).
pub fn server_stat_json(json: &str) -> Vec<u8> {
    let mut w = BinaryWriter::new();
    w.write_u8(254);
    w.write_string_zero_utf8(json);
    w.into_bytes()
}

/// Opcode 90 — five f64 fields (uptime, players, map size, food/nodes, gamemode id).
pub fn server_info(
    uptime: f64,
    players: f64,
    map_size: f64,
    nodes_or_food: f64,
    gamemode_id: f64,
) -> Vec<u8> {
    let mut w = BinaryWriter::new();
    w.write_u8(90);
    w.write_f64(uptime);
    w.write_f64(players);
    w.write_f64(map_size);
    w.write_f64(nodes_or_food);
    w.write_f64(gamemode_id);
    w.into_bytes()
}

/// Opcode 104 — MiniMap (MivaBe / OgarServ). Same layout as `packet/MiniMap.js`.
pub struct MiniMapNode {
    pub node_id: u32,
    pub x: i32,
    pub y: i32,
    pub size: u16,
    pub color: Color,
    pub is_spiked: bool,
    pub is_agitated: bool,
    pub is_ejected: bool,
}

pub fn minimap(nodes: &[MiniMapNode]) -> Vec<u8> {
    let mut w = BinaryWriter::new();
    w.write_u8(104);
    for n in nodes {
        w.write_u32(n.node_id);
        w.write_i32(n.x);
        w.write_i32(n.y);
        w.write_u16(n.size);
        w.write_u8(n.color.r);
        w.write_u8(n.color.g);
        w.write_u8(n.color.b);
        let mut flags = 0u8;
        if n.is_spiked {
            flags |= 0x01;
        }
        if n.is_agitated {
            flags |= 0x10;
        }
        if n.is_ejected {
            flags |= 0x20;
        }
        w.write_u8(flags);
        w.write_u16(0);
    }
    w.write_u32(0);
    w.into_bytes()
}

pub struct NodeView {
    pub node_id: u32,
    pub x: f64,
    pub y: f64,
    pub size: f64,
    pub color: Color,
    pub is_spiked: bool,
    pub is_agitated: bool,
    pub cell_type: u8,
    pub skin: Option<String>,
    pub name: Option<String>,
}

/// Build UpdateNodes for protocol >= 6 (also used for 11).
pub fn update_nodes(
    protocol: u32,
    scramble_id: u32,
    eat: &[(u32, u32)], // hunter, prey
    upd: &[NodeView],
    add: &[NodeView],
    del: &[u32],
) -> Vec<u8> {
    let mut w = BinaryWriter::new();
    w.write_u8(0x10);
    w.write_u16(eat.len() as u16);
    for &(hunter, prey) in eat {
        w.write_u32(hunter ^ scramble_id);
        w.write_u32(prey ^ scramble_id);
    }

    if protocol <= 5 {
        write_items_5(&mut w, scramble_id, upd, false);
        write_items_5(&mut w, scramble_id, add, true);
    } else {
        write_items_6(&mut w, protocol, scramble_id, upd, false);
        write_items_6(&mut w, protocol, scramble_id, add, true);
    }
    w.write_u32(0);

    let remove_len = eat.len() + del.len();
    if protocol < 6 {
        w.write_u32(remove_len as u32);
    } else {
        w.write_u16(remove_len as u16);
    }
    for &(_, prey) in eat {
        w.write_u32(prey ^ scramble_id);
    }
    for &id in del {
        w.write_u32(id ^ scramble_id);
    }
    w.into_bytes()
}

fn write_items_5(w: &mut BinaryWriter, scramble_id: u32, nodes: &[NodeView], is_add: bool) {
    for n in nodes {
        w.write_u32(n.node_id ^ scramble_id);
        w.write_i32(n.x as i32);
        w.write_i32(n.y as i32);
        w.write_u16(n.size as u16);
        w.write_u8(n.color.r);
        w.write_u8(n.color.g);
        w.write_u8(n.color.b);
        let mut flags = 0u8;
        if n.is_spiked {
            flags |= 0x01;
        }
        if is_add && n.skin.is_some() {
            flags |= 0x04;
        }
        if n.is_agitated {
            flags |= 0x10;
        }
        if n.cell_type == 3 {
            flags |= 0x20;
        }
        w.write_u8(flags);
        if flags & 0x04 != 0 {
            if let Some(ref skin) = n.skin {
                w.write_string_zero_utf8(skin);
            }
        }
        if is_add {
            if let Some(ref name) = n.name {
                w.write_string_zero_unicode(name);
            } else {
                w.write_u16(0);
            }
        } else {
            w.write_u16(0);
        }
    }
}

fn write_items_6(
    w: &mut BinaryWriter,
    protocol: u32,
    scramble_id: u32,
    nodes: &[NodeView],
    is_add: bool,
) {
    for n in nodes {
        w.write_u32(n.node_id ^ scramble_id);
        w.write_i32(n.x as i32);
        w.write_i32(n.y as i32);
        w.write_u16(n.size as u16);

        let mut flags = 0u8;
        if n.is_spiked {
            flags |= 0x01;
        }
        if !is_add {
            // Updates: color only for player cells (MultiOgar writeUpdateItems6)
            if n.cell_type == 0 {
                flags |= 0x02;
            }
        } else {
            flags |= 0x02;
            if n.skin.is_some() {
                flags |= 0x04;
            }
            if n.name.is_some() {
                flags |= 0x08;
            }
            // Unicode name marker — ADD only (JS does not set this on updates)
            if protocol == 7 {
                flags |= 0x40;
            }
        }
        if n.is_agitated {
            flags |= 0x10;
        }
        if n.cell_type == 3 {
            flags |= 0x20;
        }
        w.write_u8(flags);

        if flags & 0x02 != 0 {
            w.write_u8(n.color.r);
            w.write_u8(n.color.g);
            w.write_u8(n.color.b);
        }
        if flags & 0x04 != 0 {
            if let Some(ref skin) = n.skin {
                w.write_string_zero_utf8(skin);
            }
        }
        if flags & 0x08 != 0 {
            if let Some(ref name) = n.name {
                if protocol == 7 {
                    w.write_string_zero_unicode(name);
                } else {
                    w.write_string_zero_utf8(name);
                }
            }
        }
    }
}

/// Teams pie chart — opcode 0x32, one f32 fraction per team (0..1).
pub fn leaderboard_team(fractions: &[f32]) -> Vec<u8> {
    let mut w = BinaryWriter::new();
    w.write_u8(0x32);
    w.write_u32(fractions.len() as u32);
    for &v in fractions {
        w.write_f32(v.clamp(0.0, 1.0));
    }
    w.into_bytes()
}

pub fn leaderboard_ffa(
    protocol: u32,
    scramble_id: u32,
    entries: &[(bool, u32, &str)], // (is_me, cell_id, name)
    extra: Option<&str>,
) -> Vec<u8> {
    let mut w = BinaryWriter::new();
    w.write_u8(0x31);
    let count = entries.len() + if extra.is_some() { 1 } else { 0 };
    w.write_u32(count as u32);

    if protocol < 6 {
        for &(is_me, cell_id, name) in entries {
            let id = if is_me {
                cell_id ^ scramble_id
            } else {
                0
            };
            w.write_u32(id);
            w.write_string_zero_unicode(name);
        }
        if let Some(line) = extra {
            w.write_u32(u32::MAX);
            w.write_string_zero_unicode(line);
        }
    } else {
        for &(is_me, _, name) in entries {
            w.write_u32(if is_me { 1 } else { 0 });
            if protocol == 7 {
                w.write_string_zero_unicode(name);
            } else {
                w.write_string_zero_utf8(name);
            }
        }
        if let Some(line) = extra {
            w.write_u32(u32::MAX);
            if protocol == 7 {
                w.write_string_zero_unicode(line);
            } else {
                w.write_string_zero_utf8(line);
            }
        }
    }
    w.into_bytes()
}

