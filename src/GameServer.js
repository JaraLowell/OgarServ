// Library imports
var WebSocket = require('ws');
var url = require("url");
var _ = require("underscore");
var http = require('http');
var fs = require("fs");
var myos = require("os");
var ini = require('./modules/ini.js');

// Project imports
var Packet = require('./packet');
var PlayerTracker = require('./PlayerTracker');
var PacketHandler = require('./PacketHandler');
var Entity = require('./entity');
var Gamemode = require('./gamemodes');
var Logger = require('./modules/log');

// Polyfill for log10
Math.log10 = Math.log10 || function (x) { return Math.log(x) / Math.LN10; };

// GameServer implementation
function GameServer() {
    // Startup 
    this.run = true;
    this.lastNodeId = 1;
    this.lastPlayerId = 1;
    this.clients = [];
    this.nodes = [];
    this.nodesVirus = []; // Virus nodes
    this.nodesEjected = []; // Ejected mass nodes
    this.nodesPlayer = []; // Nodes controlled by players

    this.currentFood = 0;
    this.movingNodes = []; // For move engine
    this.pcount = 0;
    this.leaderboard = [];
    this.lb_packet = new ArrayBuffer(0); // Leaderboard packet

    this.log = new Logger();
    this.commands;    // Command handler
    this.banned = []; // List of banned IPs

    // Main loop tick
    this.time = new Date();
    this.startTime = this.time;
    this.tick = 0;      // 1 second ticks of mainLoop
    this.tickMain = 0;  // 50 ms ticks, 20 of these = 1 leaderboard update
    this.tickSpawn = 0; // Used with spawning food
    this.master = 0;    // Used for Master Ping spam protection
    this.sinfo = {
        players: 0,
        humans: 0,
        spectate: 0,
        bots: 0,
        death: 0
    }
    // Config
    this.sqlconfig = {
        host: '',
        user: '',
        password: '',
        database: '',
        table: ''
    };
    this.config = {                   // Border - Right: X increases, Down: Y increases (as of 2015-05-20)
        serverMaxConnections: 64,     // Maximum amount of connections to the server.
        serverMaxConnPerIp: 9,        // Max Connections from one IP.
        serverKickSpectator: 0,       // Kicks Spectators after x time
        serverPort: 4411,             // Server port
        serverVersion: 1,             // Protocol to use, 1 for new (v561.20 and up) and 0 for old 
        serverGamemode: 0,            // Gamemode, 0 = FFA, 1 = Teams
        serverResetTime: 24,          // Time in hours to reset (0 is off)
        serverBots: 0,                // Amount of player bots to spawn
        serverViewBaseX: 1200,        // Base view distance of players. Warning: high values may cause lag
        serverViewBaseY: 630,
        serverStatsPort: 88,          // Port for stats server. Having a negative number will disable the stats server.
        serverStatsUpdate: 60,        // Amount of seconds per update for the server stats
        serverAutoPause: 1,           // Enable or Disable audo gameworld pause
        serverLiveStats: 1,           // Show Info in console (needs a 127characters wide console or ssh sesion)
        serverLogLevel: 2,            // Logging level of the server. 0 = No logs, 1 = Logs the console, 2 = Logs console and ip connections
        serverLogToFile: 1,           // Log Info To File
        serverName: '',               // The name to display on the tracker (leave empty will show ip:port)
        serverAdminPass: '',          // Remote console commands password
        chatMaxMessageLength: 70,     // Maximum message length
        chatToConsole: 1,             // Log Chat To Console
        chatIntervalTime: 10000,      // Set the delay between messages and commands (in millisecond)
        borderLeft: 0,                // Left border of map (Vanilla value: 0)
        borderRight: 12000,           // Right border of map (Vanilla value: 11180.3398875)
        borderTop: 0,                 // Top border of map (Vanilla value: 0)
        borderBottom: 12000,          // Bottom border of map (Vanilla value: 11180.3398875)
        spawnInterval: 10,            // The interval between each food cell spawn in ticks (1 tick = 50 ms)
        foodSpawnAmount: 100,         // The amount of food to spawn per interval
        foodStartAmount: 1250,        // The starting amount of food in the map
        foodMaxAmount: 1750,          // Maximum food cells on the map
        foodMass: 1,                  // Starting food size (In mass)
        foodMassGrow: 1,              // Enable or Disable food mass grow
        foodMassGrowPossiblity: 50,   // Chance for a food to has the ability to be self growing
        foodMassLimit: 5,             // Maximum mass for a food can grow
        foodMassTimeout: 120,         // The amount of interval for a food to grow its mass (in seconds)
        virusMinAmount: 10,           // Minimum amount of viruses on the map.
        virusMaxAmount: 20,           // Maximum amount of viruses on the map. If this amount is reached, then ejected cells will pass through viruses.
        virusStartMass: 100,          // Starting virus size (In mass)
        virusFeedAmount: 7,           // Amount of times you need to feed a virus to shoot it
        mothercellMaxMass: 5000,      // Max mass the mothercell can get to. (0 for unlimited)
        ejectMass: 13,                // Mass of ejected cells
        ejectMassLoss: 15,            // Mass lost when ejecting cells
        ejectMassCooldown: 200,       // Time until a player can eject mass again
        ejectSpeed: 100,              // Base speed of ejected cells
        ejectSpawnPlayer: 50,         // Chance for a player to spawn from ejected mass
        playerStartMass: 10,          // Starting mass of the player cell.
        playerBotGrowEnabled: 1,      // If 0, eating a cell with less than 17 mass while cell has over 625 wont gain any mass
        playerMaxMass: 22500,         // Maximum mass a player can have
        playerSpeed: 30,              // Player base speed
        playerSplitSpeed: 130,        // Speed of the splitting cell.
        playerSmoothSplit: 0,         // Whether smooth splitting is used 1 is on
        playerMinMassEject: 32,       // Mass required to eject a cell
        playerMinMassSplit: 36,       // Mass required to split
        playerMaxCells: 16,           // Max cells the player is allowed to have
        playerRecombineTime: 30,      // Base amount of seconds before a cell is allowed to recombine
        playerMassAbsorbed: 1.0,      // Fraction of player cell's mass gained upon eating
        playerMassDecayRate: 0.002,   // Amount of mass lost per second
        playerMinMassDecay: 9,        // Minimum mass for decay to occur
        playerMaxNickLength: 15,      // Maximum nick length
        playerDisconnectTime: 60,     // The amount of seconds it takes for a player cell to be removed after disconnection (If set to -1, cells are never removed)
        playerFastDecay: 1,           // Double the decay if cell is over 5000 mass. (1 is off, 5 is decay 5x faster)
        tourneyMaxPlayers: 12,        // Maximum amount of participants for tournament style game modes
        tourneyPrepTime: 10,          // Amount of ticks to wait after all players are ready (1 tick = 1000 ms)
        tourneyEndTime: 30,           // Amount of ticks to wait after a player wins (1 tick = 1000 ms)
        tourneyTimeLimit: 20,         // Time limit of the game, in minutes.
        tourneyAutoFill: 0,           // If set to a value higher than 0, the tournament match will automatically fill up with bots after this amount of seconds
        tourneyAutoFillPlayers: 1,    // The timer for filling the server with bots will not count down unless there is this amount of real players
        experimentalIgnoreMax: 0,     // Ignore the foodMaxAmount when the mothercells shoot. (Set to 1 to turn it on)
        gameLBlength: 10              // Number of names to display on Leaderboard (Vanilla value: 10)
    };
    // Parse config
    this.loadConfig();

    // Load Bot system in config has it enabled. -1 is disabled
    if (this.config.serverBots != -1) {
        console.log("[" + this.formatTime() + "] * \u001B[33mLoading AI Bot System...\u001B[0m");
        var BotLoader = require('./ai/BotLoader');
        this.bots = new BotLoader(this);
    }

    // Gamemodes
    this.gameMode = Gamemode.get(this.config.serverGamemode);
}

