var FFA = require('./FFA'); // Base gamemode
var Entity = require('../entity');
var Logger = require('../modules/Logger');

function Christmas() {
    FFA.apply(this, Array.prototype.slice.call(arguments));

    this.ID = 4;
    this.name = "Christmas";
    this.specByLeaderboard = true;

    // Mother Cell
    this.nodesMother = [];
    this.motherSpawnInterval = 25 * 5;  // How many ticks it takes to spawn another mother cell (5 seconds)
    this.motherUpdateInterval = 5;     // How many ticks it takes to spawn mother food (1 second)
    this.motherMinAmount = 20;
    this.motherMaxAmount = 30;
    this.tickMotherSpawn = 0;
    this.tickMotherUpdate = 0;
}

module.exports = Christmas;
Christmas.prototype = new FFA();

// Gamemode Specific Functions
Christmas.prototype.spawnMotherCell = function (gameServer) {
    // Checks if there are enough mother cells on the map
    if (this.nodesMother.length >= this.motherMinAmount) {
        return;
    }
    // Spawns a mother cell
    var pos = gameServer.getRandomPosition();
    if (gameServer.willCollide(pos, 149)) {
        // cannot find safe position => do not spawn
        return;
    }
    // Spawn if no cells are colliding
    var mother = new Entity.MotherCell(gameServer, null, pos, null);
    gameServer.addNode(mother);
};

// Override
Christmas.prototype.onServerInit = function (gameServer) {
    // Called when the server starts
    gameServer.run = true;
    // Enebale Virus Spirals
    gameServer.config.virusSpirals = 1;
    // Enable Moving Virusses
    gameServer.config.virusMoving = 1;
    // Set Helloween Color Theme
    gameServer.config.virusColor = {r:60, g: 141, b: 13}

    var mapSize = Math.max(gameServer.border.width, gameServer.border.height);

    // Good Values are :
    gameServer.config.foodMinAmount = Math.ceil(mapSize / 6);
    gameServer.config.foodMaxAmount = Math.ceil(mapSize / 4);
    gameServer.config.virusMinAmount = Math.ceil(mapSize / 850);
    gameServer.config.virusMaxAmount = Math.ceil(mapSize / 350);
    this.motherMinAmount = Math.ceil(mapSize / 2000);
    this.motherMaxAmount = Math.ceil(this.motherMinAmount * 1.5);

    var self = this;
    // Override

    // Special virus mechanics
    Entity.Virus.prototype.onEat = function (prey) {
        // Pushes the virus
        var angle = prey.isMoving ? prey.getAngle() : this.getAngle();
        this.setBoost(320, angle);
    };
    Entity.Food.prototype.onAdd = function () {
        var random = Math.floor(Math.random() * 51) - 25;
        this.setColor({
            r: 200 + random,
            g: 200 + random,
            b: 200 + random,
        });
//        if(random > 18) {
//            this.angle = 3.14*Math.random();
//            this.speed = (0.15 + 3*Math.random());
//            this.setBoost(Infinity, this.angle, this.speed);
//        }
        gameServer.currentFood++;
    };
    Entity.MotherCell.prototype.onAdd = function () {
        var random = Math.floor(Math.random() * 21) - 10;
        this.setColor({
            r: gameServer.config.virusColor.r + random,
            g: gameServer.config.virusColor.g + random,
            b: gameServer.config.virusColor.b + random,
        });
        self.nodesMother.push(this);
    };
    Entity.MotherCell.prototype.onRemove = function () {
        var index = self.nodesMother.indexOf(this);
        if (index != -1) {
            self.nodesMother.splice(index, 1);
        } else {
            Logger.error("Christmas.onServerInit.MotherVirus.onRemove: Tried to remove a non existing virus!");
        }
    };
};

Christmas.prototype.onChange = function (gameServer) {
    // Remove all mother cells
    for (var i in this.nodesMother) {
        gameServer.removeNode(this.nodesMother[i]);
    }
    this.nodesMother = [];
    // Add back default functions
    Entity.Virus.prototype.onEat = require('../Entity/Virus').prototype.onEat;
    Entity.MotherCell.prototype.onAdd = require('../Entity/MotherCell').prototype.onAdd;
    Entity.MotherCell.prototype.onRemove = require('../Entity/MotherCell').prototype.onRemove;
};

Christmas.prototype.onTick = function (gameServer) {
    if(!this.beacon) {
        var pos = {
            x: 0,
            y: 0
        };
        this.beacon = new Entity.Beacon(gameServer, null, pos, 300);
        gameServer.addNode(this.beacon);
    }

    // Mother Cell Spawning
    if (this.tickMotherSpawn >= this.motherSpawnInterval) {
        this.tickMotherSpawn = 0;
        this.spawnMotherCell(gameServer);
    } else {
        this.tickMotherSpawn++;
    }

    if (this.tickMotherUpdate >= this.motherUpdateInterval) {
        this.tickMotherUpdate = 0;
        for (var i = 0; i < this.nodesMother.length; i++) {
            this.nodesMother[i].onUpdate();
        }
    } else {
        this.tickMotherUpdate++;
    }
};
