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
    this.maxStage = 100; // When it reaches 50, rekt largest player
    this.minMass = this.mass;
    this.color = {
        r: 155,
        g: 211,
        b: 10
    };
}

module.exports = Beacon;
Beacon.prototype = new Cell();

Beacon.prototype.feed = function(feeder, gameServer) {
    // Increase the stage ('voltage' if you will)
    if(Math.random() < 0.25) {
        this.stage++;
    } else {
        gameServer.removeNode(feeder);
        return;
    }

    if(this.stage < 1) {
        gameServer.removeNode(feeder);

        if(this.stage < 0) return;

        if(this.stage == 0 ) {
            this.color.r = 155;
            this.color.g = 211;
            this.color.b = 10;
        }
    }

    this.mass = this.minMass + this.stage;

    // Spit out a nutrient
    this.spawnFood(gameServer);

    // Sometimes spit out a ejected mass
    if(Math.random() < 0.15) {
        this.spawnEjected(gameServer, gameServer.getRandomColor());
    }

    // Even more rarely spit out a moving virus
    // Spit out a moving virus in deterministic direction
    // every 30 shots
    if(this.stage % 30 && Math.random() < 0.15) {
        var moving = new MovingVirus(gameServer.getNextNodeId(), null, {x: this.position.x, y: this.position.y}, 125);
        moving.angle = feeder.angle;
        moving.setMoveEngineData(20+10*Math.random(), Infinity, 1);
        gameServer.movingNodes.push(moving);
        gameServer.addNode(moving);
        gameServer.SendMessage('\u26EF Beacon, released a virus!');
    }

    if(this.stage >= this.maxStage) {
        // Kill largest player and reset stage
        this.stage = -550;
        this.color.r = 90;
        this.color.g = 60;
        this.color.b = 10;

        var largest = gameServer.leaderboard[0];
        var color = gameServer.getRandomColor();
        if(largest) {
            color = largest.color;
            gameServer.SendMessage('\u26EF Beacon, targeted the largest player!!');
            // Do something to each of their cells:
            for(var i = 0, llen = largest.cells.length; i < llen; i++) {
                var cell = largest.cells[i];
                while(cell.mass > gameServer.config.ejectMassLoss) {
                    cell.mass -= gameServer.config.ejectMassLoss;
                    gameServer.ejectBoom(cell.position, cell.getColor());
                }
                cell.mass = gameServer.config.ejectMassLoss;
            }
        }

        // Give back mass
        for(var i = 0; i < this.maxStage/4; i++) {
            this.spawnEjected(gameServer, color);
        }

        this.mass = this.minMass;
    }

    // Indicate stage via color
    this.color.r += 1;
    this.color.g -= 1;
    gameServer.removeNode(feeder);
};

Beacon.prototype.onAdd = function(gameServer) {
    gameServer.SendMessage('\u26EF Beacon, cell spawned!');
    gameServer.gameMode.beacon = this;
};

Beacon.prototype.abs = MotherCell.prototype.abs;

Beacon.prototype.visibleCheck = MotherCell.prototype.visibleCheck;

Beacon.prototype.spawnFood = MotherCell.prototype.spawnFood;

Beacon.prototype.spawnEjected = function(gameServer, parentColor) {
    // Spawn spiral from the beacon 16 Ejected Mass Cells
    var r = 16 + this.getSize();
    var dist = 0;
    var angle = Math.random();

    for (var k = 0; k < 16; k++) {
        angle += 0.375;
        dist += 6;
        var pos = {
            x: this.position.x + ( r * Math.sin(angle) ),
            y: this.position.y + ( r * Math.cos(angle) )
        };
        // Spawn food
        var f = new EjectedMass(gameServer.getNextNodeId(), null, pos, (gameServer.config.ejectMass + (dist / 2)));
        f.setColor({r: 240 ,g:111 ,b:0});
        gameServer.addNode(f);
        gameServer.currentFood++;

        // Move engine
        f.angle = angle;
        f.setMoveEngineData(dist,15);
        gameServer.setAsMovingNode(f);
    }
};