module.exports = GameServer;

GameServer.prototype.start = function () {
    // Logging
    this.log.setup(this);

    if (this.banned.length > 0) {
        console.log("* \u001B[33mBan file loaded!\u001B[0m");
    }

    // Rcon Info
    if (this.config.serverAdminPass != '') {
        console.log("* \u001B[33mRcon enabled, passkey set to " + this.config.serverAdminPass + "\u001B[0m");
        console.log("* \u001B[33mTo use in chat type /rcon " + this.config.serverAdminPass + " <server command>\u001B[0m");
    }

    // My SQL erver
    if (this.sqlconfig.host != '') {
        console.log("* \u001B[33mMySQL config loaded Database set to " + this.sqlconfig.database + "." + this.sqlconfig.table + "\u001B[0m");
        var MySQL = require("./modules/mysql");
        this.mysql = new MySQL();
        this.mysql.init(this.sqlconfig);
        this.mysql.connect();
        this.mysql.createTable(this.sqlconfig.table, this.sqlconfig.database);
    }

    // Gamemode configurations
    this.gameMode.onServerInit(this);

    // Start the server
    this.socketServer = new WebSocket.Server({
        port: this.config.serverPort,
        disableHixie: true,
        clientTracking: true,
        perMessageDeflate: false
    }, function () {
        // Spawn starting food
        this.startingFood();

        // Start Main Loop
        this.MasterPing();
        setInterval(this.mainLoop.bind(this), 3);

        // Done
        console.log("* \u001B[33mListening on port " + this.config.serverPort + " \u001B[0m");
        console.log("* \u001B[33mCurrent game mode is " + this.gameMode.name + "\u001B[0m");

        // Player bots (Experimental)
        if (this.config.serverBots > 0) {
            for (var i = 0; i < this.config.serverBots; i++) {
                this.bots.addBot();
            }
            console.log("* \u001B[33mLoaded " + this.config.serverBots + " player bots\u001B[0m");
        }
        if (this.config.serverResetTime > 0) {
            console.log("* \u001B[33mAuto shutdown after " + this.config.serverResetTime + " hours\u001B[0m");
        }

        if (this.config.serverVersion == 1)
            console.log("* \u001B[33mProtocol set to new, clients with version 561.20 and up can connect to this server\u001B[0m");
        if (this.config.serverVersion == 0)
            console.log("* \u001B[33mProtocol set to old, clients with version 561.19 and older can connect to this server\u001B[0m");
    }.bind(this));

    this.socketServer.on('connection', connectionEstablished.bind(this));

    // Properly handle errors because some people are too lazy to read the readme
    this.socketServer.on('error', function err(e) {
        switch (e.code) {
            case "EADDRINUSE":
                console.log("[Error] Server could not bind to port! Please close out of Skype or change 'serverPort' in gameserver.ini to a different number.");
                break;
            case "EACCES":
                console.log("[Error] Please make sure you are running Ogar with root privileges.");
                break;
            default:
                console.log("[Error] Unhandled error code: " + e.code);
                break;
        }
        process.exit(1); // Exits the program
    });

    function connectionEstablished(ws) {
        if (this.config.serverMaxConnPerIp) {
            for (var cons = 1, i = 0, llen = this.clients.length; i < llen; i++) {
                if (this.clients[i].remoteAddress == ws._socket.remoteAddress) {
                    cons++;
                }
            }
            if (cons > this.config.serverMaxConnPerIp ) {
                ws.close();
                return;
            }
        }

        if (this.sinfo.players >= this.config.serverMaxConnections) { // Server full
            console.log("\u001B[33mClient tried to connect, but server player limit has been reached!\u001B[0m");
            ws.close();
            return;
        } else if (this.banned.indexOf(ws._socket.remoteAddress) != -1) { // Banned
            console.log("\u001B[33mClient " + ws._socket.remoteAddress + ", tried to connect but is banned!\u001B[0m");
            ws.close();
            return;
        }

        function close(error, err) {
            var client = this.socket.playerTracker;
            if (client.name == "" || client.name == "Spectator") client.name = "Client";

            if (err == 1)
                this.server.log.onDisconnect(client.name + " Disconnect: " + this.socket.remoteAddress + ":" + this.socket.remotePort + " Error " + error);
            else
                this.server.log.onDisconnect(client.name + " Disconnect: " + this.socket.remoteAddress + ":" + this.socket.remotePort);

            for (var i = 0, llen = client.cells.length; i < llen; i++) {
                var cell = client.cells[i];
                if (!cell) {
                    continue;
                }
                cell.calcMove = function () { }; // Clear function so that the cell cant move
                // this.server.removeNode(cell);
            }
            client.disconnect = this.server.config.playerDisconnectTime * 20;
            this.socket.sendPacket = function () { }; // Clear function so no packets are sent
        }

        this.log.onConnect("Client connect: " + ws._socket.remoteAddress + ":" + ws._socket.remotePort + " (" + cons + ") [origin " + ws.upgradeReq.headers.origin + ws.upgradeReq.url + "]");
        ws.remoteAddress = ws._socket.remoteAddress;
        ws.remotePort = ws._socket.remotePort;

        ws.playerTracker = new PlayerTracker(this, ws);
        ws.packetHandler = new PacketHandler(this, ws);
        ws.on('message', ws.packetHandler.handleMessage.bind(ws.packetHandler));

        if(this.config.serverKickSpectator > 0) {
            setTimeout(function () {
                if(ws.playerTracker.spectate && ws.playerTracker.name == "") {
                    ws.close();
                }
            }.bind(this), this.config.serverKickSpectator * 1000);
        }

        var bindObject = {server: this, socket: ws};
        ws.on('error', close.bind(bindObject, 1));
        ws.on('close', close.bind(bindObject, 0));
        this.clients.push(ws);

        this.MasterPing();
    }
    this.startStatsServer(this.config.serverStatsPort);
};

