var Cell = require('./Cell');
var EjectedMass = require('../entity/EjectedMass');

function Virus() {
    Cell.apply(this, Array.prototype.slice.call(arguments));

    this.cellType = 2;
    this.skin = '%gas';
    this.name = '';
    this.spiked = 1;
    this.fed = 0;
    this.isMotherCell = false; // Not to confuse bots
}

module.exports = Virus;

Virus.prototype = new Cell();

Virus.prototype.calcMove = null; // Only for player controlled movement

Virus.prototype.feed = function(feeder, gameServer) {
    if (this.moveEngineTicks == 0) {
        this.setAngle(feeder.getAngle()); // Set direction if the virus explodes
    }
    this.mass += feeder.mass;
    this.fed++; // Increase feed count
    gameServer.removeNode(feeder);

    // Check if the virus is going to explode
    if (this.fed >= gameServer.config.virusFeedAmount) {
        this.mass = gameServer.config.virusStartMass; // Reset mass
        this.fed = 0;
        gameServer.shootVirus(this);
    }
};

Virus.prototype.getEatingRange = function() {
    return this.getSize() * 0.4; // 0 for ejected cells
};

Virus.prototype.onConsume = function(consumer, gameServer) {
    var client = consumer.owner;

    // Cell consumes mass and then splits
    consumer.addMass(this.mass);

    // Math for the Max number of splits
    var maxSplits = Math.floor(consumer.mass / gameServer.config.playerMaxCells) - 1;
    var numSplits = gameServer.config.playerMaxCells - client.cells.length;
    numSplits = Math.min(numSplits, maxSplits);

    // Cell cannot split any further
    if (numSplits <= 0) {
        return;
    }

    var mass = consumer.mass; // Mass of the consumer
    var splitMass = Math.min(mass / (numSplits + 1), 36); // Maximum size of new splits
    var bigSplits = []; // Big splits
    var speed = 150;

    // Big cells will split into cells larger than 24 mass
    // won't do the regular way unless it can split more than 4 times
    if      (numSplits == 1) bigSplits = [mass / 2];
    else if (numSplits == 2) bigSplits = [mass / 4, mass / 4];
    else if (numSplits == 3) bigSplits = [mass / 4, mass / 4, mass / 7];
    else if (numSplits == 4) bigSplits = [mass / 5, mass / 7, mass / 8, mass / 10];
    else {
        var endMass = mass - numSplits * splitMass;
        var m = endMass,
            i = 0;
        if (m > 466) { // Threshold
            // While can split into an even smaller cell (1000 => 333, 167, etc)
            var mult = 3.33;
            while (m / mult > 24) {
                m /= mult;
                mult = 2; // First mult 3.33, the next ones 2
                bigSplits.push(m >> 0);
                i++;
            }
        }
    }
    numSplits -= bigSplits.length;

    // Splitting
    if(bigSplits.length) {
        for (var k = 0,  angle = 0; k < bigSplits.length; k++) {
            angle = Math.random() * 6.28;
            speed = gameServer.config.playerSplitSpeed * Math.max((Math.log10(bigSplits[k]) - 2.2) * 1.65, 1);
            consumer.mass -= bigSplits[k];
            gameServer.newCellVirused(client, consumer, angle, bigSplits[k], speed);
        }
    }

    if(numSplits) {
        speed = gameServer.config.playerSplitSpeed * Math.max((Math.log10(splitMass) - 2.2) * 1.65, 1);
        for (var k = 0, angle = 0; k < numSplits; k++) {
            angle = Math.random() * 6.28; // Get directions of splitting cells
            consumer.mass -= splitMass;
            gameServer.newCellVirused(client, consumer, angle, splitMass, speed);
        }
    }

    // Prevent consumer cell from merging with other cells
    consumer.calcMergeTime(gameServer.config.playerRecombineTime);
};

Virus.prototype.onAdd = function(gameServer) {
    gameServer.nodesVirus.push(this);
};

Virus.prototype.onRemove = function(gameServer) {
    var index = gameServer.nodesVirus.indexOf(this);
    if (index != -1) {
        gameServer.nodesVirus.splice(index, 1);
    } else {
        console.log("[Warning] Tried to remove a non existing virus!");
    }
};
