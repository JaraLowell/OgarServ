var BinaryWriter = require("./BinaryWriter");

function ServerStat(playerTracker) {
    this.playerTracker = playerTracker;
};

module.exports = ServerStat;

ServerStat.prototype.build = function (protocol) {
    var gameServer = this.playerTracker.gameServer;
    // Get server statistics
    var obj = {
        'name': gameServer.config.serverName,
        'mode': gameServer.gameMode.name,
        'uptime': process.uptime() >>> 0,
        'update': gameServer.updateTimeAvg.toFixed(3),
        'playersTotal': gameServer.sinfo.players,
        'playersAlive': gameServer.sinfo.humans,
        'playersSpect': gameServer.sinfo.spectate,
        'playersLimit': gameServer.config.serverMaxConnections
    };
    var json = JSON.stringify(obj);
    // Serialize
    var writer = new BinaryWriter();
    writer.writeUInt8(254);             // Message Id
    writer.writeStringZeroUtf8(json);   // JSON
    return writer.toBuffer();
};