GameServer.prototype.getMode = function () {
    return this.gameMode;
};

GameServer.prototype.getNextNodeId = function () {
    // Resets integer
    if (this.lastNodeId > 2147483647) {
        this.lastNodeId = 1;
    }
    return this.lastNodeId++;
};

GameServer.prototype.getNewPlayerID = function () {
    // Resets integer
    if (this.lastPlayerId > 2147483647) {
        this.lastPlayerId = 1;
    }
    return this.lastPlayerId++;
};

GameServer.prototype.getRandomPosition = function () {
    return {
        x: Math.floor(Math.random() * (this.config.borderRight - this.config.borderLeft)) + this.config.borderLeft,
        y: Math.floor(Math.random() * (this.config.borderBottom - this.config.borderTop)) + this.config.borderTop
    };
};

GameServer.prototype.getRandomSpawn = function () {
    // Random spawns for players
    var pos;

    if (this.currentFood > 0) {
        // Spawn from food
        var node;
        for (var i = (this.nodes.length - 1); i > -1; i--) {
            // Find random food
            node = this.nodes[i];

            if (!node || node.inRange) {
                // Skip if food is about to be eaten/undefined
                continue;
            }

            if (node.getType() == 1) {
                pos = {x: node.position.x, y: node.position.y};
                this.removeNode(node);
                break;
            }
        }
    }

    if (!pos) {
        // Get random spawn if no food cell is found
        pos = this.getRandomPosition();
    }

    return pos;
};

GameServer.prototype.getRandomColor = function () {
    var colorRGB = [0xFF, 0x07, ((Math.random() * (256 - 7)) >> 0) + 7];
    colorRGB.sort(function () {
        return 0.5 - Math.random()
    });

    return {
        r: Math.round((colorRGB[0] + 210) / 2),
        b: Math.round((colorRGB[1] + 210) / 2),
        g: Math.round((colorRGB[2] + 210) / 2)
    };
};

GameServer.prototype.addNode = function (node) {
    this.nodes.push(node);

    // Adds to the owning player's screen
    if (node.owner) {
        node.setColor(node.owner.color);
        node.owner.cells.push(node);
        node.owner.socket.sendPacket(new Packet.AddNode(node));
    }

    // Special on-add actions
    node.onAdd(this);

    // Add to visible nodes
    for (var client, i = 0, llen = this.clients.length; i < llen; i++) {
        client = this.clients[i].playerTracker;
        if (!client) {
            continue;
        }

        // client.nodeAdditionQueue is only used by human players, not bots
        // for bots it just gets collected forever, using ever-increasing amounts of memory
        if ('_socket' in client.socket && node.visibleCheck(client.viewBox, client.centerPos)) {
            client.nodeAdditionQueue.push(node);
        }
    }
};

GameServer.prototype.removeNode = function (node) {
    // Remove from main nodes list
    var index = this.nodes.indexOf(node);
    if (index != -1) {
        this.nodes.splice(index, 1);
    }

    // Remove from moving cells list
    index = this.movingNodes.indexOf(node);
    if (index != -1) {
        this.movingNodes.splice(index, 1);
    }

    // Special on-remove actions
    node.onRemove(this);

    // Animation when eating
    for (var client, i = 0, llen = this.clients.length; i < llen; i++) {
        client = this.clients[i].playerTracker;
        if (!client) {
            continue;
        }
        // Remove from client
        client.nodeDestroyQueue.push(node);
    }
};

