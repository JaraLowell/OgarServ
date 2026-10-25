use crate::protocol::Color;

pub type NodeId = u32;
pub type PlayerId = u32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum CellType {
    Player = 0,
    Food = 1,
    Virus = 2,
    Ejected = 3,
    Surprise = 4,
    Beacon = 5,
}

#[derive(Clone, Copy, Debug)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

impl Vec2 {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
    pub fn dist_sq(self, o: Self) -> f64 {
        let dx = self.x - o.x;
        let dy = self.y - o.y;
        dx * dx + dy * dy
    }
    pub fn length(self) -> f64 {
        (self.x * self.x + self.y * self.y).sqrt()
    }
}

#[derive(Clone, Debug)]
pub struct Cell {
    pub node_id: NodeId,
    pub cell_type: CellType,
    pub owner: Option<PlayerId>,
    pub position: Vec2,
    pub size: f64,
    pub color: Color,
    pub is_spiked: bool,
    pub is_agitated: bool,
    pub is_moving: bool,
    pub is_removed: bool,
    pub is_mother: bool,
    pub infinite_boost: bool,
    pub boost_distance: f64,
    pub boost_dir: Vec2,
    pub boost_angle: f64,
    pub boost_max_speed: f64,
    pub tick_of_birth: u64,
    pub killed_by: Option<NodeId>,
    pub can_remerge: bool,
    /// Beacon charge stage
    pub stage: u32,
    pub beacon_active: bool,
}

impl Cell {
    pub fn new(
        node_id: NodeId,
        cell_type: CellType,
        owner: Option<PlayerId>,
        position: Vec2,
        size: f64,
        tick: u64,
    ) -> Self {
        Self {
            node_id,
            cell_type,
            owner,
            position,
            size,
            color: Color { r: 0, g: 0, b: 0 },
            is_spiked: matches!(cell_type, CellType::Virus | CellType::Beacon),
            is_agitated: matches!(cell_type, CellType::Surprise),
            is_moving: false,
            is_removed: false,
            is_mother: false,
            infinite_boost: false,
            boost_distance: 0.0,
            boost_dir: Vec2::new(1.0, 0.0),
            boost_angle: std::f64::consts::FRAC_PI_2,
            boost_max_speed: 78.0,
            tick_of_birth: tick,
            killed_by: None,
            can_remerge: false,
            stage: 0,
            beacon_active: true,
        }
    }

    pub fn size_squared(&self) -> f64 {
        self.size * self.size
    }

    pub fn mass(&self) -> f64 {
        self.size_squared() / 100.0
    }

    pub fn set_size(&mut self, size: f64) {
        self.size = size.max(0.0);
    }

    pub fn age(&self, tick: u64) -> u64 {
        tick.saturating_sub(self.tick_of_birth)
    }

    pub fn set_boost(&mut self, distance: f64, angle: f64, max_speed: f64) {
        self.boost_distance = distance;
        self.boost_max_speed = max_speed;
        self.boost_angle = angle;
        self.boost_dir = Vec2::new(angle.sin(), angle.cos());
        self.is_moving = true;
    }

    pub fn get_speed(&self, player_speed: f64) -> f64 {
        let base = 2.1106 / self.size.powf(0.449);
        base * 40.0 * player_speed
    }

    pub fn split_size(&self) -> f64 {
        self.size / std::f64::consts::SQRT_2
    }

    pub fn can_eat(&self, prey: &Cell) -> bool {
        match self.cell_type {
            CellType::Player => true,
            CellType::Virus if self.is_mother => {
                matches!(prey.cell_type, CellType::Player | CellType::Ejected)
            }
            CellType::Virus => prey.cell_type == CellType::Ejected,
            CellType::Beacon => prey.cell_type == CellType::Ejected,
            _ => false,
        }
    }
}
