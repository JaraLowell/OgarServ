// Project imports
var FakeSocket = require('./FakeSocket');
var PacketHandler = require('../PacketHandler');

function BotLoader(gameServer) {
    this.gameServer = gameServer;
    this.loadNames();
}

module.exports = BotLoader;

BotLoader.prototype.getName = function () {
    var name = "";

    // Picks a random name for the bot
    if (this.randomNames.length > 0) {
        var index = (this.randomNames.length * Math.random()) >>> 0;
        name = '[BOT] ' + this.randomNames[index];
    } else {
        name = '[BOT] Bot' + ++this.nameIndex;
    }

    return name;
};

BotLoader.prototype.loadNames = function () {
    this.randomNames = [];
    var fs = require("fs");

    if (fs.existsSync("./botnames.txt")) {
        // Read and parse the names - filter out whitespace-only names
        this.randomNames = fs.readFileSync("./botnames.txt", "utf8").split(/[\r\n]+/).filter(function (x) {
            return x != ''; // filter empty names
        });
    }
    this.nameIndex = 0;
};

BotLoader.prototype.addBot = function () {
    var BotPlayer = require('./BotPlayer');
    var s = new FakeSocket(this.gameServer);
    s.playerTracker = new BotPlayer(this.gameServer, s);
    s.packetHandler = new PacketHandler(this.gameServer, s);

    // Add to client list
    this.gameServer.clients.push(s);

    // Add to world
    s.packetHandler.setNickname('<bot>' + this.getName());
};

BotLoader.prototype.addMinion = function(owner, name) {
    var MinionPlayer = require('./MinionPlayer');
    var s = new FakeSocket(this.gameServer);
    s.playerTracker = new MinionPlayer(this.gameServer, s, owner);
    s.packetHandler = new PacketHandler(this.gameServer, s);
    s.playerTracker.owner = owner;
    s.playerTracker.setColor(owner.color);

    if(owner._skin != '') s.playerTracker.setSkin(owner._skin);

    // Add to client list
    this.gameServer.clients.push(s);

    // Add to world & set name
    if (typeof name == "undefined" || name == "") {
        name = this.gameServer.config.defaultName;
    }
    s.packetHandler.setNickname(name);
};