GameServer.prototype.cellTick = function () {
    // Move cells
    this.updateMoveEngine();
};

GameServer.prototype.spawnTick = function () {
    // Spawn food
    this.tickSpawn++;
    if (this.tickSpawn >= this.config.spawnInterval) {
        this.updateFood();  // Spawn food
        this.virusCheck();  // Spawn viruses
        this.tickSpawn = 0; // Reset
    }
};

GameServer.prototype.gamemodeTick = function () {
    // Gamemode tick
    this.gameMode.onTick(this);
};

GameServer.prototype.cellUpdateTick = function () {
    // Update cells
    this.updateCells();
};

GameServer.prototype.mainLoop = function () {
    // Timer
    var local = new Date();
    this.tick += (local - this.time);
    this.time = local;

    // Default 50 (aka 50ms) if change here change movespeed as well
    if (this.tick >= 50) {
        // Loop main functions
        if (this.run) {
            setTimeout(this.cellTick(), 0);
            setTimeout(this.spawnTick(), 0);
            setTimeout(this.gamemodeTick(), 0);
        }

        // Update the client's maps
        this.updateClients();
        this.getPlayers();
        this.tickMain++;

        if (this.config.serverLiveStats && this.tickMain >= 20) {
            this.log.onWriteConsole(this);
        }

        if (this.run) {
            // Update cells/leaderboard loop
            if (this.tickMain >= 20) { // 1 Second
                setTimeout(this.cellUpdateTick(), 0);

                // Update leaderboard with the gamemode's method
                this.leaderboard = [];
                this.gameMode.updateLB(this);
                this.lb_packet = new Packet.UpdateLeaderboard(this.leaderboard, this.gameMode.packetLB);
                this.pcount++;
            }
            // Check Bot Min Players
            if (((this.sinfo.humans + this.sinfo.bots) < this.config.serverBots) && (this.config.serverBots > 0)) {
                this.bots.addBot();
            }
        }

        // Pause and Unpause on player connects
        if (this.config.serverAutoPause == 1) {
            var temp = ( this.sinfo.players - this.sinfo.bots );
            if (!this.run && temp != 0) {
                console.log("[Auto Pause] \u001B[32mGame World Resumed!\u001B[0m");
                this.run = true;
            } else if (this.run && temp == 0 && (this.time - this.startTime) > 30000 && this.pcount > 60) {
                console.log("[Auto Pause] \u001B[31mGame World Paused!\u001B[0m");
                this.run = false;
                this.nodesEjected = [];
                this.movingNodes = [];
                this.leaderboard = [];
                this.gameMode.updateLB(this);
            }
        }

        // Auto Server Reset
        if (this.config.serverResetTime > 0 && ( local - this.startTime ) > ( this.config.serverResetTime * 3600000 )) {
            this.exitserver();
        }

        // Reset
        if (this.tickMain >= 20) {
            this.tickMain = 0;
        }
        this.tick = 0;

        // Send Master Server Ping
        if (this.time - this.master >= 1805000) {
            this.MasterPing();
        }
    }
};

GameServer.prototype.exitserver = function () {
    var packet = new Packet.BroadCast("*** Automatic Server Restart in 30 seconds to clean connections and memory ***");
    for (var i = 0, llen = this.clients.length; i < llen; i++) {
        this.clients[i].sendPacket(packet);
    }
    console.log("\u001B[31m*** Automatic Server Restart in 30 seconds ***\u001B[0m");
    this.config.serverMaxConnections = 0;

    var temp = setTimeout(function () {
        console.log("\u001B[31m*** Server Shutdown! ***\u001B[0m");

        // Close MySQL
        if (this.sqlconfig.host != '') {
            console.log("* \u001B[33mClosing mysql connection...\u001B[0m");
            this.mysql.close();
        }

        // Store Ban File
        if (this.banned.length > 0) {
            console.log("* \u001B[33mSaving ban file...\u001B[0m");
            fs.writeFileSync('./gameserver.ban', ini.stringify(this.banned));
        }

        this.socketServer.close();
        process.exit(1);
        window.close();
    }.bind(this), 30000);
};

GameServer.prototype.updateClients = function () {
    for (var i = 0, llen = this.clients.length; i < llen; i++) {
        if (typeof this.clients[i] == "undefined") {
            this.clients.splice(i, 1);
            continue;
        }
        this.clients[i].playerTracker.update();
    }
};

GameServer.prototype.startingFood = function () {
    // Spawns the starting amount of food cells
    for (var i = 0, llen = this.config.foodStartAmount; i < llen; i++) {
        this.spawnFood();
    }
};

GameServer.prototype.updateFood = function () {
    var toSpawn = Math.min(this.config.foodSpawnAmount, (this.config.foodMaxAmount - this.currentFood));
    for (var i = 0; i < toSpawn; i++) {
        this.spawnFood();
    }
};

GameServer.prototype.spawnFood = function () {
    var f = new Entity.Food(this.getNextNodeId(), null, this.getRandomPosition(), this.config.foodMass, this);
    f.setColor(this.getRandomColor());
    this.addNode(f);
    this.currentFood++;
};

