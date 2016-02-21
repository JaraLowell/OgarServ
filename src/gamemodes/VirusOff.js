var FFA = require('./FFA') //Base Gamemode
var Entity = require('../entity');

function VO() {
    FFA.apply(this, Array.prototype.slice.call(arguments));
    
    this.ID = 15;
    this.name = "Virus Off";
    this.decayMod = 1.0; // Modifier for decay rate (Multiplier)
    this.packetLB = 49; // Packet id for leaderboard packet (48 = Text List, 49 = List, 50 = Pie chart)
    this.haveTeams = false; // True = gamemode uses teams, false = gamemode doesnt use teams

    this.specByLeaderboard = false; // false = spectate from player list instead of leaderboard
}

module.exports = VO;
VO.prototype = new FFA();

// Override these

VO.prototype.onServerInit = function(gameServer) {
    // Called when the server starts
    gameServer.run = true;
};

VO.prototype.onPlayerSpawn = function(gameServer,player) {
    // Called when a player is spawned
    player.color = gameServer.getRandomColor(); // Random color
    gameServer.spawnPlayer(player);
};

VO.prototype.pressQ = function(gameServer,player) {
    // Called when the Q key is pressed
    if (player.spectate) {
        gameServer.switchSpectator(player);
    }
};

VO.prototype.pressW = function(gameServer,player) {
    for (var i = 0, llen = client.cells.length; i < llen; i++) {
        var cell = client.cells[i];

        if (!cell) {
            continue;
        }

        if (cell.mass < gameServer.config.playerMinMassEject) {
            continue;
        }

        var deltaY = client.mouse.y - cell.position.y;
        var deltaX = client.mouse.x - cell.position.x;
        var angle = Math.atan2(deltaX,deltaY);

        // Get starting position
        var size = cell.getSize() + 5;
        var startPos = {
            x: cell.position.x + ( (size + gameServer.config.ejectMass) * Math.sin(angle) ),
            y: cell.position.y + ( (size + gameServer.config.ejectMass) * Math.cos(angle) )
        };

        // Remove mass from parent cell
        cell.mass -= gameServer.config.ejectMassLoss;
        // Randomize angle
        angle += (Math.random() * .4) - .2;

        // Create cell
        var ejected = new Entity.Virus(gameServer.getNextNodeId(), null, startPos, gameServer.config.ejectMass);
        ejected.setAngle(angle);
        ejected.setMoveEngineData(gameServer.config.ejectSpeed, 20);
        ejected.setColor(cell.getColor());

        gameServer.addNode(ejected);
        gameServer.setAsMovingNode(ejected);
    }
};

VO.prototype.pressSpace = function(gameServer,player) {
    // Called when the Space bar is pressed
    gameServer.splitCells(player);
};
