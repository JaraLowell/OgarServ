var Cell = require('./Cell');
var EjectedMass = require('./EjectedMass');
var MotherCell = require('./MotherCell');
var MovingVirus = require('./MovingVirus');

function Beacon() {
    Cell.apply(this, Array.prototype.slice.call(arguments));
    this.cellType = 5;
    this.isAgitated = false;
    this.isSpiked = true;
    this.isMotherCell = false;
    this.stage = 0;
    this.active = true;
    this.maxStage = 100; // When it reaches 50, rekt largest player
    this.minMass = this.mass;
    this.start = {};
    this.startcolor = {};
}

module.exports = Beacon;
Beacon.prototype = new Cell();

Beacon.prototype.canEat = function (cell) {
    return cell.cellType == 3; // virus can eat ejected mass only
};

Beacon.prototype.onEat = function (prey) {
    // Increase the stage ('voltage' if you will)
    if(Math.random() < 0.25 && this.active) {
        this.stage++;
        this.mass += this.gameServer.config.ejectMassLoss;
    } else {
        return;
    }

    this.mass = this.minMass + this.stage;

    // Sometimes spit out a ejected mass
    if(Math.random() < 0.10) {
        this.gameServer.sendChatMessage(null, null, '\u26EF ~ blooming ~');
        this.spawnEjected(this.gameServer, this.color);
    } else {
        // Spit out a nutrient
        var size1 = this.getSize();
        var size2 = this.gameServer.config.foodMinSize;
        for (var i = 0; i < this.motherCellSpawnAmount; i++) {
            size1 = Math.sqrt(size1 * size1 - size2 * size2);
            size1 = Math.max(size1, this.motherCellMinSize);
            this.setSize(size1);

            // Spawn food with size2
            var angle = Math.random() * 2 * Math.PI;
            var r = this.getSize();
            var pos = {
                x: this.position.x + r * Math.sin(angle),
                y: this.position.y + r * Math.cos(angle)
            };

            // Spawn food
            var food = new Food(this.gameServer, null, pos, size2);
            food.setColor(this.gameServer.getRandomColor());
            this.gameServer.addNode(food);

            // Eject to random distance
            food.setBoost(32 + 32 * Math.random(), angle);
        }
    }

    // Even more rarely spit out a moving virus
    // Spit out a moving virus in deterministic direction
    // every 30 shots
    if(this.stage % 30 && Math.random() < 0.10) {
        this.gameServer.sendChatMessage(null, null, '\u26EF releasing a virus!');
        var v = new MovingVirus(this.gameServer, null, this.position, this.gameServer.config.virusMinSize - Math.floor(50*Math.random()));
        this.gameServer.movingNodes.push(v);
        this.gameServer.addNode(v);
    }

    if(this.stage >= this.maxStage) {
        // Kill largest player and reset stage
        this.stage = 0;
        this.mass = 100;
        this.active = false;
        this.color.r = 10;
        this.color.g = 10;
        this.color.b = 10;

        var largest = this.gameServer.leaderboard[0];
        var color = this.gameServer.getRandomColor();

        if(largest) {
            color = largest.color;
            this.gameServer.sendChatMessage(null, null, '\u26EF targeting ' + largest.getName() + ', and releasing a cell unbinding virus!');
            this.gameServer.splitCells(largest);
            // Do something to each of their cells:
            var loss = Math.round(this.gameServer.config.ejectSizeLoss * 1.25);
            for(var i = 0, size = 0, llen = largest.cells.length; i < llen; i++) {
                var node = largest.cells[i];
                if(!node) continue;
                size = node.getSize();
                node.setSize(32);
                while(size >= 32) {
                    size -= loss;
                    this.gameServer.ejectBoom(node.position, node.getColor());
                }
            }
        }

        this.mass = this.minMass;
        setTimeout(function () {
            this.mass = this.minMass;
            this.active = true;
            this.color = this.startcolor
            this.spawnEjected(this.gameServer, this.color);
        }.bind(this), 600000);
    }

    // Indicate stage via color
    this.color.r -= 1;
    this.color.g += 1;
};

Beacon.prototype.spawnEjected = function(gameServer, color) {
    var r = 400;
    var rnd = Math.random() * 3.14;
    var position = {
        x: 0,
        y: 0
    };

    var angle = rnd; // Starting angle
    for (var k = 0, dist = 0; k < 16; k++) {
        angle += 0.375;
        dist += 24;
        var pos = {x: Math.ceil(position.x + (r * Math.sin(angle))), y: Math.ceil(position.y + (r * Math.cos(angle)))};

        var ejected = new EjectedMass(gameServer, null, pos, 10 + Math.ceil(gameServer.config.ejectSize * dist / 250));
        ejected.angle = angle;
        ejected.setColor({r: Math.floor(color.r / 25), g: Math.floor(color.g / 25), b: Math.floor(color.b / 25)});
        ejected.setBoost(dist * 1.2, angle);
        gameServer.addNode(ejected);
    }

    var angle = rnd + 3.14; // Starting angle
    for (var k = 0, dist = 0; k < 16; k++) {
        angle += 0.375;
        dist += 24;
        var pos = {x: Math.ceil(position.x + (r * Math.sin(angle))), y: Math.ceil(position.y + (r * Math.cos(angle)))};

        var ejected = new EjectedMass(gameServer, null, pos, 10 + Math.ceil(gameServer.config.ejectSize * dist / 250));
        ejected.angle = angle;
        ejected.setColor(color);
        ejected.setBoost(dist * 1.2, angle);
        gameServer.addNode(ejected);
    }
};

Beacon.prototype.onAdd = function(gameServer) {
    var random = Math.floor(Math.random() * 21) - 10;
    var color = {
        r: (gameServer.config.virusColor.r + random > 255 ? 255 : gameServer.config.virusColor.r + random),
        g: (gameServer.config.virusColor.g + random > 255 ? 255 : gameServer.config.virusColor.g + random),
        b: (gameServer.config.virusColor.b + random > 255 ? 255 : gameServer.config.virusColor.b + random)
    };
    this.setColor(color);
    this.startcolor = color;
    gameServer.sendChatMessage(null, null, '\u26EF Beacon, cell spawned!');
    this.spawnEjected(gameServer, color);
};

Beacon.prototype.abs = MotherCell.prototype.abs;

Beacon.prototype.visibleCheck = MotherCell.prototype.visibleCheck;

Beacon.prototype.spawnFood = MotherCell.prototype.spawnFood;
