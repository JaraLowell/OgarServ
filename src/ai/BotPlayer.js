var PlayerTracker = require('../PlayerTracker');
var gameServer = require('../GameServer');
var Vector = require('vector2-node');

function BotPlayer() {
    PlayerTracker.apply(this, Array.prototype.slice.call(arguments));
    //this.setColor(gameServer.getRandomColor());

    this.splitCooldown = 0;
}

module.exports = BotPlayer;
BotPlayer.prototype = new PlayerTracker();

// Functions

BotPlayer.prototype.getLowestCell = function () {
    // Gets the cell with the lowest mass
    if (this.cells.length <= 0) {
        return null; // Error!
    }

    // Sort the cells by Array.sort() function to avoid errors
    var sorted = this.cells.valueOf();
    sorted.sort(function (a, b) {
        return b.getSize() - a.getSize();
    });

    return sorted[0];
};

BotPlayer.prototype.checkConnection = function () {
    if (this.socket.isCloseRequest) {
        while (this.cells.length > 0) {
            this.gameServer.removeNode(this.cells[0]);
        }
        this.isRemoved = true;
        return;
    }

    // Respawn if bot is dead
    if (this.cells.length <= 0) {
        if(this.gameServer.sinfo.humans >= this.gameServer.config.serverBots) {
            this.gameServer.onChatMessage(this.socket.playerTracker, null, 'Fine be that way, See if you have fun without me! Bye!');
            this.socket.close();
            return;
        }
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer, this);
        if (this.cells.length == 0) {
            // If the bot cannot spawn any cells, then disconnect it
            this.socket.close();
        }
    }
}

BotPlayer.prototype.sendUpdate = function () { // Overrides the update function from player tracker
    if (this.splitCooldown > 0) this.splitCooldown--;

    if (this.gameServer.sinfo.humans == 0 ) return;

    // Calc predators/prey
    var cell = this.getLowestCell();

    // Action
    this.decide(cell);
};

// Custom
BotPlayer.prototype.decide = function (cell) {
    if (!cell) return; // Cell was eaten, check in the next tick (I'm too lazy)

    var cellPos = cell.position;
    var result = new Vector(0, 0);
    // Splitting
    var split = false,
        splitTarget = null,
        threats = [];

    for (var i = 0; i < this.viewNodes.length; i++) {
        var check = this.viewNodes[i];
        if (check.owner == this) continue;
        var checksize = check.getSize();

        // Get attraction of the cells - avoid larger cells, viruses and same team cells
        var influence = 0;
        if (check.cellType == 0) {
            // Player cell
            if (this.gameServer.gameMode.haveTeams && (cell.owner.team == check.owner.team)) {
                // Same team cell
                influence = 0;
            }
            else if (cell.getSize() > (checksize + 4) * 1.15) {
                // Can eat it
                influence = checksize * 2.5;
            }
            else if (checksize + 4 > cell.getSize() * 1.15) {
                // Can eat me
                influence = -checksize;
            } else {
                influence = -(checksize / cell.getSize()) / 3;
            }
        } else if (check.cellType == 1) {
            // Food
            influence = 5;
        } else if (check.cellType == 2) {
            // Virus
            if ((cell.getSize() > checksize * 1.15) && !check.isMotherCell) {
                // Can eat it
                if (this.cells.length == this.gameServer.config.playerMaxCells) {
                    // Won't explode
                    influence = checksize * 2.5;
                }
                else {
                    // Can explode
                    if(Math.random() > 0.15)
                        influence = -1;
                    else
                        influence = checksize * 1.15;
                }
            } else if (check.isMotherCell) {
                if (this.cells.length > 1) {
                    influence = -(checksize * 1.15);
                    threats.push(check);
                } else if(cell.getSize() > checksize * 1.15)
                    influence = checksize * 1.15;
                else
                    influence = -1;
            }
        } else if (check.cellType == 3 || check.cellType == 4) {
            // Ejected mass
            if (cell.getSize() > checksize * 1.15)
                // can eat
                influence = checksize;
        } else if (check.cellType == 5 ) {
            influence = 0;
        } else {
            influence = checksize; // Might be TeamZ
        }

        // Apply influence if it isn't 0 or my cell
        if (influence == 0 || cell.owner == check.owner)
            continue;

        // Calculate separation between cell and check
        var checkPos = check.position;
        var displacement = new Vector(checkPos.x - cellPos.x, checkPos.y - cellPos.y);

        // Figure out distance between cells
        var distance = displacement.length();
        if (influence < 0) {
            // Get edge distance
            distance -= cell.getSize() + checksize;
            if (check.cellType == 0) threats.push(check);
        }

        // The farther they are the smaller influnce it is
        if (distance < 1) distance = 1; // Avoid NaN and positive influence with negative distance & attraction
        influence /= distance;

        // Produce force vector exerted by this entity on the cell
        var force = displacement.normalize().scale(influence);

        // Splitting conditions
        if (check.cellType == 0 &&.
            cell.getSize() > (checksize + 4) * 1.15 &&
            cell.getSize() < checksize * 5 &&
            (!split) &&.
            this.splitCooldown == 0 &&.
            this.cells.length < 3) {

            var endDist = 780 + 40 - cell.getSize() / 2 - checksize;

            if (endDist > 0 && distance < endDist) {
                splitTarget = check;
                split = true;
            }
        } else {
            // Add up forces on the entity
            result.add(force);
        }
    }

    // Normalize the resulting vector
    result.normalize();

    // Check for splitkilling and threats
    if (split) {
        // Can be shortened but I'm too lazy
        if (threats.length > 0) {
            if (this.largest(threats).getSize() > cell.getSize() * 1.5) {
                // Splitkill the target
                this.mouse = {
                    x: splitTarget.position.x,
                    y: splitTarget.position.y
                };
                this.splitCooldown = 16;
                this.socket.packetHandler.pressSpace = true;
                //this.gameServer.splitCells(this);
                return;
            }
        }
        else {
            // Still splitkill the target
            this.mouse = {
                x: splitTarget.position.x,
                y: splitTarget.position.y
            };
            this.splitCooldown = 9;
            this.socket.packetHandler.pressSpace = true;
            //this.gameServer.splitCells(this);
            return;
        }
    }
    this.mouse = {
        x: ~~(cellPos.x + result.x * 800),
        y: ~~(cellPos.y + result.y * 800)
    };
};

// Subfunctions
BotPlayer.prototype.largest = function (list) {
    // Sort the cells by Array.sort() function to avoid errors
    var sorted = list.valueOf();
    sorted.sort(function (a, b) {
        return b.getSize() - a.getSize();
    });

    return sorted[0];
};
