var PlayerTracker = require('../PlayerTracker');

function MinionPlayer() {
    PlayerTracker.apply(this, Array.prototype.slice.call(arguments));
    this.isMi = true;   // Marks as minion
}

module.exports = MinionPlayer;
MinionPlayer.prototype = new PlayerTracker();

MinionPlayer.prototype.checkConnection = function () {
    if (this.socket.isCloseRequest) {
        while (this.cells.length > 0) {
            this.gameServer.removeNode(this.cells[0]);
        }
        this.isRemoved = true;
        return;
    }
    if (this.cells.length <= 0) {
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer, this);
        if (this.cells.length == 0) this.socket.close();
    }

    // remove if owner loses control or disconnects
    if (!this.owner.socket.isConnected || !this.owner.minionControl)
        this.socket.close();

    // remove if owner has no cells
    if (!this.owner.cells.length)
        this.socket.close();


    // Owner pressed 'T' = frozen or not
    if (this.owner.minionFrozen) this.frozen = true;
    else this.frozen = false;

    // Owner pressed 'E' = split cells
    if (this.owner.minionSplit) {
        this.owner.minionSplit = false;
        this.socket.packetHandler.pressSpace = true;
    }

    // Owner pressed 'R' = eject mass
    if (this.owner.minionEject) {
        this.owner.minionEject = false;
        this.socket.packetHandler.pressW = true;
    }

    // follow owners mouse by default
    this.mouse = this.owner.mouse;

    // pellet-collecting mode
    if (this.owner.collectPellets) {
        this.viewNodes = [];
        var self = this;
        this.gameServer.quadTree.find(this.viewBox, function (quadItem) {
        if (quadItem.cell.cellType == 1)
            self.viewNodes.push(quadItem.cell);
        });
        var bestDistance = 80000;
        for (var i in this.viewNodes) {
            var cell = this.viewNodes[i];
            var dx = this.cells[0].position.x - cell.position.x;
            var dy = this.cells[0].position.y - cell.position.y;
            if (dx * dx + dy * dy < bestDistance) {
                this.mouse = cell.position;
                break;
            }
        }
    }
};
