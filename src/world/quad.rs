//! Simple quadtree for circle AABB queries.

use super::Vec2;

#[derive(Clone, Copy, Debug)]
pub struct Bound {
    pub minx: f64,
    pub miny: f64,
    pub maxx: f64,
    pub maxy: f64,
}

impl Bound {
    pub fn from_circle(pos: Vec2, radius: f64) -> Self {
        Self {
            minx: pos.x - radius,
            miny: pos.y - radius,
            maxx: pos.x + radius,
            maxy: pos.y + radius,
        }
    }

    pub fn intersects(&self, o: &Bound) -> bool {
        self.minx < o.maxx && self.maxx > o.minx && self.miny < o.maxy && self.maxy > o.miny
    }

    pub fn contains(&self, o: &Bound) -> bool {
        o.minx >= self.minx && o.maxx <= self.maxx && o.miny >= self.miny && o.maxy <= self.maxy
    }

    pub fn center(&self) -> Vec2 {
        Vec2 {
            x: (self.minx + self.maxx) * 0.5,
            y: (self.miny + self.maxy) * 0.5,
        }
    }
}

struct Item {
    id: u32,
    bound: Bound,
}

enum Node {
    Leaf {
        bound: Bound,
        items: Vec<Item>,
    },
    /// `items` holds entries that straddle child boundaries.
    Branch {
        bound: Bound,
        items: Vec<Item>,
        children: Box<[Node; 4]>,
    },
}

pub struct QuadTree {
    root: Node,
    max_items: usize,
    max_depth: usize,
}

impl QuadTree {
    pub fn new(bound: Bound, max_items: usize, max_depth: usize) -> Self {
        Self {
            root: Node::Leaf {
                bound,
                items: Vec::new(),
            },
            max_items,
            max_depth,
        }
    }

    pub fn clear(&mut self) {
        let bound = node_bound(&self.root);
        self.root = Node::Leaf {
            bound,
            items: Vec::new(),
        };
    }

    pub fn insert(&mut self, id: u32, bound: Bound) {
        let max_items = self.max_items;
        let max_depth = self.max_depth;
        insert_rec(&mut self.root, Item { id, bound }, 0, max_items, max_depth);
    }

    pub fn find(&self, area: Bound, out: &mut Vec<u32>) {
        find_rec(&self.root, area, out);
    }
}

fn node_bound(n: &Node) -> Bound {
    match n {
        Node::Leaf { bound, .. } | Node::Branch { bound, .. } => *bound,
    }
}

fn insert_rec(node: &mut Node, item: Item, depth: usize, max_items: usize, max_depth: usize) {
    match node {
        Node::Leaf { bound, items } => {
            items.push(item);
            if items.len() > max_items && depth < max_depth {
                let lb = *bound;
                let old = std::mem::take(items);
                let mut children = split_leaf(lb);
                let mut kept = Vec::new();
                for it in old {
                    match fitting_child(&children, &it.bound) {
                        Some(idx) => {
                            insert_rec(&mut children[idx], it, depth + 1, max_items, max_depth)
                        }
                        None => kept.push(it),
                    }
                }
                *node = Node::Branch {
                    bound: lb,
                    items: kept,
                    children: Box::new(children),
                };
            }
        }
        Node::Branch {
            items, children, ..
        } => match fitting_child(children, &item.bound) {
            Some(idx) => insert_rec(&mut children[idx], item, depth + 1, max_items, max_depth),
            None => items.push(item),
        },
    }
}

fn find_rec(node: &Node, area: Bound, out: &mut Vec<u32>) {
    // Root items may extend past the world bound, so a node's own items are
    // always tested; only children (which fully contain their items) are pruned.
    let items = match node {
        Node::Leaf { items, .. } | Node::Branch { items, .. } => items,
    };
    for it in items {
        if it.bound.intersects(&area) {
            out.push(it.id);
        }
    }
    if let Node::Branch { children, .. } = node {
        for c in children.iter() {
            if node_bound(c).intersects(&area) {
                find_rec(c, area, out);
            }
        }
    }
}

fn split_leaf(b: Bound) -> [Node; 4] {
    let c = b.center();
    let parts = [
        Bound {
            minx: b.minx,
            miny: b.miny,
            maxx: c.x,
            maxy: c.y,
        },
        Bound {
            minx: c.x,
            miny: b.miny,
            maxx: b.maxx,
            maxy: c.y,
        },
        Bound {
            minx: b.minx,
            miny: c.y,
            maxx: c.x,
            maxy: b.maxy,
        },
        Bound {
            minx: c.x,
            miny: c.y,
            maxx: b.maxx,
            maxy: b.maxy,
        },
    ];
    parts.map(|bound| Node::Leaf {
        bound,
        items: Vec::new(),
    })
}

fn fitting_child(children: &[Node; 4], item: &Bound) -> Option<usize> {
    children
        .iter()
        .position(|c| node_bound(c).contains(item))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map() -> Bound {
        Bound {
            minx: -7071.0,
            miny: -7071.0,
            maxx: 7071.0,
            maxy: 7071.0,
        }
    }

    fn circle(x: f64, y: f64, r: f64) -> Bound {
        Bound::from_circle(Vec2 { x, y }, r)
    }

    #[test]
    fn finds_item_straddling_child_boundary() {
        let mut tree = QuadTree::new(map(), 64, 32);
        let target = circle(10.0, 100.0, 100.0);
        tree.insert(1, target);
        for id in 2..=65 {
            tree.insert(id, circle(-5000.0, -5000.0, 1.0));
        }
        let area = Bound {
            minx: -80.0,
            miny: 90.0,
            maxx: -20.0,
            maxy: 110.0,
        };
        assert!(target.intersects(&area));
        let mut found = Vec::new();
        tree.find(area, &mut found);
        assert_eq!(found, vec![1]);
    }

    #[test]
    fn finds_item_extending_past_root_bound() {
        let mut tree = QuadTree::new(map(), 4, 32);
        tree.insert(1, circle(7060.0, 0.0, 50.0));
        for id in 2..=20 {
            tree.insert(id, circle(-6000.0 + id as f64, -6000.0, 1.0));
        }
        let area = Bound {
            minx: 7080.0,
            miny: -5.0,
            maxx: 7100.0,
            maxy: 5.0,
        };
        let mut found = Vec::new();
        tree.find(area, &mut found);
        assert_eq!(found, vec![1]);
    }

    #[test]
    fn matches_brute_force_with_small_nodes() {
        let mut seed = 0x1234_5678_9abc_def0_u64;
        let mut next = move || {
            seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (seed >> 11) as f64 / (1u64 << 53) as f64
        };
        let mut tree = QuadTree::new(map(), 4, 12);
        let mut items = Vec::new();
        for id in 1..=3000 {
            let b = circle(
                next() * 14142.0 - 7071.0,
                next() * 14142.0 - 7071.0,
                1.0 + next() * 600.0,
            );
            tree.insert(id, b);
            items.push((id, b));
        }
        for _ in 0..500 {
            let area = circle(
                next() * 14142.0 - 7071.0,
                next() * 14142.0 - 7071.0,
                1.0 + next() * 1500.0,
            );
            let mut found = Vec::new();
            tree.find(area, &mut found);
            found.sort_unstable();
            let expected: Vec<u32> = items
                .iter()
                .filter(|(_, b)| b.intersects(&area))
                .map(|(id, _)| *id)
                .collect();
            assert_eq!(found, expected);
        }
    }
}