GameServer.prototype.spawnPlayer = function (player, pos, mass) {
    if (pos == null) { // Get random pos
        pos = this.getRandomSpawn();
    }

    if (mass == null) {
        mass = this.config.playerStartMass;
    }

    // Spawn player and add to world
    var cell = new Entity.PlayerCell(this.getNextNodeId(), player, pos, mass);

    if ('_socket' in player.socket) {
        /* var zname = player.name;
         * if (zname === "") zname = "Un Named";
         *
         *       var packet = new Packet.BroadCast(zname + " joined the game!");
         *       for (var i = 0; i < this.clients.length; i++) {
         *           this.clients[i].sendPacket(packet);
         *       }
         */
        for (var i = 0, llen = this.clients.length; i < llen; i++) {
            if (this.clients[i].remoteAddress == player.socket.remoteAddress && this.clients[i].remotePort != player.socket.remotePort) {
                var packet = new Packet.BroadCast("*** You're logged in multiple times from your IP!, you might get lag due this ***");
                player.socket.sendPacket(packet);
                break;
            }
        }
        if (this.config.serverResetTime > 0) {
            var packet = new Packet.BroadCast("*** Remember, This server auto restarts after " + this.config.serverResetTime + " hours uptime! ***");
            player.socket.sendPacket(packet);
        }
        var info = "";
        if (player.skin) {
            info = " (" + player.skin.slice(1) + ")";
        }
        console.log("\u001B[33mCell " + player.name + info + " joined the game\u001B[0m");
    }

    this.addNode(cell);

    // Set initial mouse coords
    player.freeMouse = true;
    player.mouse = {x: pos.x, y: pos.y};
    player.startpos = {x: pos.x, y: pos.y};

    // 30s Timer, to kick players that no move within that time frame
    setTimeout(function () {
        if (player.mouse.x == player.startpos.x && player.mouse.y == player.startpos.y) {
            console.log("\u001B[35mCell " + player.name + " kicked for inactivity\u001B[0m");
            player.socket.close();
        }
    }.bind(this), 20000);
};

GameServer.prototype.virusCheck = function () {
    // Checks if there are enough viruses on the map
    if (this.nodesVirus.length < this.config.virusMinAmount) {
        // Spawns a virus
        var pos = this.getRandomPosition();
        var virusSquareSize = ( ( this.config.virusStartMass  ) * 110) >> 0;

        // Check for players
        for (var i = 0, llen = this.nodesPlayer.length; i < llen; i++) {
            var check = this.nodesPlayer[i];

            if (check.mass < this.config.virusStartMass) {
                continue;
            }

            // New way
            var squareR = check.getSquareSize(); // squared Radius of checking player cell
            var dx = check.position.x - pos.x;
            var dy = check.position.y - pos.y;
            if (dx * dx + dy * dy + virusSquareSize <= squareR)  return; // Collided
        }

        // Check for other virus
        for (var i = 0, llen = this.nodesVirus.length; i < llen; i++) {
            var check = this.nodesVirus[i];
            var squareR = check.getSquareSize();
            var dx = check.position.x - pos.x;
            var dy = check.position.y - pos.y;
            if (dx * dx + dy * dy + virusSquareSize <= squareR)  return; // Collided
        }

        // Spawn if no cells are colliding
        var v = new Entity.Virus(this.getNextNodeId(), null, pos, this.config.virusStartMass);
        this.addNode(v);
        this.spawnSpiral(pos, v.color);
    }
};

GameServer.prototype.getDist = function (x1, y1, x2, y2) {
    var deltaX = Math.abs(x1 - x2);
    var deltaY = Math.abs(y1 - y2);
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
};

GameServer.prototype.updateMoveEngine = function () {
   // Sort cells to move the cells close to the mouse first
    var srt = [],
        len = this.nodesPlayer.length;

    for (var i = 0; i < len; i++) {
        srt[i] = i;
    }

    for (var i = 0; i < len; i++) {
        // Recycle unused nodes
        if (typeof this.nodesPlayer[i] == "undefined") {
            this.nodesPlayer.splice(i, 1);
            len--;
            continue;
        }

        var clientI = this.nodesPlayer[srt[i]].owner;
        for (var j = i + 1; j < len; j++) {
            var clientJ = this.nodesPlayer[srt[j]].owner;
            if (this.getDist( this.nodesPlayer[srt[i]].position.x, this.nodesPlayer[srt[i]].position.y, clientI.mouse.x, clientI.mouse.y ) > 
                this.getDist( this.nodesPlayer[srt[j]].position.x, this.nodesPlayer[srt[j]].position.y, clientJ.mouse.x, clientJ.mouse.y )) {
                var aux = srt[i];
                srt[i] = srt[j];
                srt[j] = aux;
            }
        }
    }

    // Move player cells
    for (var i = 0, len = this.nodesPlayer.length; i < len; i++) {
        var cell = this.nodesPlayer[srt[i]];

        // Do not move cells that have already been eaten or have collision turned off
        if (!cell) {
            continue;
        }

        var client = cell.owner;
        cell.calcMove(client.mouse.x, client.mouse.y, this);

        // Check if cells nearby
        var list = this.getCellsInRange(cell);
        for (var j = 0, llen = list.length; j < llen; j++) {
            var check = list[j];

            // if we're deleting from this.nodesPlayer, fix outer loop variables; we need to update its length, and maybe 'i' too
            if (check.cellType == 0) {
                len--;
                if (check.nodeId < cell.nodeId) {
                    i--;
                }
            }

            // Consume effect
            check.onConsume(cell, this);

            // Remove cell
            check.setKiller(cell);
            this.removeNode(check);
        }
    }

    // A system to move cells not controlled by players (ex. viruses, ejected mass)
    for (var i = 0, llen = this.movingNodes.length; i < llen; i++) {
        var check = this.movingNodes[i];

        // Recycle unused nodes
        if (typeof check == "undefined") {
            this.movingNodes.splice(i, 1);
            llen--;
            continue;
        }

        if (check.moveEngineTicks > 0) {
            check.onAutoMove(this);
            // If the cell has enough move ticks, then move it
            check.calcMovePhys(this.config, this);
        } else {
            // Auto move is done
            check.moveDone(this);
            var index = this.movingNodes.indexOf(check);
            if (index != -1) {
                this.movingNodes.splice(index, 1);
                llen--;
            }
        }
    }
};

GameServer.prototype.setAsMovingNode = function (node) {
    this.movingNodes.push(node);
};

