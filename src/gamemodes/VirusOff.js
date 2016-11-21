var FFA = require('./FFA'); // Base gamemode

function VO() {
    FFA.apply(this, Array.prototype.slice.call(arguments));

    this.ID = 15;
    this.name = "Virus Off";
    this.specByLeaderboard = true;
}

module.exports = VO;
VO.prototype = new FFA();

// Gamemode Specific Functions
VO.prototype.onServerInit = function(gameServer) {
    // Called when the server starts
    gameServer.run = true;

    gameServer.config.virusSpirals = 0;
    gameServer.config.virusMoving = 0;
    gameServer.config.virusMinAmount = 0;
    gameServer.config.virusMaxAmount = 0;
    gameServer.config.ejectVirus = 1;
};
