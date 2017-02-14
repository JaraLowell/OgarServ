var Cell = require('./Cell');
var Virus = require('./Virus');

function SurpriseCell() {
    Cell.apply(this, Array.prototype.slice.call(arguments));

    this.cellType = 4; // New cell type
    this.isAgitated = true;
    this.isSpiked = false;
    this.isMotherCell = false;
    this.color = {
        r: 212,
        g: 36,
        b: 38
    };
}

module.exports = SurpriseCell;
SurpriseCell.prototype = new Cell();

SurpriseCell.prototype.onEaten = function (consumer) {
    var client = consumer.owner;
    var size = consumer.getSize();

    var throwSize = this.gameServer.config.playerMinSize + 12;
    var throwMass = throwSize * throwSize / 100;
    var myMass = consumer.getMass();

    var maxSplits = Math.floor(myMass / throwMass); // Maximum amount of splits
    var numSplits = this.gameServer.config.playerMaxCells - client.cells.length; // Get number of splits
    numSplits = Math.min(numSplits,maxSplits);

    var dice = Math.random();
    var splitMass = Math.min(myMass/(numSplits + 1), throwSize);

    // Lucky Player Double Cell Mass
    if(dice > 0.85) {
        this.gameServer.sendChatMessage(null, null, '\u26EF ' + client.getName() + ' was lucky!');
        consumer.setSize(size * 2);
        return;
    }

    // Bad Luck, reduce Cell mass by 2
    if(dice < 0.20) {
        if(myMass > 100) {
            this.gameServer.sendChatMessage(null, null, '\u26EF ' + client.getName() + ' was unlucky!');
            consumer.setSize(size / 2);
            return;
        }
    }

    // Cell cannot split any further
    if (numSplits <= 0) {
        return;
    }

    // Warp Player~
    var pos = this.gameServer.getRandomPosition();
    this.gameServer.sendChatMessage(null, null, '\u26EF ' + client.getName() + ' found their cells moved somewhere else!');
    for (var j in client.cells) {
        client.cells[j].setPosition(pos);
        this.gameServer.updateNodeQuad(client.cells[j]);
    }

    var angle = 0;
    for (var k = 0; k < numSplits; k++) {
        angle += 6/numSplits;
        if (!this.gameServer.splitPlayerCell(client, consumer, angle, splitMass)) {
            break;
        }
    }
};

SurpriseCell.prototype.onAdd = function(gameServer) {
    gameServer.nodesSurprise.push(this);
};

SurpriseCell.prototype.onRemove = function(gameServer) {
    var index = gameServer.nodesSurprise.indexOf(this);
    if (index != -1) {
        gameServer.nodesSurprise.splice(index,1);
    }
};
