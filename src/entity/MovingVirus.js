var Virus = require('./Virus')

function MovingVirus() {
    Virus.apply(this, Array.prototype.slice.call(arguments));
    this.angle = 3.14*Math.random();
    this.speed = (0.25 + 3*Math.random());
    this.setBoost(Infinity, this.angle, this.speed);
}

module.exports = MovingVirus;
MovingVirus.prototype = new Virus();

MovingVirus.prototype.canEat = function (cell) {
    return cell.cellType == 3; // virus can eat ejected mass only
};

// Unlike original viruses, these don't grow and split.  They move
MovingVirus.prototype.onEat = function(feeder) {
    // Just a bunch of inelastic collision (momentum) equations
    // Proberbly need to look in to this at  a later date... but for now
    // it semi works again.
    var m1 = 230;
    var m2 = 100;
    var v1 = (0.25 + 3*Math.random());
    var v2 = this.speed;

    var theta1 = feeder.getAngle();
    var theta2 = this.angle;

    var px = m1*v1*Math.cos(theta1) + m2*v2*Math.cos(theta2);
    var py = m1*v1*Math.sin(theta1) + m2*v2*Math.sin(theta2);

    this.angle = Math.atan2(py, px);
    this.speed = v1;
    this.setBoost(Infinity, this.angle, this.speed);
};

MovingVirus.prototype.onAdd = function(gameServer) {
    var random = Math.floor(Math.random() * 21) - 10;
    this.setColor({
        r: (gameServer.config.virusColor.r + random > 255 ? 255 : gameServer.config.virusColor.r + random),
        g: (gameServer.config.virusColor.g + random > 255 ? 255 : gameServer.config.virusColor.g + random),
        b: (gameServer.config.virusColor.b + random > 255 ? 255 : gameServer.config.virusColor.b + random)
    });
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