GameServer.prototype.splitCells = function (client) {
    var len = client.cells.length;
    if (len < this.config.playerMaxCells) {
        for (var i = 0; i < len; i++) {
            if (client.cells.length >= this.config.playerMaxCells) {
                break;
            }

            var cell = client.cells[i];
            if (!cell) {
                continue;
            }

            if (cell.mass < this.config.playerMinMassSplit) {
                continue;
            }

            // Get angle
            var deltaY = client.mouse.y - cell.position.y;
            var deltaX = client.mouse.x - cell.position.x;
            var angle = Math.atan2(deltaX, deltaY);

            // Get starting position
            var startPos = {
                x: cell.position.x,
                y: cell.position.y
            };
            // Calculate mass and speed of splitting cell
            var newMass = cell.mass / 2;
            cell.mass = newMass;

            // Create cell
            var split = new Entity.PlayerCell(this.getNextNodeId(), client, startPos, newMass, this);
            split.setAngle(angle);

            // var splitSpeed = this.config.playerSplitSpeed * Math.max((Math.log(newMass)/2.3) - 2.2,
            var splitSpeed = this.config.playerSplitSpeed * Math.max(Math.log10(newMass) - 2.2, 1); //

            split.setMoveEngineData(splitSpeed, 32, 0.85); //vanilla agar.io = 130, 32, 0.85
            split.calcMergeTime(this.config.playerRecombineTime);
            split.ignoreCollision = true;
            split.restoreCollisionTicks = 10; //vanilla agar.io = 10

            // Add to moving cells list
            this.setAsMovingNode(split);
            this.addNode(split);
        }
    }
};

GameServer.prototype.ejectBoom = function (pos, color) {
    var ejected = new Entity.EjectedMass(this.getNextNodeId(), null, {x: pos.x, y: pos.y}, this.config.ejectMass);
    ejected.setAngle(6.28*Math.random());
    ejected.setMoveEngineData(Math.random() * this.config.ejectSpeed, 35, 0.5 + 0.4 * Math.random());
    ejected.setColor(color);
    this.addNode(ejected);
    this.setAsMovingNode(ejected);
};

GameServer.prototype.ejectMass = function (client) {
    if (typeof client.lastEject == 'undefined' || this.time - client.lastEject >= this.config.ejectMassCooldown) {
        for (var i = 0, llen = client.cells.length; i < llen; i++) {
            var cell = client.cells[i];
            if ( (!cell) || (cell.mass < this.config.playerMinMassEject)) {
                continue;
            }
            var deltaY = client.mouse.y - cell.position.y;
            var deltaX = client.mouse.x - cell.position.x;
            var angle = Math.atan2(deltaX, deltaY);

            // Get starting position
            var size = cell.getSize() + 5;
            var startPos = {
                x: cell.position.x + ( (size + this.config.ejectMass) * Math.sin(angle) ),
                y: cell.position.y + ( (size + this.config.ejectMass) * Math.cos(angle) )
            };

            // Remove mass from parent cell
            cell.mass -= this.config.ejectMassLoss;
            // Randomize angle
            angle += (Math.random() * 0.4) - 0.2;

            // Create cell
            var ejected = new Entity.EjectedMass(this.getNextNodeId(), null, startPos, this.config.ejectMass);
            ejected.setAngle(angle);
            ejected.setMoveEngineData(this.config.ejectSpeed, 20);
            ejected.setColor(cell.getColor());

            this.addNode(ejected);
            this.setAsMovingNode(ejected);
            client.lastEject = this.time;
        }
    }
};

GameServer.prototype.spawnSpiral = function(position, mycolor) {
    var r = 150;
    var rnd = Math.random() * 3.14;

    var angle = rnd;
    for (var k = 0, dist = 0; k < 16; k++) {
        angle += 0.375;
        dist += 3.14;
        var pos = {x: position.x + (r * Math.sin(angle)), y: position.y + (r * Math.cos(angle))};

        var ejected = new Entity.EjectedMass(this.getNextNodeId(), null, pos, Math.round(dist / 4) + 1);
        ejected.angle = angle;
        ejected.setMoveEngineData(dist,15);
        ejected.setColor({r: Math.floor(mycolor.r / 80), g: Math.floor(mycolor.g / 80), b: Math.floor(mycolor.b / 80)});
        this.addNode(ejected);
        this.setAsMovingNode(ejected);
    }

    angle = rnd + 3.14;
    for (var k = 0, dist = 0; k < 16; k++) {
        angle += 0.375;
        dist += 3.14;
        var pos = {x: position.x + (r * Math.sin(angle)), y: position.y + (r * Math.cos(angle))};

        var ejected = new Entity.EjectedMass(this.getNextNodeId(), null, pos, Math.round(dist / 4) + 1);
        ejected.angle = angle;
        ejected.setMoveEngineData(dist,15);
        ejected.setColor(mycolor);
        this.addNode(ejected);
        this.setAsMovingNode(ejected);
    }
};

GameServer.prototype.newCellVirused = function (client, parent, angle, mass, speed) {
    // Before everything, calculate radius of the spawning cell.
    var size = Math.ceil(Math.sqrt(100 * mass));

    // Position of parent cell + a bit ahead to make sure parent cell stays where it is
    var startPos = {
        x: parent.position.x + (size / 85) * Math.sin(angle),
        y: parent.position.y + (size / 85) * Math.cos(angle)
    };
    // Create cell
    newCell = new Entity.PlayerCell(this.getNextNodeId(), client, startPos, mass);
    newCell.setAngle(angle);
    newCell.setMoveEngineData(newCell.getSpeed() * 9, 12); // Instead of fixed speed, use dynamic
    newCell.calcMergeTime(this.config.playerRecombineTime);
    newCell.ignoreCollision = true; // Remove collision checks

    // Add to moving cells list
    this.addNode(newCell);
    this.setAsMovingNode(newCell);
};

