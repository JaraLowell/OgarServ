var Cell = require('./Cell');
var EjectedMass = require('./EjectedMass');
var MotherCell = require('./MotherCell');
var MovingVirus = require('./MovingVirus');

function Beacon() {
    Cell.apply(this, Array.prototype.slice.call(arguments));

    this.cellType = 5; // Another new cell type
    this.agitated = 1; // Drawing purposes
    this.spiked = 1;
    this.stage = 0;
    this.active = true;
    this.maxStage = 100; // When it reaches 50, rekt largest player
    this.minMass = this.mass;
    this.name = '';
    this.skin = '%gas';
    this.color = {
        r: 240,
        g: 240,
        b: 240
    };
}

module.exports = Beacon;
Beacon.prototype = new Cell();

Beacon.prototype.feed = function(feeder, gameServer) {
    // Increase the stage ('voltage' if you will)
    if(Math.random() < 0.25 && this.active) {
        this.stage++;
    } else {
        gameServer.removeNode(feeder);
        return;
    }

    this.mass = this.minMass + this.stage;

    // Spit out a nutrient
    this.spawnFood(gameServer);

    // Sometimes spit out a ejected mass
    if(Math.random() < 0.10) {
        this.spawnEjected(gameServer, this.color);
    }

    // Even more rarely spit out a moving virus
    // Spit out a moving virus in deterministic direction
    // every 30 shots
    if(this.stage % 30 && Math.random() < 0.10) {
        var moving = new MovingVirus(gameServer.getNextNodeId(), null, {x: this.position.x, y: this.position.y}, 125);
        moving.angle = feeder.angle;
        moving.setMoveEngineData(20+10*Math.random(), Infinity, 1);
        gameServer.movingNodes.push(moving);
        gameServer.addNode(moving);
        gameServer.SendMessage('\u26EF releasing a virus!');
    }

    if(this.stage >= this.maxStage) {
        // Kill largest player and reset stage
        this.stage = 0;
        this.mass = 100;
        this.active = false;
        this.color.r = 10;
        this.color.g = 10;
        this.color.b = 10;

        var largest = gameServer.leaderboard[0];
        var color = gameServer.getRandomColor();

        if(largest) {
            color = largest.color;
            gameServer.SendMessage('\u26EF targeting ' + largest.getName() + ', and releasing a cell unbinding virus!');
            // Do something to each of their cells:
            for(var i = 0, llen = largest.cells.length; i < llen; i++) {
                var cell = largest.cells[i];
                while(cell.mass > gameServer.config.ejectMassLoss) {
                    cell.mass -= Math.round(gameServer.config.ejectMassLoss * 6.66);
                    gameServer.ejectBoom(cell.position, cell.getColor());
                }
                cell.mass = gameServer.config.ejectMassLoss;
            }
        }

        this.mass = this.minMass;
        setTimeout(function () {
            this.mass = this.minMass;
            this.active = true;
            this.color.r = 240;
            this.color.g = 240;
            this.color.b = 240;
            this.spawnEjected(gameServer, this.color);
        }.bind(this), 600000);
    }

    // Indicate stage via color
    this.color.g -= 10;
    this.color.b -= 10;
    gameServer.removeNode(feeder);
};

Beacon.prototype.spawnEjected = function(gameServer, color) {
    if(gameServer.config.virusSpirals != 1) {
        return;
    }

    var r = 32 + this.getSize();
    var rnd = Math.random() * 3.14;

    var angle = rnd; // Starting angle
    for (var k = 0, dist = 0; k < 16; k++) {
        angle += 0.375;
        dist += 8;
        var pos = {x: this.position.x + (r * Math.sin(angle)), y: this.position.y + (r * Math.cos(angle))};

        var ejected = new EjectedMass(gameServer.getNextNodeId(), null, pos, (gameServer.config.ejectMass + (dist / 3)));
        ejected.angle = angle;
        ejected.setMoveEngineData(Math.floor(dist * 1.5),15);
        ejected.setColor({r: Math.floor(color.r / 25), g: Math.floor(color.g / 25), b: Math.floor(color.b / 25)});
        gameServer.addNode(ejected);
        gameServer.setAsMovingNode(ejected);
    }

    var angle = rnd + 3.14; // Starting angle
    for (var k = 0, dist = 0; k < 16; k++) {
        angle += 0.375;
        dist += 8;
        var pos = {x: this.position.x + (r * Math.sin(angle)), y: this.position.y + (r * Math.cos(angle))};

        var ejected = new EjectedMass(gameServer.getNextNodeId(), null, pos, (gameServer.config.ejectMass + (dist / 3)));
        ejected.angle = angle;
        ejected.setMoveEngineData(Math.floor(dist * 1.5),15);
        ejected.setColor(color);
        gameServer.addNode(ejected);
        gameServer.setAsMovingNode(ejected);
    }
};

Beacon.prototype.onAdd = function(gameServer) {
    gameServer.SendMessage('\u26EF Beacon, cell spawned!');
    gameServer.gameMode.beacon = this;
    this.spawnEjected(gameServer, this.color);
};

Beacon.prototype.abs = MotherCell.prototype.abs;

Beacon.prototype.visibleCheck = MotherCell.prototype.visibleCheck;

Beacon.prototype.spawnFood = MotherCell.prototype.spawnFood;
