var Cell = require('./Cell');
var Virus = require('./Virus');
var MotherCell = require('./MotherCell');

function StickyCell() {
    Cell.apply(this, Array.prototype.slice.call(arguments));

    this.cellType = 4; // New cell type
    this.isAgitated = true;
    this.isSpiked = false;
    this.isMotherCell = false;
    this.acquired = undefined;
    this.radius = this.getSize();
    this.color = {
        r: 210 + Math.floor(Math.random() * 20),
        g: 30 +  Math.floor(Math.random() * 20),
        b:       Math.floor(Math.random() * 20)
    };
}

module.exports = StickyCell;
StickyCell.prototype = new Cell();

StickyCell.prototype.update = function(gameServer) {
    if(this.acquired) {
        if(this.acquired.killedBy) {
            // Cell was killed and we need to free it
            this.acquired = undefined;
        } else {
            // Remain attached to the acquired victim
            var check = this.acquired;
            var dist = check.getDist(check.position.x, check.position.y, this.position.x, this.position.y);
            var collisionDist = check.getSize() + this.radius;

            var dY = this.position.y - check.position.y;
            var dX = this.position.x - check.position.x;
            var theta = Math.atan2(dY, dX);
            var dMag = collisionDist - dist - 20; // -20 So it's not ghosting

            this.position.x += (dMag * Math.cos(theta)) >> 0;
            this.position.y += (dMag * Math.sin(theta)) >> 0;

            // Gradually degrade in color
            if (this.color.r > 210) this.color.r *= 0.999;
            if (this.color.g > 30)  this.color.g *= 0.999;
            if (this.color.b > 0)   this.color.b *= 0.999;
        }
    }

    // Look for victims
    for (var i in gameServer.nodes) {
        var check = gameServer.nodes[i];

        // Do boundary (non-absorbing) collision check
        var collisionDist = check.getSize() + this.radius;

        if(!check.simpleCollide(check.position.x, check.position.y,this,collisionDist)) {
            check.isAgitated = false;
            continue;
        }

        // Take away mass from colliders
        if(check.mass > 10) { check.mass *= 0.9975; }

        if(!this.acquired) {
            // Acquire victim cell if no victim acquired
            this.acquired = check;
        } else if(check != this.acquired &&
                  check.mass > this.acquired.mass) {
            // Acquire new victim, if their mass is greater than current victims mass
            this.acquired = check;
        }
    }
};

StickyCell.prototype.onAdd = function(gameServer) {
    gameServer.gameMode.nodesSticky.push(this);
    gameServer.sendChatMessage(null, null, '\u26EF a sticky cell was spawned!');
};

StickyCell.prototype.onConsume = function(consumer, gameServer) {
    // Explode
    this.virusOnConsume(consumer, gameServer);

    // LOSE mass if it is attached to us, gain otherwise
    // (subtract twice because virusOnConsume already adds mass)
    if(this.acquired && consumer.owner == this.acquired.owner) {
        consumer.mass -= 2*this.mass;
        if(consumer.mass < 10) { consumer.mass = 10; }
    }
};

StickyCell.prototype.virusOnConsume = Virus.prototype.onConsume;

StickyCell.prototype.onRemove = function(gameServer) {
    var index = gameServer.gameMode.nodesSticky.indexOf(this);
    if (index != -1) {
        gameServer.gameMode.nodesSticky.splice(index,1);
    }
};

StickyCell.prototype.abs = MotherCell.prototype.abs;
StickyCell.prototype.visibleCheck = MotherCell.prototype.visibleCheck;