GameServer.prototype.shootVirus = function (parent) {
    var parentPos = {
        x: parent.position.x,
        y: parent.position.y
    };

    var newVirus = new Entity.Virus(this.getNextNodeId(), null, parentPos, this.config.virusStartMass);
    newVirus.setAngle(parent.getAngle());
    newVirus.setMoveEngineData(200, 20);

    // Add to moving cells list
    this.addNode(newVirus);
    this.setAsMovingNode(newVirus);
};

GameServer.prototype.getCellsInRange = function (cell) {
    var list = [];
    var squareR = cell.getSquareSize(); // Get cell squared radius

    // Loop through all cells that are visible to the cell. There is probably a more efficient way of doing this but whatever
    var len = cell.owner.visibleNodes.length;
    for (var i = 0; i < len; i++) {
        var check = cell.owner.visibleNodes[i];

        if (typeof check == 'undefined') {
            continue;
        }

        // Can't eat itself
        if (cell.nodeId == check.nodeId) {
            continue;
        }

        // if something already collided with this cell, don't check for other collisions
        if (check.inRange) {
            continue;
        }

        // Can't eat cells that have collision turned off
        if ((cell.owner == check.owner) && (cell.ignoreCollision)) {
            continue;
        }

        // AABB Collision
        if (!check.collisionCheck2(squareR, cell.position)) {
            continue;
        }

        // Cell type check - Cell must be bigger than this number times the mass of the cell being eaten
        var multiplier = 1.25;

        switch (check.getType()) {
            case 1: // Food cell
                list.push(check);
                check.inRange = true; // skip future collision checks for this food
                continue;
            case 2: // Virus
                multiplier = 1.33;
                break;
            case 5: // Beacon
                // This cell cannot be destroyed
                continue;
            case 0: // Players
                // Can't eat self if it's not time to recombine yet
                if (check.owner == cell.owner) {
                    if ((cell.recombineTicks > 0) || (check.recombineTicks > 0)) {
                        continue;
                    }
                    multiplier = 1.00;
                }

                // Can't eat team members
                if (this.gameMode.haveTeams) {
                    if (!check.owner) { // Error check
                        continue;
                    }

                    if ((check.owner != cell.owner) && (check.owner.getTeam() == cell.owner.getTeam())) {
                        continue;
                    }
                }
                break;
            default:
                break;
        }

        // Make sure the cell is big enough to be eaten.
        if ((check.mass * multiplier) > cell.mass) {
            continue;
        }

        // Eating range
        var xs = Math.pow(check.position.x - cell.position.x, 2);
        var ys = Math.pow(check.position.y - cell.position.y, 2);
        var dist = Math.sqrt(xs + ys);

        var eatingRange = cell.getSize() - check.getEatingRange(); // Eating range = radius of eating cell + 40% of the radius of the cell being eaten
        if (dist > eatingRange) {
            // Not in eating range
            continue;
        }

        // Add to list of cells nearby
        list.push(check);

        // Something is about to eat this cell; no need to check for other collisions with it
        check.inRange = true;
    }
    return list;
};

GameServer.prototype.getNearestVirus = function (cell) {
    // More like getNearbyVirus
    var virus = null;
    var r = 100; // Checking radius

    var topY = cell.position.y - r;
    var bottomY = cell.position.y + r;

    var leftX = cell.position.x - r;
    var rightX = cell.position.x + r;

    // Loop through all viruses on the map. There is probably a more efficient way of doing this but whatever
    for (var i = 0, llen = this.nodesVirus.length; i < llen; i++) {
        var check = this.nodesVirus[i];

        if (typeof check === 'undefined') {
            continue;
        }

        if (!check.collisionCheck(bottomY, topY, rightX, leftX)) {
            continue;
        }

        // Add to list of cells nearby
        virus = check;
        break; // stop checking when a virus found
    }
    return virus;
};

GameServer.prototype.updateCells = function () {
    if (!this.run) {
        // Server is paused
        return;
    }

    // Loop through all player cells
    var massDecay = 1 - (this.config.playerMassDecayRate * this.gameMode.decayMod);
    for (var i = 0, llen = this.nodesPlayer.length; i < llen; i++) {
        var cell = this.nodesPlayer[i];

        if (!cell) {
            continue;
        }

        if (cell.mass < 1) {
            // Cell has 0 Mass? Seriously... Buh bye~
            this.removeNode(cell);
            continue;
        }

        // Recombining
        if (cell.recombineTicks > 0) {
            cell.recombineTicks--;
        }

        // Mass decay
        if (cell.mass >= this.config.playerMinMassDecay) {
            if (cell.mass < 5000) {
                cell.mass *= massDecay;
            } else {
                // Faster decay when bigger then 5k
                cell.mass *= massDecay - ( this.config.playerFastDecay / 500);
            }
        }
    }
};

GameServer.prototype.loadConfig = function () {
    try {
        // Load the contents of the config file
        var load = ini.parse(fs.readFileSync('./gameserver.ini', 'utf-8'));

        for (var obj in load) {
            if (obj.substr(0, 2) != "//") this.config[obj] = load[obj];
        }
    } catch (err) {
        console.log("\u001B[33mConfig not found... Generating new config\u001B[0m");
        // Create a new config
        fs.writeFileSync('./gameserver.ini', ini.stringify(this.config));
    }

    try {
        // Load ban file...
        var load = ini.parse(fs.readFileSync('./gameserver.ban', 'utf-8'));

        for (var obj in load) {
            if (obj.substr(0, 2) != "//") {
                this.banned.push(load[obj]);
            }
        }
    } catch (err) {
        // Noting to do...
    }

    try {
        // Load the contents of the mysql config file
        var load = ini.parse(fs.readFileSync('./mysql.ini', 'utf-8'));
        for (var obj in load) {
            if (obj.substr(0, 2) != "//") this.sqlconfig[obj] = load[obj];
        }
    } catch (err) {
        // Noting to do...
    }
};

