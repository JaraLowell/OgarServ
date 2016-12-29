var Cell = require('./Cell');

function PlayerCell() {
    Cell.apply(this, Array.prototype.slice.call(arguments));

    this.cellType = 0;
    this._canRemerge = false;
}

module.exports = PlayerCell;
PlayerCell.prototype = new Cell();

// Main Functions
PlayerCell.prototype.canRemerge = function () {
    return this._canRemerge;
};

PlayerCell.prototype.canEat = function (cell) {
    // player cell can eat anyone
    return true;
};

PlayerCell.prototype.getSplitSize = function () {
    return this.getSize() * splitMultiplier;
};

Cell.prototype.getSpeed = function () {
    var speed = 2.1106 / Math.pow(this.getSize(), 0.449);
    this._speed = speed * 40 * this.gameServer.config.playerSpeed;

    return this._speed;
};

var splitMultiplier = 1 / Math.sqrt(2);
// Override

PlayerCell.prototype.onAdd = function (gameServer) {
    // Gamemode actions
    gameServer.gameMode.onCellAdd(this);
};

PlayerCell.prototype.onRemove = function (gameServer) {
    var index;
    // Remove from player cell list
    index = this.owner.cells.indexOf(this);
    if (index != -1) {
        this.owner.cells.splice(index, 1);
    }
    // Gamemode actions
    gameServer.gameMode.onCellRemove(this);
};
