var Virus = require('./Virus')

function MovingVirus() {
    Virus.apply(this, Array.prototype.slice.call(arguments));

    this.skin = '%gas';
    this.name = '';
    this.color = {
        r: 10  + Math.floor(Math.random() * 32),
        g: 196 + Math.floor(Math.random() * 32),
        b: 10  + Math.floor(Math.random() * 32)
    };
    this.angle = 3.14*Math.random();
    this.setMoveEngineData(2+4*Math.random(), Infinity, 1);
}

module.exports = MovingVirus;
MovingVirus.prototype = new Virus();

// Unlike original viruses, these don't grow and split.  They move
MovingVirus.prototype.feed = function(feeder, gameServer) {
    // Just a bunch of inelastic collision (momentum) equations
    var m1 = feeder.mass * 0.25; // * 0.25 because it gets a little crazy otherwise
    var m2 = this.mass;
    var v1 = feeder.moveEngineSpeed;
    var v2 = this.moveEngineSpeed;
    var theta1 = feeder.angle;
    var theta2 = this.angle;

    var px = m1*v1*Math.cos(theta1) + m2*v2*Math.cos(theta2);
    var py = m1*v1*Math.sin(theta1) + m2*v2*Math.sin(theta2);

    this.angle = Math.atan2(py, px);
    var newSpeed = Math.sqrt(px*px + py*py)/m2; 

    this.setMoveEngineData(newSpeed, Infinity, 1);

    // Remove the feeder
    gameServer.removeNode(feeder);
};

MovingVirus.prototype.onAdd = function(gameServer) {
    gameServer.gameMode.movingVirusCount++;
    gameServer.nodesVirus.push(this);
};

MovingVirus.prototype.onRemove = function(gameServer) {
    gameServer.gameMode.movingVirusCount--;

    index = gameServer.nodesVirus.indexOf(this);
    if (index != -1) {
        gameServer.nodesVirus.splice(index, 1);
    } else {
        console.log("[Warning] Tried to remove a non existing virus!");
    }
};