GameServer.prototype.switchSpectator = function (player) {
    if (this.gameMode.specByLeaderboard) {
        player.spectatedPlayer++;
        if (player.spectatedPlayer == this.leaderboard.length) {
            player.spectatedPlayer = 0;
        }
    } else {
        // Find next non-spectator with cells in the client list
        var oldPlayer = player.spectatedPlayer + 1;
        var count = 0;
        while (player.spectatedPlayer != oldPlayer && count != this.clients.length) {
            if (oldPlayer == this.clients.length) {
                oldPlayer = 0;
                continue;
            }
            if (!this.clients[oldPlayer]) {
                // Break out of loop in case client tries to spectate an undefined player
                player.spectatedPlayer = -1;
                break;
            }
            if (this.clients[oldPlayer].playerTracker.cells.length > 0) {
                break;
            }
            oldPlayer++;
            count++;
        }
        if (count == this.clients.length) {
            player.spectatedPlayer = -1;
        } else {
            player.spectatedPlayer = oldPlayer;
        }
    }
};

GameServer.prototype.formatTime = function () {
    var hour = this.time.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min = this.time.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    return hour + ":" + min;
};

GameServer.prototype.SendMessage = function (msg) {
    console.log('\u001B[36mServer: \u001B[0m' + msg);
    var packet = new Packet.BroadCast(msg);
    for (var i = 0, llen = this.clients.length; i < llen; i++) {
        if(!this.clients[i].remoteAddress) {
            continue;
        }
        this.clients[i].sendPacket(packet);
    }
};

GameServer.prototype.getPlayers = function () {
    for (var i = 0, humans = 0, bots = 0, players = 0, spectate = 0, client, llen = this.clients.length; i < llen; i++) {
        client = this.clients[i].playerTracker;
        if( client.cells.length > 0 || client.spectate ) -1 == client.disconnect && ("_socket" in this.clients[i] ? client.spectate ? spectate++ : humans++ : bots++, players++); else if (-1 == client.disconnect) players++;
    }
    this.sinfo.players = players;
    this.sinfo.humans = humans;
    this.sinfo.spectate = spectate;
    this.sinfo.bots = bots;
    this.sinfo.death = (players - (humans + spectate + bots));

    if((this.sinfo.death + spectate + humans) > 0) this.pcount = 0;
};

GameServer.prototype.postData = function(url_str, data, cb) {
   var parsed_url = url.parse(url_str),
       options = _.extend(parsed_url, {method: "POST"}),
       req = http.request(options, cb);
   req.write(data);
   req.end()
};

GameServer.prototype.MasterPing = function () {
    if (this.time - this.master >= 30000) {
        /* Report our pressence to the Master Server
         * To list us on the Master server website
         * located at http://ogar.mivabe.nl/master
         */
        this.master = this.time;
        var sName = 'Unnamed Server',
            pversion = 'true';

        /* Sending Keepalive Ping to MySQL */
        if (this.sqlconfig.host != '' && this.sinfo.humans == 0) this.mysql.ping();

        /* Sending Info */
        if (this.config.serverName != '') sName = this.config.serverName;
        if (this.config.serverVersion == 0) pversion = 'false';

        var data = 'current_players=' + this.sinfo.players +
                   '&alive=' + this.sinfo.humans +
                   '&spectators=' + (this.sinfo.spectate + this.sinfo.death) +
                   '&max_players=' + this.config.serverMaxConnections +
                   '&sport=' + this.config.serverPort +
                   '&gamemode=' + this.gameMode.name +
                   '&agario=' + pversion +
                   '&name=' + sName +
                   '&opp=' + myos.platform() + ' ' + myos.arch() +
                   '&uptime=' + process.uptime() +
                   '&start_time=' + this.startTime.getTime();

        var send = this.postData('http://ogar.mivabe.nl/master', data, function(res) {
            if ( res.statusCode != 200 ) {
                console.log("\u001B[31m[Tracker Error] " + res.statusCode + "\u001B[0m");
            }
        });
    }
};

// Stats server
GameServer.prototype.startStatsServer = function (port) {
    // Do not start the server if the port is negative
    if (port < 1) {
        return;
    }

    // Create stats
    this.stats = "Test";
    this.getStats();

    // Show stats
    this.httpServer = http.createServer(function (req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(200);
        res.end(this.stats);
    }.bind(this));

    this.httpServer.listen(port, function () {
        // Stats server
        console.log("* \u001B[33mLoaded stats server on port " + port + "\u001B[0m");
        setInterval(this.getStats.bind(this), this.config.serverStatsUpdate * 1000);
    }.bind(this));
};

GameServer.prototype.getStats = function () {
    var s = {
        'current_players': this.sinfo.players,
        'alive': this.sinfo.humans,
        'spectators': (this.sinfo.spectate + this.sinfo.death),
        'max_players': this.config.serverMaxConnections,
        'gamemode': this.gameMode.name,
        'start_time': this.startTime
    };
    this.stats = JSON.stringify(s);
};

WebSocket.prototype.sendPacket = function (packet) {
    // Send only if the buffer is empty
    if (this.readyState == WebSocket.OPEN && (this._socket.bufferSize == 0)) {
        try {
            this.send(packet.build(), {binary: true});
        } catch (e) {
            // console.log("\u001B[31m[Socket Error] " + e + "\u001B[0m");
        }
    } else {
        // Remove socket
        this.emit('close');
        this.removeAllListeners();
    }
};
