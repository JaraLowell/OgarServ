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

    if(dice > 0.75) {
        this.gameServer.sendChatMessage(null, null, '\u26EF ' + client.getName() + ' was lucky!');
        consumer.setSize(size * 2);
        return;
    }
    if(dice < 0.25) {
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

    // Big cells will split into cells larger than 36 mass (1/4 of their mass)
    var bigSplits = 0;
    var endMass = consumer.mass - (numSplits * splitMass);
    if ((endMass > 300) && (numSplits > 0)) {
        bigSplits++;
        numSplits--;
    }
    if ((endMass > 1200) && (numSplits > 0)) {
        bigSplits++;
        numSplits--;
    }
    if ((endMass > 3000) && (numSplits > 0)) {
        bigSplits++;
        numSplits--;
    }

    // Splitting
    var angle = 0; // Starting angle
    for (var k = 0; k < numSplits; k++) {
        angle += 6/numSplits; // Get directions of splitting cells
        if (!this.gameServer.splitPlayerCell(client, consumer, angle, splitMass)) {
            break;
        }
    }

    for (var k = 0; k < bigSplits; k++) {
        angle = Math.random() * 6.28; // Random directions
        splitMass = consumer.mass / 4;
        if (!this.gameServer.splitPlayerCell(client, consumer, angle, splitMass)) {
            break;
        }
    }
};

SurpriseCell.prototype.onAdd = function(gameServer) {
    gameServer.gameMode.nodesSurprise.push(this);
};

SurpriseCell.prototype.onRemove = function(gameServer) {
    var index = gameServer.gameMode.nodesSurprise.indexOf(this);
    if (index != -1) {
        gameServer.gameMode.nodesSurprise.splice(index,1);
    }
};
