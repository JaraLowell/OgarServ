// Library imports
var WebSocket = require('ws');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var fs = require("fs");
var os = require('os');
var EOL = require('os').EOL;
var ini = require('./modules/ini.js');
var QuadNode = require('quad-node');
var PlayerCommand = require('./modules/PlayerCommand');
var punycode = require('punycode');

// Project imports
var Packet = require('./packet');
var PlayerTracker = require('./PlayerTracker');
var PacketHandler = require('./PacketHandler');
var Entity = require('./entity');
var Gamemode = require('./gamemodes');
var Logger = require('./modules/Logger');
var UserRoleEnum = require('./enum/UserRoleEnum');
var BinaryReader = require('./packet/BinaryReader');

// GameServer implementation
function GameServer() {
    this.httpServer = null;
    this.wsServer = null;

    // RCon Add-on
    this.wsAdmin = null;
    this.ConnectedAdmins = [];

    // Global Variables
    this.run = true;
    this.lastNodeId = 1;
    this.lastPlayerId = 1;
    this.socketCount = 0;
    this.largestClient;
    this.clients = [];
    this.nodes = [];
    this.nodesVirus = [];   // Virus nodes
    this.movingNodes = [];  // For move engine
    this.nodesEjected = []; // Ejected mass nodes
    this.quadTree = null;
    this.pcells = 0;
    this.currentFood = 0;
    this.leaderboard = [];
    this.leaderboardType = -1; // no type
    this.sinfo = {players: 0, humans: 0, spectate: 0, bots: 0, death: 0}
    this.master = new Date().getTime();
    this.bots;
    this.commands; // Command handler

    // Main loop tick
    this.startTime = new Date();
    this.timeStamp = 0;
    this.updateTime = 0;
    this.updateTimeAvg = 0;
    this.timerLoopBind = null;
    this.mainLoopBind = null;

    this.tickCounter = 0;
    this.setBorder(10000, 10000);
    this.mempeek = 0;

    // Config
    this.config = require('./modules/default.json');

    this.version = this.config.version;
    this.ipBanList = [];
    this.minionTest = [];
    this.userList = [];
    this.badWords = [];

    // Parse config
    this.loadConfig();
    this.loadIpBanList();
    this.loadUserList();
    this.loadBadWords();

    // Load Bot system in config has it enabled. -1 is disabled
    if (this.config.serverBots != -1) {
        Logger.info("Loading AI Bot System...");
        var BotLoader = require('./ai/BotLoader');
        this.bots = new BotLoader(this);
    }

    this.setBorder(this.config.borderWidth, this.config.borderHeight);
    this.quadTree = new QuadNode(this.border, 64, 32);

    // Gamemodes
    this.gameMode = Gamemode.get(this.config.serverGamemode);
}

module.exports = GameServer;

GameServer.prototype.start = function () {
    this.timerLoopBind = this.timerLoop.bind(this);
    this.mainLoopBind = this.mainLoop.bind(this);

    // Gamemode configurations
    this.gameMode.onServerInit(this);

    var wsOptions = {
        port: this.config.serverPort,
        disableHixie: true,
        clientTracking: false,
        perMessageDeflate: false,
        maxPayload: 2048
    };

    this.wsServer = new WebSocket.Server(wsOptions, function () {
        // Spawn starting food
        this.spawnCells();

        // Start Main Loop
        setTimeout(this.timerLoopBind, 2);

        // Done
        Logger.info("Listening on port " + this.config.serverPort);
        Logger.info("Current game mode is " + this.gameMode.name);

    }.bind(this));

    this.wsServer.on('error', this.onServerSocketError.bind(this));
    this.wsServer.on('connection', this.onClientSocketOpen.bind(this));

    if(this.config.serverRconPort > 0) {
        var wsOptions = {
            port: this.config.serverRconPort,
            disableHixie: true,
            clientTracking: false,
            perMessageDeflate: false,
            maxPayload: 1024
        };
        this.wsAdmin = new WebSocket.Server(wsOptions, function () {
            Logger.info("Remote Admin on port " + this.config.serverRconPort);
        }.bind(this));

        this.wsAdmin.on('connection', this.onAdminSocketOpen.bind(this));
    }
};

// ******************************************** WS ******************************************** //

GameServer.prototype.onServerSocketError = function (error) {
    Logger.error("WebSocket: " + error.code + " - " + error.message);
    switch (error.code) {
        case "EADDRINUSE":
            Logger.error("Server could not bind to port " + this.config.serverPort + "!");
            Logger.error("Please close out of Skype or change 'serverPort' in gameserver.ini to a different number.");
            break;
        case "EACCES":
            Logger.error("Please make sure you are running Ogar with root privileges.");
            break;
    }
    process.exit(1); // Exits the program
};

GameServer.prototype.onAdminSocketOpen = function (ws) {
    ws.isConnected = true;
    ws.remoteAddress = ws._socket.remoteAddress;
    ws.remotePort = ws._socket.remotePort;
    ws.admin = false;
    var pwd = null;
    for (var i = 0, len = this.userList.length; i < len; i++) {
        var user = this.userList[i];
        if (user.ip == ws.remoteAddress) {
            pwd = user.password;
            break;
        }
    }

    Logger.warn("\u001B[32mRCon connected " + ws.remoteAddress + ":" + ws.remotePort + " [origin: \"" + ws.upgradeReq.headers.origin + "\"]");
    var self = this;
    var onMessage = function (message, admin) {
        var reader = new BinaryReader(message);
        var packetId = reader.readUInt8();
        if(packetId == 78) {
            var flags = reader.readUInt8();
            var str = reader.readStringZeroUnicode();
            if(flags == 0 && admin) {
                var split = str.split(" ");
                var first = split[0].toLowerCase();
                var execute = self.commands[first];
                if (typeof execute != 'undefined') {
                    execute(self, split);
                } else {
                    self.sendChatMessage(null , null, str);
                }
            } else if(flags == 1 && str == pwd && pwd != null) {
                ws.admin = true;
                ws.send(JSON.stringify({"Package":2,"Account":"Admin"}));
            } else if(flags == 1 && str != "" && str.toLowerCase() != "guest")
                ws.send(JSON.stringify({"Package":3,"from":"\uD83D\uDCE2","color":"#FF0000","msg":"Password is incorrect, setting role to Guest"}));
        } else ws.close();
    };
    var onClose = function (reason) {
        ws.isConnected = false;
        ws.sendPacket = function (data) { };
        var index = self.ConnectedAdmins.indexOf(this);
        if (index != -1) {
            Logger.warn("\u001B[31mRCon disconected " + self.ConnectedAdmins[index].remoteAddress);
            self.ConnectedAdmins.splice(index);
        }
    };
    var onError = function (error) {
        ws.sendPacket = function (data) { };
    };
    ws.on('message', onMessage, ws.admin);
    ws.on('error', onError);
    ws.on('close', onClose);
    this.ConnectedAdmins.push(ws);
};

GameServer.prototype.onClientSocketOpen = function (ws) {
    var logip = ws._socket.remoteAddress + ":" + ws._socket.remotePort;
    ws.on('error', function (err) {
        Logger.writeError("[" + logip + "] " + err.stack);
    });
    if (this.socketCount >= this.config.serverMaxConnections) {
        ws.close(1000, "No slots");
        return;
    }
    if (this.checkIpBan(ws._socket.remoteAddress)) {
        ws.close(1000, "IP banned");
        return;
    }
    if (this.config.serverIpLimit > 0) {
        var ipConnections = 0;
        for (var i = 0; i < this.clients.length; i++) {
            var socket = this.clients[i];
            if (!socket.isConnected || socket.remoteAddress != ws._socket.remoteAddress)
                continue;
            ipConnections++;
        }
        if (ipConnections >= this.config.serverIpLimit) {
            ws.close(1000, "IP limit reached");
            return;
        }
    }

    if(ws.upgradeReq.headers.origin == 'http://agar.io') {
        ws.close(1000, "No agar.io clients!");
        return;
    }

    ws.isConnected = true;
    ws.remoteAddress = ws._socket.remoteAddress;
    ws.remotePort = ws._socket.remotePort;
    ws.lastAliveTime = +new Date;

    ws.playerTracker = new PlayerTracker(this, ws);
    ws.packetHandler = new PacketHandler(this, ws);
    ws.playerCommand = new PlayerCommand(this, ws.playerTracker);

    var self = this;
    var onMessage = function (message) {
        self.onClientSocketMessage(ws, message);
    };
    var onError = function (error) {
        self.onClientSocketError(ws, error);
    };
    var onClose = function (reason) {
        self.onClientSocketClose(ws, reason);
    };
    ws.on('message', onMessage);
    ws.on('error', onError);
    ws.on('close', onClose);
    this.socketCount++;
    this.clients.push(ws);

    ws.playerTracker.origen = punycode.toUnicode(ws.upgradeReq.headers.origin.replace(/^https?\:\/\//i, ""));

    Logger.warn("\u001B[32mClient connected " + ws.remoteAddress + ":" + ws.remotePort + " [origin: \"" + ws.playerTracker.origen + "\"]");
    // Logger.warn("\u001B[32m" + JSON.stringify(ws.upgradeReq.headers) );

    if('192.168.178.29' == ws.remoteAddress) ws.playerTracker.setName('\u2728\u2726 \uD835\uDCD9\uD835\uDCEA\uD835\uDCFB\uD835\uDCEA \u2728\u2726');

    //Anti Bot
    if (!ws.upgradeReq.headers['user-agent']) {
        ws.playerTracker.isMinion = true;
        console.log( JSON.stringify(ws.upgradeReq.headers) );
    }

    // Minion detection
    if (this.config.serverMinionThreshold) {
        if ((ws.lastAliveTime - this.startTime) / 1000 >= this.config.serverMinionIgnoreTime) {
            if (this.minionTest.length >= this.config.serverMinionThreshold) {
                ws.playerTracker.isMinion = true;
                for (var i = 0; i < this.minionTest.length; i++) {
                    var playerTracker = this.minionTest[i];
                    if (!playerTracker.socket.isConnected) continue;
                    playerTracker.isMinion = true;
                }
                if (this.minionTest.length) {
                    this.minionTest.splice(0, 1);
                }
            }
            this.minionTest.push(ws.playerTracker);
        }
    }
};

GameServer.prototype.onClientSocketClose = function (ws, code) {
    if (this.socketCount < 1) {
        Logger.error("GameServer.onClientSocketClose: socketCount=" + this.socketCount);
    } else {
        this.socketCount--;
    }

    ws.isConnected = false;
    ws.sendPacket = function (data) { };
    ws.closeReason = { code: ws._closeCode, message: ws._closeMessage };
    ws.closeTime = +new Date;
    ws.playerTracker.setSkin("");
    var name = ws.playerTracker.getName();
    if(name == "") name = "Client";
    Logger.warn("\u001B[31m" + name + " disconected " + ws.remoteAddress + ":" + ws.remotePort);
};

GameServer.prototype.onClientSocketError = function (ws, error) {
    ws.sendPacket = function (data) { };
};

GameServer.prototype.onClientSocketMessage = function (ws, message) {
    ws.packetHandler.handleMessage(message);
};

WebSocket.prototype.sendPacket = function (packet) {
    if (packet == null) return;
    if (this.readyState == WebSocket.OPEN) {
        if (!this._socket.writable) {
            return;
        }
        var buffer = packet.build(this.playerTracker.socket.packetHandler.protocol);
        if (buffer != null) {
            this.send(buffer, { binary: true });
        }
    } else {
        this.readyState = WebSocket.CLOSED;
        this.emit('close');
    }
};

// ****************************************** GET/SET ****************************************** //

GameServer.prototype.setBorder = function (width, height) {
    var hw = width / 2;
    var hh = height / 2;
    this.border = {
        minx: -hw,
        miny: -hh,
        maxx: hw,
        maxy: hh,
        width: width,
        height: height,
        centerx: 0,
        centery: 0
    };
};

GameServer.prototype.getTick = function () {
    return this.tickCounter;
};

GameServer.prototype.getMode = function () {
    return this.gameMode;
};

GameServer.prototype.getNextNodeId = function () {
    // Resets integer
    if (this.lastNodeId > 2147483647) {
        this.lastNodeId = 1;
    }
    return this.lastNodeId++ >>> 0;
};

GameServer.prototype.getNewPlayerID = function () {
    // Resets integer
    if (this.lastPlayerId > 2147483647) {
        this.lastPlayerId = 1;
    }
    return this.lastPlayerId++ >>> 0;
};

GameServer.prototype.getRandomPosition = function () {
    return {
        x: Math.floor(this.border.minx + this.border.width * Math.random()),
        y: Math.floor(this.border.miny + this.border.height * Math.random())
    };
};

GameServer.prototype.getRandomColor = function () {
    var colorRGB = [0xFF, 0x07, ((Math.random() * (256 - 7)) >> 0) + 7];
    colorRGB.sort(function () {
        return 0.5 - Math.random()
    });

    return {
        r: colorRGB[0],
        b: colorRGB[1],
        g: colorRGB[2]
    };
};

GameServer.prototype.getPlayers = function () {
    this.pcells = 0;
    var humans = 0,
        bots = 0,
        players = this.clients.length,
        spectate = 0;
    for (var i = 0; i < players; i++) {
        var socket = this.clients[i];
        this.pcells += socket.playerTracker.cells.length;
        if (socket.isConnected == null) { bots++; continue; }
        if (socket.playerTracker.cells.length > 0) { humans++; } else if(socket.playerTracker.spectate) spectate++;
    }
    this.sinfo.players = players;
    this.sinfo.humans = humans;
    this.sinfo.spectate = spectate;
    this.sinfo.bots = bots;
    this.sinfo.death = (players - (humans + spectate + bots));
};

GameServer.prototype.getPlayerById = function (id) {
    if (id == null) return null;
    for (var i = 0, len = this.clients.length; i < len; i++) {
        var playerTracker = this.clients[i].playerTracker;
        if (playerTracker.pID == id) {
            return playerTracker;
        }
    }
    return null;
};

GameServer.prototype.getNearestVirus = function (cell) {
    // Loop through all viruses on the map. There is probably a more efficient way of doing this but whatever
    for (var i = 0, len = this.nodesVirus.length; i < len; i++) {
        var check = this.nodesVirus[i];
        if (check === null) continue;
        if (this.checkCellCollision(cell, check) != null) {
            return check;
        }
    }
};

GameServer.prototype.getDist = function (pos, check) {
    var deltaX = Math.abs(pos.x - check.x),
        deltaY = Math.abs(pos.y - check.y);
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
};

GameServer.prototype.getSplitMass = function (mass, count) {
    // min throw size (vanilla 44)
    var throwSize = this.config.playerMinSize + 12;
    var throwMass = throwSize * throwSize / 100;

    // check maxCount
    var maxCount = count;
    var curMass = mass;
    while (maxCount > 1 && curMass / (maxCount - 1) < throwMass) {
        maxCount = maxCount / 2 >>> 0;
    }
    if (maxCount < 2) {
        return [mass];
    }

    // calculate mass
    var minMass = this.config.playerMinSize * this.config.playerMinSize / 100;
    var splitMass = curMass / maxCount;
    if (splitMass < minMass) {
        return [mass];
    }
    var masses = [];
    if (maxCount < 3 || maxCount < count || curMass / throwMass <= 30) {
        // Monotone blow up
        for (var i = 0; i < maxCount; i++) {
            masses.push(splitMass);
        }
    } else {
        // Diverse blow up
        // Barbosik: draft version
        var restCount = maxCount;
        while (restCount > 2) {
            var splitMass = curMass / 2;
            if (splitMass <= throwMass) {
                break;
            }
            var max = curMass - throwMass * (restCount - 1);
            if (max <= throwMass || splitMass >= max) {
                break;
            }
            masses.push(splitMass);
            curMass -= splitMass;
            restCount--;
        }
        var splitMass = curMass / 4;
        if (splitMass > throwMass) {
            while (restCount > 2) {
                var max = curMass - throwMass * (restCount - 1);
                if (max <= throwMass || splitMass >= max) {
                    break;
                }
                masses.push(splitMass);
                curMass -= splitMass;
                restCount--;
            }
        }
        var splitMass = curMass / 8;
        if (splitMass > throwMass) {
            while (restCount > 2) {
                var max = curMass - throwMass * (restCount - 1);
                if (max <= throwMass || splitMass >= max) {
                    break;
                }
                masses.push(splitMass);
                curMass -= splitMass;
                restCount--;
            }
        }
        if (restCount > 1) {
            splitMass = curMass - throwMass * (restCount - 1);
            if (splitMass > throwMass) {
                masses.push(splitMass);
                curMass -= splitMass;
                restCount--;
            }
        }
        if (restCount > 0) {
            splitMass = curMass / restCount;
            if (splitMass < throwMass - 0.001) {
                Logger.warn("GameServer.splitMass: throwMass-splitMass = " + (throwMass - splitMass).toFixed(3) + " (" + mass.toFixed(4) + ", " + count + ")");
            }
            while (restCount > 0) {
                masses.push(splitMass);
                restCount--;
            }
        }
    }
    return masses;
};

// ****************************************** SPAWN ****************************************** //

GameServer.prototype.spawnCells = function() {
    var maxCount = this.config.foodMinAmount - this.currentFood;
    var spawnCount = Math.min(maxCount, this.config.foodSpawnAmount);

    for (var i = 0; i < spawnCount; i++) {
        var cell = new Entity.Food(this, null, this.getRandomPosition(), this.config.foodMinSize);
        if (this.config.foodMassGrow) {
            var size = cell._size;
            var maxGrow = this.config.foodMaxSize - size;
            size += maxGrow * Math.random();
            cell.setSize(size);
        }
        cell.setColor(this.getRandomColor());
        this.addNode(cell);
    }

    maxCount = this.config.virusMinAmount - this.nodesVirus.length;
    spawnCount = Math.min(maxCount, 2);
    for (var i = 0; i < spawnCount; i++) {
        var pos = this.getRandomPosition();
        if (this.willCollide(pos, this.config.virusMinSize)) {
            continue;
        }

        if(1 * Math.random() < 0.75) {
            var v = new Entity.Virus(this, null, pos, this.config.virusMinSize);
            this.addNode(v);
        } else if(this.config.virusMoving) {
            // Moving Virus Test
            var v = new Entity.MovingVirus(this, null, pos, this.config.virusMinSize);
            this.movingNodes.push(v);
            this.addNode(v);
        }
    }
};

GameServer.prototype.spawnSpiral = function(position, mycolor) {
    var r = 140,
        rnd = Math.random() * 3.14,
        pos,
        ejected,
        angle = rnd;

    for (var k = 0, dist = 0; 16 > k; k++) {
        angle += 0.375;
        dist += 9;
        pos = {x: Math.ceil(position.x + (r * Math.sin(angle))), y: Math.ceil(position.y + (r * Math.cos(angle)))};
        ejected = new Entity.EjectedMass(this, null, pos, Math.round(dist / 5) + 1);
        ejected.angle = angle;
        ejected.setColor({r: Math.floor(mycolor.r / 25), g: Math.floor(mycolor.g / 25), b: Math.floor(mycolor.b / 25)});
        ejected.setBoost(dist, angle);
        this.addNode(ejected);
    }

    angle = rnd + 3.14;
    for (var k = 0, dist = 0; 16 > k; k++) {
        angle += 0.375;
        dist += 9;
        pos = {x: Math.ceil(position.x + (r * Math.sin(angle))), y: Math.ceil(position.y + (r * Math.cos(angle)))};
        ejected = new Entity.EjectedMass(this, null, pos, Math.round(dist / 5) + 1);
        ejected.angle = angle;
        ejected.setColor(mycolor);
        ejected.setBoost(dist, angle);
        this.addNode(ejected);
    }
};

GameServer.prototype.spawnPlayer = function (player, pos, size) {
    // Check if can spawn from ejected mass
    if (!pos && this.config.ejectSpawnPlayer && this.nodesEjected.length > 0) {
        if (Math.random() >= 0.5) {
            // Spawn from ejected mass
            var index = (this.nodesEjected.length - 1) * Math.random() >>> 0;
            var eject = this.nodesEjected[index];
            if (!eject.isRemoved) {
                this.removeNode(eject);
                pos = {
                    x: eject.position.x,
                    y: eject.position.y
                };
                if (!size) {
                    size = Math.max(eject._size, this.config.playerStartSize);
                }
            }
        }
    }
    if (pos == null) {
        // Get random pos
        var pos = this.getRandomPosition();
        // 10 attempts to find safe position
        for (var i = 0; i < 10 && this.willCollide(pos, this.config.playerMinSize); i++) {
            pos = this.getRandomPosition();
        }
    }
    if (size == null) {
        // Get starting mass
        size = this.config.playerStartSize;
    }

    // Spawn player and add to world
    var cell = new Entity.PlayerCell(this, player, pos, size);
    this.addNode(cell);

    // Set initial mouse coords
    player.mouse = {
        x: pos.x,
        y: pos.y
    };

    var info = "" // (Protocol:" + player.packetHandler.protocol + ")";
    if (player._skin) {
        info += " (Skin:" + player._skin.slice(1) + ")";
    }

    if(player.origen) this.sendChatMessage(null, null, player._name + ' from ' + player.origen + ' joined the game!');
};

GameServer.prototype.splitPlayerCell = function (client, parent, angle, mass) {
    // TODO: replace mass with size (Virus)
    // Returns boolean whether a cell has been split or not. You can use this in the future.

    if (client.cells.length >= this.config.playerMaxCells) {
        // Player cell limit
        return false;
    }

    var size1 = 0;
    var size2 = 0;
    if (mass == null) {
        size1 = parent.getSplitSize();
        size2 = size1;
    } else {
        size2 = Math.sqrt(mass * 100);
        size1 = Math.sqrt(parent._size * parent._size - size2 * size2);
    }
    if (isNaN(size1) || size1 < this.config.playerMinSize) {
        return false;
    }

    // Remove mass from parent cell first
    parent.setSize(size1);

    // make a small shift to the cell position to prevent extrusion in wrong direction
    var pos = {
        x: ~~(parent.position.x + 40 * Math.sin(angle)),
        y: ~~(parent.position.y + 40 * Math.cos(angle))
    };

    // Create cell
    var newCell = new Entity.PlayerCell(this, client, pos, size2);
    newCell.setBoost(780, angle);

    // Add to node list
    this.addNode(newCell);
    return true;
};

GameServer.prototype.willCollide = function (pos, size) {
    var bound = {
        minx: pos.x - size,
        miny: pos.y - size,
        maxx: pos.x + size,
        maxy: pos.y + size
    };

    return this.quadTree.any(bound, function (item) { return item.cell.cellType == 0; });
};

// ****************************************** ENGINE ****************************************** //

GameServer.prototype.timerLoop = function() {
    var timeStep = 40;
    var ts = Date.now();
    var dt = ts - this.timeStamp;
    if (dt < timeStep - 5) {
        setTimeout(this.timerLoopBind, ((timeStep - 5) - dt) >> 0);
        return;
    }
    if (dt > 120) this.timeStamp = ts - timeStep;
    // update average
    this.updateTimeAvg += 0.5 * (this.updateTime - this.updateTimeAvg);
    // calculate next
    if (this.timeStamp == 0)
        this.timeStamp = ts;
    this.timeStamp += timeStep;
    setTimeout(this.mainLoopBind, 0);
    setTimeout(this.timerLoopBind, 0);
};

GameServer.prototype.mainLoop = function () {
    var tStart = process.hrtime();

    // Loop main functions
    if (this.run) {
        this.updateMoveEngine();
        if ((this.getTick() % this.config.spawnInterval) == 0) {
            this.spawnCells();
        }
        this.gameMode.onTick(this);
        if (((this.getTick() + 3) % 25) == 0) {
            // once per second
            this.getPlayers();
            this.updateMassDecay();

            if(this.config.serverLiveStats)
                this.livestats();
        }
    }

    this.updateClients();
    if (((this.getTick() + 7) % 25) == 0) {
        this.updateLeaderboard();
    }

    if(this.ConnectedAdmins.length) {
        if (((this.getTick() + 3) % 25) == 0) this.AdminSendInfo();
        if (((this.getTick() + 3) % 40) == 0) this.AdminSendPlayers();
    }

    if ((this.getTick() % 750) == 0) {
        // once per 30 seconds
        if(this.config.serverResetTime) {
            // Add hours coutdown till reset to the LB
            var local = new Date();
            var t = (this.startTime.getTime() + (this.config.serverResetTime * 3600000)) - local.getTime();
            var days = Math.floor(t/86400000);
            if(days == 0) {
                var hours = Math.floor((t/3600000) % 24);
                if(hours>0) {
                    local = " in " + hours + "h";
                } else {
                    var minutes = Math.floor( (t/1000/60) % 60 );
                    local = " in " + minutes + "m";
                    if(hours == 0 && minutes == 0) {
                        this.exitserver();
                        local = "ing now!";
                    }
                }
                this.config.LBextraLine = ("\u2002\u2002\u2002\u2002» Restart" + local + " «\u2002\u2002\u2002\u2002\u2002\u2002");
            }
        }
        // ping server tracker
        if(this.config.serverTracker) {
            this.pingServerTracker();
        }
        if(this.config.serverBots > 0)
            if(this.sinfo.humans < this.config.serverBots && this.sinfo.bots < this.config.serverBots)
                this.bots.addBot();

    }

    if (this.run) this.tickCounter++;

    var diff = process.hrtime(tStart);
    this.updateTime = ((diff[0] * 1e9 + diff[1])/1000000+0.1).toFixed(3);
};

GameServer.prototype.updateClients = function () {
    // check minions
    var dateTime = new Date,
        len = this.minionTest.length,
        checker;

    for (var i = 0; i < len; ) {
        if(typeof this.minionTest[i] == 'undefined') {
            i++;
            continue;
        }
        checker = this.minionTest[i];

        if (dateTime - checker.connectedTime > this.config.serverMinionInterval) {
            this.minionTest.splice(i, 1);
        } else {
            i++;
        }
    }

    // check dead clients
    len = this.clients.length;
    for (var i = 0; i < len; ) {
        if(typeof this.clients[i] == 'undefined') {
            i++;
            continue;
        }
        checker = this.clients[i].playerTracker;

        checker.checkConnection();
        if (checker.isRemoved) {
            // remove dead client
            this.clients.splice(i, 1);
        } else {
            i++;
        }
    }
    // update
    for (var i = 0; i < len; i++) {
        if(typeof this.clients[i] == 'undefined')
            continue;
        this.clients[i].playerTracker.updateTick();
    }
    for (var i = 0; i < len; i++) {
        if(typeof this.clients[i] == 'undefined')
            continue;
        this.clients[i].playerTracker.sendUpdate();
    }
};

// ****************************************** QUAD TREE ****************************************** //

GameServer.prototype.updateNodeQuad = function (node) {
    var quadItem = node.quadItem;
    if (quadItem == null) {
        throw new TypeError("GameServer.updateNodeQuad: quadItem is null!");
    }
    // check for change
    if (node.position.x == quadItem.x &&
        node.position.y == quadItem.y &&
        node._size == quadItem.size) {
        // no change
        return;
    }
    // update quadTree
    quadItem.x = node.position.x;
    quadItem.y = node.position.y;
    quadItem.size = node._size;
    quadItem.bound = {
        minx: node.quadItem.x - node.quadItem.size,
        miny: node.quadItem.y - node.quadItem.size,
        maxx: node.quadItem.x + node.quadItem.size,
        maxy: node.quadItem.y + node.quadItem.size
    };
    this.quadTree.update(quadItem);
};

GameServer.prototype.addNode = function (node) {
    node.quadItem = {
        cell: node,
        x: node.position.x,
        y: node.position.y,
        size: node._size
    };
    node.quadItem.bound = {
        minx: node.quadItem.x - node.quadItem.size,
        miny: node.quadItem.y - node.quadItem.size,
        maxx: node.quadItem.x + node.quadItem.size,
        maxy: node.quadItem.y + node.quadItem.size
    };
    this.quadTree.insert(node.quadItem);

    this.nodes.push(node);

    // Adds to the owning player's screen
    if (node.owner) {
        node.setColor(node.owner.getColor());
        node.owner.cells.push(node);
        node.owner.socket.sendPacket(new Packet.AddNode(node.owner, node));
    }

    // Special on-add actions
    node.onAdd(this);
};

GameServer.prototype.removeNode = function (node) {
    if (node.quadItem == null) {
        throw new TypeError("GameServer.removeNode: attempt to remove invalid node!");
    }
    node.isRemoved = true;
    this.quadTree.remove(node.quadItem);
    node.quadItem = null;

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
};

// ****************************************** PHYSICS ****************************************** //

GameServer.prototype.updateMoveEngine = function () {
    var tick = this.getTick();

    // Move player cells
    for (var i in this.clients) {
        var client = this.clients[i].playerTracker;
        var checkSize = !client.mergeOverride || client.cells.length == 1;
        for (var j = 0, len = client.cells.length; j < len; j++) {
            if(client.cells[j]) {
                var cell1 = client.cells[j];
                if (!cell1.isRemoved) {
                    this.moveUser(cell1);
                    this.moveCell(cell1);
                    this.autoSplit(cell1, client);
                    this.updateNodeQuad(cell1);
                }
            }
        }
    }

    // Move moving cells
    for (var i = 0, len = this.movingNodes.length; i < len; ) {
        if(this.movingNodes[i]) {
            var cell1 = this.movingNodes[i];
            if (!cell1.isRemoved) {
                this.moveCell(cell1);
                this.updateNodeQuad(cell1);
                if (!cell1.isMoving)
                    this.movingNodes.splice(i, 1);
            }
        }
        i++;
    }

    // Scan for player cells collisions
    var self = this;
    var rigidCollisions = [];
    var eatCollisions = [];

    for (var i in this.clients) {
        var client = this.clients[i].playerTracker;
        for (var j = 0, len = client.cells.length; j < len; j++) {
            if(client.cells[j]) {
                var cell1 = client.cells[j];

                this.quadTree.find(cell1.quadItem.bound, function (item) {
                    var cell2 = item.cell;
                    if (cell2 == cell1) return;
                    var manifold = self.checkCellCollision(cell1, cell2);
                    if (manifold == null) return;
                    if (self.checkRigidCollision(manifold))
                        rigidCollisions.push({ cell1: cell1, cell2: cell2 });
                    else
                        eatCollisions.push({ cell1: cell1, cell2: cell2 });
                });
            }
        }
    }

    // resolve rigid body collisions
    for (var k = 0; k < rigidCollisions.length; k++) {
        var c = rigidCollisions[k];
        var manifold = this.checkCellCollision(c.cell1, c.cell2);
        if (manifold == null) continue;
        this.resolveRigidCollision(manifold, this.border);

        this.updateNodeQuad(c.cell1);
        this.updateNodeQuad(c.cell2);
    }

    // resolve eat collisions
    for (var k = 0, len = eatCollisions.length; k < len; k++) {
        var c = eatCollisions[k];
        var manifold = this.checkCellCollision(c.cell1, c.cell2);
        if (manifold == null) continue;
        this.resolveCollision(manifold);
    }

    rigidCollisions = [];
    eatCollisions = [];

    // Scan for ejected cell collisions (scan for ejected or virus only)
    var self = this;
    for (var i = 0, len = this.movingNodes.length; i < len; i++) {
        var cell1 = this.movingNodes[i];
        if (!cell1)
            continue;
        if (cell1.isRemoved)
            continue;
        this.quadTree.find(cell1.quadItem.bound, function (item) {
            var cell2 = item.cell;
            if (cell2 == cell1)
                return;
            var manifold = self.checkCellCollision(cell1, cell2);
            if (manifold == null) return;
            if (cell1.cellType == 3 && cell2.cellType == 3) {
                // ejected/ejected
                rigidCollisions.push({ cell1: cell1, cell2: cell2 });
                // add to moving nodes if needed
                if (!cell1.isMoving) {
                    cell1.isMoving = true
                    self.movingNodes.push(cell1);
                }
                if (!cell2.isMoving) {
                    cell2.isMoving = true
                    self.movingNodes.push(cell2);
                }
            }
            else {
                eatCollisions.push({ cell1: cell1, cell2: cell2 });
            }
        });
    }

    // resolve rigid body collisions
    for (var k = 0, len = rigidCollisions.length; k < len; k++) {
        var c = rigidCollisions[k];
        var manifold = this.checkCellCollision(c.cell1, c.cell2);
        if (manifold == null) continue;
        this.resolveRigidCollision(manifold, this.border);

        // position changed! don't forgot to update quad-tree
        this.updateNodeQuad(c.cell1);
        this.updateNodeQuad(c.cell2);
    }

    // resolve eat collisions
    for (var k = 0, len = eatCollisions.length; k < len; k++) {
        var c = eatCollisions[k];
        var manifold = this.checkCellCollision(c.cell1, c.cell2);
        if (manifold == null) continue;
        this.resolveCollision(manifold);
    }

    rigidCollisions = [];
    eatCollisions = [];
};

GameServer.prototype.moveUser = function (check) {
    if (check == null || check.owner == null || check.owner.socket.isConnected === false) return;

    var dx = check.owner.mouse.x - check.position.x;
    var dy = check.owner.mouse.y - check.position.y;
    var squared = dx * dx + dy * dy;
    if (squared < 1 || isNaN(dx) || isNaN(dy)) {
        return;
    }

    if (age < 15) check._canRemerge = false;

    // distance
    var d = Math.sqrt(squared);
    var speed = Math.min(d, check.getSpeed());
    if (speed <= 0) return;

    // Speed up a little if we can merge
    if (check._canRemerge) speed *= 1.25;

    // move player cells
    check.position.x += dx / d * speed;
    check.position.y += dy / d * speed;

    // update remerge
    var age = check.getAge(this.tickCounter);
    var baseTtr = this.config.playerRecombineTime;
    var ttr = Math.max(baseTtr, (check._size * 0.2) >> 0);
    if (baseTtr == 0) {
        // instant merge
        check._canRemerge = check.boostDistance < 100;
        return;
    }

    ttr *= 25;
    check._canRemerge = age >= ttr;

    check.checkBorder(this.border);
};

GameServer.prototype.moveCell = function (check) {
    if (check.isMoving && check.boostDistance <= 0) {
        check.boostDistance = 0;
        check.isMoving = false;
        return;
    }
    var speed = Math.sqrt(check.boostDistance * check.boostDistance / 100);
    var speed = Math.min(speed, check.boostMaxSpeed);
    speed = Math.min(speed, check.boostDistance);

    if(check.boostDistance != Infinity) check.boostDistance -= speed;
    if (check.boostDistance < 1) check.boostDistance = 0;

    var v = check.clipVelocity({ x: check.boostDirection.x * speed, y: check.boostDirection.y * speed }, this.border);
    check.position.x += v.x;
    check.position.y += v.y;
    check.checkBorder(this.border);
};

GameServer.prototype.autoSplit = function(check, client) {
    if (check._size < this.config.playerMaxSize) return;

    // check size limit
    var checkSize = !client.mergeOverride || client.cells.length == 1;
    if (checkSize && check._size > this.config.playerMaxSize && check.getAge(this.tickCounter) >= 15) {
        if (client.cells.length >= this.config.playerMaxCells) {
            // cannot split => just limit
            check.setSize(this.config.playerMaxSize);
        } else {
            // split
            var maxSplit = this.config.playerMaxCells - client.cells.length,
            count = (check._sizeSquared / (this.config.playerMaxSize * this.config.playerMaxSize)) >> 0,
            count1 = Math.min(count, maxSplit),
            splitSize = check._size / Math.sqrt(count1 + 1),
            splitMass = splitSize * splitSize / 100,
            angle = Math.random() * 2 * Math.PI,
            step = 2 * Math.PI / count1;
            for (var k = 0; k < count1; k++) {
                this.splitPlayerCell(client, check, angle, splitMass);
                angle += step;
            }
        }
    }
};

GameServer.prototype.splitCells = function (client) {
    // it seems that vanilla uses order by cell age
    var len = client.cells.length;
    if (len < this.config.playerMaxCells) {
        for (var i = 0; i < len; i++) {
            if (client.cells.length >= this.config.playerMaxCells) break;

            var cell = client.cells[i];
            if (!cell) continue;

            if (cell._size < this.config.playerMinSplitSize) continue;

            var dx = ~~(client.mouse.x - cell.position.x);
            var dy = ~~(client.mouse.y - cell.position.y);
            var dl = dx * dx + dy * dy;
            if (dl < 1) {
                dx = 1;
                dy = 0;
            }
            var angle = Math.atan2(dx, dy);
            if (isNaN(angle)) angle = Math.PI / 2;

            if (!this.splitPlayerCell(client, cell, angle, null)) break;
        }
    }
};

GameServer.prototype.checkCellCollision = function (cell, check) {
    var r = cell._size + check._size;
    var dx = check.position.x - cell.position.x;
    var dy = check.position.y - cell.position.y;
    var squared = dx * dx + dy * dy;
    if (squared > r * r) return null;

    return {
        cell1: cell,
        cell2: check,
        r: r,
        dx: dx,
        dy: dy,
        squared: squared
    };
};

GameServer.prototype.resolveRigidCollision = function (manifold, border) {
    // distance from cell1 to cell2
    var d = Math.sqrt(manifold.squared);
    if (d <= 0) return;
    var invd = 1 / d;

    // normal
    var nx = ~~manifold.dx * invd;
    var ny = ~~manifold.dy * invd;

    // body penetration distance
    var penetration = manifold.r - d;
    if (penetration <= 0) return;

    // penetration vector = penetration * normal
    var px = penetration * nx;
    var py = penetration * ny;

    // body impulse
    var totalMass = manifold.cell1.getSizeSquared() + manifold.cell2.getSizeSquared();
    if (totalMass <= 0) return;
    var invTotalMass = 1 / totalMass;
    var impulse1 = manifold.cell2.getSizeSquared() * invTotalMass;
    var impulse2 = manifold.cell1.getSizeSquared() * invTotalMass;

    // apply extrusion force
    manifold.cell1.position.x -= ~~(px * impulse1);
    manifold.cell1.position.y -= ~~(py * impulse1);
    manifold.cell2.position.x += ~~(px * impulse2);
    manifold.cell2.position.y += ~~(py * impulse2);

    // clip to border bounds
    manifold.cell1.checkBorder(border);
    manifold.cell2.checkBorder(border);
};

GameServer.prototype.checkRigidCollision = function (manifold) {
    if (!manifold.cell1.owner || !manifold.cell2.owner)
        return false;
    if (manifold.cell1.owner != manifold.cell2.owner) {
        // Different owners
        return this.gameMode.haveTeams && 
            manifold.cell1.owner.getTeam() == manifold.cell2.owner.getTeam();
    }
    // The same owner
    if (manifold.cell1.owner.mergeOverride)
        return false;
    var tick = this.getTick();
    if (manifold.cell1.getAge(tick) < 15 || manifold.cell2.getAge(tick) < 15) {
        // just splited => ignore
        return false;
    }
    return !manifold.cell1.canRemerge() || !manifold.cell2.canRemerge();
};

// Resolves non-rigid body collision
GameServer.prototype.resolveCollision = function (manifold) {
    var minCell = manifold.cell1;
    var maxCell = manifold.cell2;
    // check if any cell already eaten
    if (minCell.isRemoved || maxCell.isRemoved)
        return;
    if (minCell._size > maxCell._size) {
        minCell = manifold.cell2;
        maxCell = manifold.cell1;
    }

    // check distance
    var eatDistance = maxCell._size - minCell._size / 3;
    if (manifold.squared >= eatDistance * eatDistance) {
        // too far => can't eat
        return;
    }

    if (minCell.owner && minCell.owner == maxCell.owner) {
        // collision owned/owned => ignore or resolve or remerge
        var tick = this.getTick();
        if (minCell.getAge(tick) < 15 || maxCell.getAge(tick) < 15) {
            // just splited => ignore
            return;
        }
        if (!minCell.owner.mergeOverride) {
            // not force remerge => check if can remerge
            if (!minCell.canRemerge() || !maxCell.canRemerge()) {
                // cannot remerge
                return;
            }
        }
    } else {
        // collision owned/enemy => check if can eat

        // Team check
        if (this.gameMode.haveTeams && minCell.owner && maxCell.owner) {
            if (minCell.owner.getTeam() == maxCell.owner.getTeam()) {
                // cannot eat team member
                return;
            }
        }
        // Size check
        if (maxCell._size <= minCell._size * 1.15) {
            // too large => can't eat
            return;
        }
    }
    if (!maxCell.canEat(minCell)) {
        // maxCell don't want to eat
        return;
    }
    if (minCell.cellType == 5) {
        return;
    }
    // Now maxCell can eat minCell
    minCell.isRemoved = true;

    // Disable mergeOverride on the last merging cell
    // We need to disable it before onCosume to prevent merging loop
    // (onConsume may cause split for big mass)
    if (minCell.owner && minCell.owner.cells.length <= 2) {
        minCell.owner.mergeOverride = false;
    }

    var isMinion = (maxCell.owner && maxCell.owner.isMinion) ||
        (minCell.owner && minCell.owner.isMinion);
    if (!isMinion) {
        // Consume effect
        maxCell.onEat(minCell);
        minCell.onEaten(maxCell);

        // update bounds
        this.updateNodeQuad(maxCell);
    }

    // Remove cell
    minCell.setKiller(maxCell);
    this.removeNode(minCell);
};

// ****************************************** EJECTING ****************************************** //

GameServer.prototype.canEjectMass = function (client) {
    var tick = this.getTick();
    if (client.lastEject == null) {
        // first eject
        client.lastEject = tick;
        return true;
    }
    var dt = tick - client.lastEject;
    if (dt < this.config.ejectCooldown) {
        // reject (cooldown)
        return false;
    }
    client.lastEject = tick;
    return true;
};

GameServer.prototype.ejectBoom = function (pos, color) {
    var ejected = new Entity.EjectedMass(this, null, {x: pos.x, y: pos.y}, this.config.ejectSize);
    ejected.setColor(color);
    ejected.setBoost(this.config.ejectSize + this.config.ejectDistance * Math.random(), 6.28 * Math.random());
    this.addNode(ejected);
};

GameServer.prototype.ejectMass = function (client) {
    if (!this.canEjectMass(client))
        return;

    for (var i = 0, len = client.cells.length; i < len; i++) {
        var cell = client.cells[i];

        if (!cell) {
            continue;
        }

        if (cell._size < this.config.playerMinSplitSize) {
            continue;
        }
        var size2 = this.config.ejectSize;
        var sizeLoss = this.config.ejectSizeLoss;
        if(this.config.ejectVirus) sizeLoss = this.config.virusMinSize
        var sizeSquared = cell.getSizeSquared() - sizeLoss * sizeLoss;
        if (sizeSquared < this.config.playerMinSize * this.config.playerMinSize) {
            continue;
        }
        var size1 = Math.sqrt(sizeSquared);

        var dx = client.mouse.x - cell.position.x;
        var dy = client.mouse.y - cell.position.y;
        var dl = dx * dx + dy * dy;
        if (dl < 1) {
            dx = 1;
            dy = 0;
        } else {
            dl = Math.sqrt(dl);
            dx /= dl;
            dy /= dl;
        }

        // Remove mass from parent cell first
        cell.setSize(size1);

        // Get starting position
        var pos = {
            x: cell.position.x + dx * cell._size,
            y: cell.position.y + dy * cell._size
        };

        var angle = Math.atan2(dx, dy);
        if (isNaN(angle)) angle = Math.PI / 2;

        // Randomize angle
        angle += (Math.random() * 0.6) - 0.3;

        // Create cell
        if(!this.config.ejectVirus) {
            var ejected = new Entity.EjectedMass(this, null, pos, size2);
            ejected.ejector = cell;
            ejected.setColor(cell.getColor());
            ejected.setBoost(this.config.ejectDistance, angle);

            this.addNode(ejected);
        } else {
            this.shootVirus(pos, angle);
            // Lets shoot only ONE virus :3
            return;
        }
    }
};

GameServer.prototype.shootVirus = function (pos, angle) {
    var newVirus = new Entity.Virus(this, null, pos, this.config.virusMinSize);
    newVirus.setBoost(780, angle);

    // Add to moving cells list
    this.addNode(newVirus);
};

// ****************************************** GAME OPTS ****************************************** //

GameServer.prototype.updateMassDecay = function () {
    if (!this.config.playerDecayRate) {
        return;
    }
    var decay = 1 - this.config.playerDecayRate * this.gameMode.decayMod;
    // Loop through all player cells
    for (var i = 0, len = this.clients.length; i < len; i++) {
        var playerTracker = this.clients[i].playerTracker;
        for (var j = 0; j < playerTracker.cells.length; j++) {
            var cell = playerTracker.cells[j];
            var size = cell._size;
            if (size <= this.config.playerMinSize)
                continue;
            var size = Math.sqrt(size * size * decay);
            size = Math.max(size, this.config.playerMinSize);
            if (size != cell._size) {
                cell.setSize(size);
            }
        }
    }
};

GameServer.prototype.updateLeaderboard = function () {
    // Update leaderboard with the gamemode's method
    this.leaderboard = [];
    this.leaderboardType = -1;
    this.gameMode.updateLB(this);

    if (!this.gameMode.specByLeaderboard) {
        // Get client with largest score if gamemode doesn't have a leaderboard
        var clients = this.clients.valueOf();

        // Use sort function
        clients.sort(function (a, b) {
            return b.playerTracker.getScore() - a.playerTracker.getScore();
        });
        //this.largestClient = clients[0].playerTracker;
        this.largestClient = null;
        if (clients[0] != null)
            this.largestClient = clients[0].playerTracker;
    } else {
        this.largestClient = this.gameMode.rankOne;
    }
};

GameServer.prototype.checkSkinName = function (skinName) {
    if (!skinName) {
        return true;
    }
    if (skinName.length == 1 || skinName.length > 25) {
        return false;
    }
    if (skinName[0] != '%' /* && skinName[0] != ':' */) {
        return false;
    }
    for (var i = 1, len = skinName.length; i < len; i++) {
        var c = skinName.charCodeAt(i);
        if (c < 0x21 || c > 0x7F || c == '/' || c == '\\' || c == ':' || c == '%' || c == '?' || c == '&' || c == '<' || c == '>') {
            return false;
        }
    }
    return true;
};

// ****************************************** CHAT ****************************************** //

GameServer.prototype.onChatMessage = function (from, to, message) {
    if (message == null) return;
    message = message.trim();
    if (message == "") return;
    if (from && message.length > 0 && message[0] == '/') {
        // player command
        message = message.slice(1, message.length);
        from.socket.playerCommand.executeCommandLine(message);
        return;
    }
    if (!this.config.serverChat) {
        // chat is disabled
        return;
    }
    if (from && from.isMuted) {
        // player is muted
        return;
    }
    if (message.length > 64) {
        message = message.slice(0, 64);
    }
    // Spam chat delay
    var timenow = new Date().getTime();
    if (from.cTime + 1500 > timenow) {
        this.sendChatMessage(null, from, "Please do not spam chat!");
        return;
    }
    from.cTime = timenow;

    // Location to chat
    if(message.toLowerCase() == "pos") message = this.MyPos(from.centerPos);

    // Repeating chat block
    if (message == from.cLast) {
        this.sendChatMessage(null, from, "Please do not spam chat!");
        return;
    }
    from.cLast = message;
    if (this.config.serverChatAscii) {
        for (var i = 0; i < message.length; i++) {
            var c = message.charCodeAt(i);
            if (c < 0x20 || c > 0x7F) {
                if (from) {
                    this.sendChatMessage(null, from, "You can use ASCII text only!");
                }
                return;
            }
        }
    }
    if (this.checkBadWord(message)) {
        if (from) {
            this.sendChatMessage(null, from, "Stop insulting others! Keep calm and be friendly please");
        }
        return;
    }
    Logger.info("\u001B[36m" + from.getFriendlyName() + "\u001B[37m: " + message);
    this.sendChatMessage(from, to, message);
};

GameServer.prototype.MyPos = function(clientpos) {
    var adjustx = this.config.borderWidth;
    var adjusty = this.config.borderHeight;
    var msizex = adjustx / 5;
    var msizey = adjusty / 5;
    adjustx = (adjustx / 2) + clientpos.x;
    adjusty = (adjusty / 2) + clientpos.y;

    var pX = "1";
    var shortX = "left";
    if( adjustx > msizex      ) { pX = "2"; shortX = "left";  }
    if( adjustx > (msizex * 2)) { pX = "3"; shortX = "middle";}
    if( adjustx > (msizex * 3)) { pX = "4"; shortX = "right"; }
    if( adjustx > (msizex * 4)) { pX = "5"; shortX = "right"; }

    var pY = "A";
    var shortY = "top";
    if( adjusty > msizey      ) { pY = "B"; shortY = "top"; }
    if( adjusty > (msizey * 2)) { pY = "C"; shortY = "middle"; }
    if( adjusty > (msizey * 3)) { pY = "D"; shortY = "bottom"; }
    if( adjusty > (msizey * 4)) { pY = "E"; shortY = "bottom"; }

    var short = "";
    if(shortY == "middle" && shortX == "middle") {
        short = "center";
    } else {
        short = shortY + " " + shortX;
    }

    return "I am at the " + short + " of the map! (X: " + Math.round(adjustx) + ", Y: " + Math.round(adjusty) + " @ " + pY + pX + ")";
};

GameServer.prototype.checkBadWord = function (value) {
    if (!value) return false;
    value = value.toLowerCase().trim();
    if (!value) return false;
    for (var i = 0; i < this.badWords.length; i++) {
        if (value.indexOf(this.badWords[i]) >= 0) {
            return true;
        }
    }
    return false;
};

GameServer.prototype.sendChatMessage = function (from, to, message) {
    var msg = null;
    for (var i = 0, len = this.clients.length; i < len; i++) {
        var client = this.clients[i];
        if (client == null) continue;
        if (to == null || to == client.playerTracker) {
            if(msg == null) msg = new Packet.ChatMessage(from, message);
            client.sendPacket(msg);
        }
    }
    if(to == null && from == null) {
        Logger.info("\u001B[36mServer\u001B[37m: " + message);
        this.AdminSendChat('\uD83D\uDCE2', {r:255,g:0,b:0}, message);
    }

    if(from)
        this.AdminSendChat(from._name, from.color, message);
};

// ***************************************** LOAD/SAFE ***************************************** //

var fileNameConfig = './gameserver.ini';
var fileNameBadWords = './badwords.txt';
var fileNameIpBan = './ipbanlist.txt';
var fileNameUsers = './userRoles.json';

GameServer.prototype.loadConfig = function () {
    try {
        if (!fs.existsSync(fileNameConfig)) {
            // No config
            Logger.warn("Config not found... Generating new config");
            // Create a new config
            fs.writeFileSync(fileNameConfig, ini.stringify(this.config), 'utf-8');
        } else {
            // Load the contents of the config file
            var load = ini.parse(fs.readFileSync(fileNameConfig, 'utf-8'));
            // Replace all the default config's values with the loaded config's values
            for (var key in load) {
                if (this.config.hasOwnProperty(key)) {
                    this.config[key] = load[key];
                } else {
                    Logger.error("Unknown gameserver.ini value: " + key);
                }
            }
        }
    } catch (err) {
        Logger.error(err.stack);
        Logger.error("Failed to load " + fileNameConfig + ": " + err.message);
    }
    // check config (min player size = 32 => mass = 10.24)
    this.config.playerMinSize = Math.max(32, this.config.playerMinSize);
    Logger.setVerbosity(this.config.logVerbosity);
    Logger.setFileVerbosity(this.config.logFileVerbosity);
};

GameServer.prototype.loadBadWords = function () {
    try {
        if (!fs.existsSync(fileNameBadWords)) {
            Logger.warn(fileNameBadWords + " not found");
        } else {
            var words = fs.readFileSync(fileNameBadWords, 'utf-8');
            words = words.split(/[\r\n]+/);
            words = words.map(function (arg) { return arg.trim().toLowerCase(); });
            words = words.filter(function (arg) { return !!arg; });
            this.badWords = words;
            Logger.info(this.badWords.length + " bad words loaded");
        }
    } catch (err) {
        Logger.error(err.stack);
        Logger.error("Failed to load " + fileNameBadWords + ": " + err.message);
    }
};

GameServer.prototype.changeConfig = function (name, value) {
    if (value == null || isNaN(value)) {
        Logger.warn("Invalid value: " + value);
        return;
    }
    if (!this.config.hasOwnProperty(name)) {
        Logger.warn("Unknown config value: " + name);
        return;
    }
    this.config[name] = value;

    // update/validate
    this.config.playerMinSize = Math.max(32, this.config.playerMinSize);
    Logger.setVerbosity(this.config.logVerbosity);
    Logger.setFileVerbosity(this.config.logFileVerbosity);

    Logger.print("Set " + name + " = " + this.config[name]);
};

GameServer.prototype.loadUserList = function () {
    try {
        this.userList = [];
        if (!fs.existsSync(fileNameUsers)) {
            Logger.warn(fileNameUsers + " is missing.");
            return;
        }
        var usersJson = fs.readFileSync(fileNameUsers, 'utf-8');
        var list = JSON.parse(usersJson.trim());
        for (var i = 0; i < list.length; ) {
            var item = list[i];
            if (!item.hasOwnProperty("ip") ||
                !item.hasOwnProperty("password") ||
                !item.hasOwnProperty("role") ||
                !item.hasOwnProperty("name")) {
                list.splice(i, 1);
                continue;
            }
            if (!item.password || !item.password.trim()) {
                Logger.warn("User account \"" + item.name + "\" disabled");
                list.splice(i, 1);
                continue;
            }
            if (item.ip) {
                item.ip = item.ip.trim();
            }
            item.password = item.password.trim();
            if (!UserRoleEnum.hasOwnProperty(item.role)) {
                Logger.warn("Unknown user role: " + role);
                item.role = UserRoleEnum.USER;
            } else {
                item.role = UserRoleEnum[item.role];
            }
            item.name = (item.name || "").trim();
            i++;
        }
        this.userList = list;
        Logger.info(this.userList.length + " user records loaded.");
    } catch (err) {
        Logger.error(err.stack);
        Logger.error("Failed to load " + fileNameUsers + ": " + err.message);
    }
}

GameServer.prototype.userLogin = function (ip, password) {
    if (!password) return null;
    password = password.trim();
    if (!password) return null;
    for (var i = 0, len = this.userList.length; i < len; i++) {
        var user = this.userList[i];
        if (user.password != password)
            continue;
        if (user.ip && user.ip != ip)
            continue;
        return user;
    }
    return null;
};

GameServer.prototype.loadIpBanList = function () {
    try {
        if (fs.existsSync(fileNameIpBan)) {
            // Load and input the contents of the ipbanlist file
            this.ipBanList = fs.readFileSync(fileNameIpBan, "utf8").split(/[\r\n]+/).filter(function (x) {
                return x != ''; // filter empty lines
            });
            Logger.info(this.ipBanList.length + " IP ban records loaded.");
        } else {
            Logger.warn(fileNameIpBan + " is missing.");
        }
    } catch (err) {
        Logger.error(err.stack);
        Logger.error("Failed to load " + fileNameIpBan + ": " + err.message);
    }
};

GameServer.prototype.saveIpBanList = function () {
    try {
        var blFile = fs.createWriteStream(fileNameIpBan);
        // Sort the blacklist and write.
        this.ipBanList.sort().forEach(function (v) {
            blFile.write(v + '\n');
        });
        blFile.end();
        Logger.info(this.ipBanList.length + " IP ban records saved.");
    } catch (err) {
        Logger.error(err.stack);
        Logger.error("Failed to save " + fileNameIpBan + ": " + err.message);
    }
};

// ****************************************** COMMANDS ***************************************** //

GameServer.prototype.checkIpBan = function (ipAddress) {
    if (!this.ipBanList || this.ipBanList.length == 0 || ipAddress == "127.0.0.1") {
        return false;
    }
    if (this.ipBanList.indexOf(ipAddress) >= 0) {
        return true;
    }
    var ipBin = ipAddress.split('.');
    if (ipBin.length != 4) {
        // unknown IP format
        return false;
    }
    var subNet2 = ipBin[0] + "." + ipBin[1] + ".*.*";
    if (this.ipBanList.indexOf(subNet2) >= 0) {
        return true;
    }
    var subNet1 = ipBin[0] + "." + ipBin[1] + "." + ipBin[2] + ".*";
    if (this.ipBanList.indexOf(subNet1) >= 0) {
        return true;
    }
    return false;
};

GameServer.prototype.banIp = function (ip) {
    var ipBin = ip.split('.');
    if (ipBin.length != 4) {
        Logger.warn("Invalid IP format: " + ip);
        return;
    }
    if (ipBin[0] == "127") {
        Logger.warn("Cannot ban localhost");
        return;
    }
    if (this.ipBanList.indexOf(ip) >= 0) {
        Logger.warn(ip + " is already in the ban list!");
        return;
    }
    this.ipBanList.push(ip);
    if (ipBin[2] == "*" || ipBin[3] == "*") {
        Logger.print("The IP sub-net " + ip + " has been banned");
    } else {
        Logger.print("The IP " + ip + " has been banned");
    }
    this.clients.forEach(function (socket) {
        // If already disconnected or the ip does not match
        if (socket == null || !socket.isConnected || !this.checkIpBan(socket.remoteAddress))
            return;

        // remove player cells
        socket.playerTracker.cells.forEach(function (cell) {
            this.removeNode(cell);
        }, this);

        // disconnect
        socket.close(1000, "Banned from server");
        var name = socket.playerTracker.getFriendlyName();
        Logger.print("Banned: \"" + name + "\" with Player ID " + socket.playerTracker.pID);
        this.sendChatMessage(null, null, "Banned \"" + name + "\""); // notify to don't confuse with server bug
    }, this);
    this.saveIpBanList();
};

GameServer.prototype.unbanIp = function (ip) {
    var index = this.ipBanList.indexOf(ip);
    if (index < 0) {
        Logger.warn("IP " + ip + " is not in the ban list!");
        return;
    }
    this.ipBanList.splice(index, 1);
    Logger.print("Unbanned IP: " + ip);
    this.saveIpBanList();
};

// Kick player by ID. Use ID = 0 to kick all players
GameServer.prototype.kickId = function (id) {
    var count = 0;
    this.clients.forEach(function (socket) {
        if (socket.isConnected == false)
            return;
        if (id != 0 && socket.playerTracker.pID != id)
            return;
        // remove player cells
        socket.playerTracker.cells.forEach(function (cell) {
            this.removeNode(cell);
        }, this);
        // disconnect
        socket.close(1000, "Kicked from server");
        var name = socket.playerTracker.getFriendlyName();
        Logger.print("Kicked \"" + name + "\"");
        this.sendChatMessage(null, null, "Kicked \"" + name + "\""); // notify to don't confuse with server bug
        count++;
    }, this);
    if (count > 0)
        return;
    if (id == 0)
        Logger.warn("No players to kick!");
    else
        Logger.warn("Player with ID " + id + " not found!");
};

// ***************************************** LIVE STATS **************************************** //

GameServer.prototype.fillChar = function (data, char, fieldLength, rTL) {
    var result = data.toString();
    if (rTL === true) {
        for (var i = result.length; i < fieldLength; i++)
            result = char.concat(result);
    }
    else {
        for (var i = result.length; i < fieldLength; i++)
            result = result.concat(char);
    }
    return result;
};

GameServer.prototype.numberWithCommas = function (x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

GameServer.prototype.seconds2time = function (seconds) {
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds - (hours * 3600)) / 60);
    var seconds = seconds - (hours * 3600) - (minutes * 60);
    var time = "";

    if (hours != 0) time = hours + ":";

    if (minutes != 0 || time !== "") {
        minutes = (minutes < 10 && time !== "") ? "0" + minutes : String(minutes);
        time += minutes + ":";
    }

    if (time === "") time = seconds + " seconds";
    else time += (seconds < 10) ? "0" + seconds : String(seconds);

    return time;
};

GameServer.prototype.livestats = function () {
    var rss = parseInt((process.memoryUsage().rss / 1024 ).toFixed(0));
    var rcolor = "\u001B[32m";
    if(this.updateTime > 20.0) rcolor = "\u001B[33m";
    if(this.updateTime > 40.0) rcolor = "\u001B[31m";

    var line1 = "\u001B[4mPlaying :   " + this.fillChar(this.sinfo.humans, ' ', 5, true) + " │ Dead/Conn : " + this.fillChar(this.sinfo.death, ' ', 5, true) + " │ Spectator:  " + this.fillChar(this.sinfo.spectate, ' ', 5, true) + " │ Bot:        " + this.fillChar(this.sinfo.bots, ' ', 5, true) + " \u001B[24m";
    var line2 = "ejected : " + this.fillChar(this.numberWithCommas(this.nodesEjected.length), ' ', 27, true) + " │ cells  :  " + this.fillChar(this.numberWithCommas(this.pcells), ' ', 27, true) + " ";
    var line3 = "food    : " + this.fillChar(this.numberWithCommas(this.nodes.length), ' ', 27, true) + " │ moving :  " + this.fillChar(this.numberWithCommas(this.movingNodes.length), ' ', 27, true) + " ";
    var line4 = "virus   : " + this.fillChar(this.numberWithCommas(this.nodesVirus.length), ' ', 27, true) + " │ tick   :  " + rcolor + this.fillChar(this.updateTime + "ms",' ', 27, true) + "\u001B[36m ";
    var line5 = "uptime  : " + this.fillChar(this.seconds2time(process.uptime().toFixed(0)), ' ', 27, true) + " │ memory :  " + this.fillChar(this.numberWithCommas(rss) + ' ▲' + this.numberWithCommas(this.mempeek), ' ', 27, true) + " \u001B[24m";
    process.stdout.write("\u001B[s\u001B[H\u001B[6r");
    process.stdout.write("\u001B[8;36;44m   ___                  " + line1 + EOL);
    process.stdout.write("  / _ \\ __ _ __ _ _ _   " + line2 + EOL);
    process.stdout.write(" | (_) / _` / _` | '_|  " + line3 + EOL);
    process.stdout.write("  \\___/\\__, \\__,_|_|    " + line4 + EOL);
    process.stdout.write("\u001B[4m       |   / server     " + line5 + EOL);
    process.stdout.write("\u001B[0m");
    process.stdout.write("\u001B[u"); // Restore Cursor
};

GameServer.prototype.AdminSendInfo = function() {
    var rss = parseInt((process.memoryUsage().rss / 1024 ).toFixed(0));
    if (rss > this.mempeek) {
        this.mempeek = rss;
    }
    var admins = this.ConnectedAdmins.length;
    if(admins) {
        var result = {
            "Package": 1,
            "players": (this.sinfo.players - this.sinfo.bots),
            "admins": admins,
            "humans": this.sinfo.humans,
            "spectate": this.sinfo.spectate,
            "bots": this.sinfo.bots,
            "death": this.sinfo.death,
            "ejected": this.numberWithCommas(this.nodesEjected.length),
            "food": this.numberWithCommas(this.currentFood),
            "virus": this.numberWithCommas(this.nodesVirus.length),
            "uptime": this.seconds2time(process.uptime().toFixed(0)),
            "cells": this.numberWithCommas(this.pcells),
            "moving": this.numberWithCommas(this.movingNodes.length),
            "tick": this.updateTime,
            "memory": this.numberWithCommas(rss) + 'Kb',
            "memorypeek": this.numberWithCommas(this.mempeek) + 'Kb',
            "version": 'OgarServ ' + this.version,
            "gamemode": this.gameMode.name,
            "max_players": this.config.serverMaxConnections
        };
        for(var i = 0; i < admins; i++)
        {
            var who = this.ConnectedAdmins[i];
            if(who.readyState != who.OPEN) continue;
            who.send(JSON.stringify(result));
        }
    }
};

GameServer.prototype.AdminSendPlayers = function() {
    var admins = this.ConnectedAdmins.length;
    if(admins) {
        var aplayers = [];
        var dplayers = [];
        var user = 0;
        var sockets = this.clients.slice(0);
        var result1={"Package":4};
        var result2={"Package":4};
        sockets.sort(function (b, a) { return a.playerTracker._score - b.playerTracker._score; });
        for (var i = 0, len = sockets.length; i < len; i++) {
            if (sockets[i] == null)
                continue;

            var player = sockets[i].playerTracker;
            if (player.isRemoved)
                continue;

            var color = "#" + ((1 << 24) + (player.color.r << 16) + (player.color.g << 8) + player.color.b).toString(16).slice(1);
            var name = player._name;
            var score = this.numberWithCommas((player._score / 100).toFixed(0));

            if(!name && sockets[i].isConnected) { color = '#000000'; name = 'Connecting'; score = 0; }
            if(sockets[i].isConnected != null && !sockets[i].isConnected) { color = '#000000'; name = 'Disconected'; score = 0; }
            if (player.cells.length <= 0) { score = 0; color = '#000000'; }

            result1[user]=[player.pID, name, score, color, sockets[i].remoteAddress];
            result2[user]=[player.pID, name, score, color];
            user++;
            result1["Users"]=user;
            result2["Users"]=user;
        }
        for(var i = 0; i < admins; i++)
        {
            var who = this.ConnectedAdmins[i];
            if(who.readyState != who.OPEN) continue;
            if(who.admin)
                who.send(JSON.stringify(result1));
            else
                who.send(JSON.stringify(result2));
        }
    }
};

GameServer.prototype.AdminSendChat = function(from, color, msg) {
    var admins = this.ConnectedAdmins.length;
    if(admins) {
        var apcolor = "#" + ((1 << 24) + (color.r << 16) + (color.g << 8) + color.b).toString(16).slice(1);
        var temp = {"Package": 3, "from": from, "color": apcolor, "msg": msg};
        for(var i = 0; i < admins; i++)
        {
            var who = this.ConnectedAdmins[i];
            if(who.readyState != who.OPEN) continue;
            who.send(JSON.stringify(temp));
        }
    }
};

// ***************************************** STATS SERV **************************************** //

GameServer.prototype.startStatsServer = function (port) {
    // Do not start the server if the port is negative
    if (port < 1) {
        return;
    }
    var http = require('http');

    // Create stats
    this.stats = "Test";
    this.getStats();

    // Show stats
    this.httpServer = http.createServer(function (req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(200);
        res.end(this.stats);
    }.bind(this));
    this.httpServer.on('error', function (err) {
        Logger.error("Stats Server: " + err.message);
    });

    var getStatsBind = this.getStats.bind(this);
    this.httpServer.listen(port, function () {
        // Stats server
        Logger.info("Started stats server on port " + port);
        setInterval(getStatsBind, this.config.serverStatsUpdate * 1000);
    }.bind(this));
};

GameServer.prototype.getStats = function () {
    // Get server statistics
    var s = {
        'server_name': this.config.serverName,
        'server_chat': this.config.serverChat ? "true" : "false",
        'border_width': this.border.width,
        'border_height': this.border.height,
        'gamemode': this.gameMode.name,
        'max_players': this.config.serverMaxConnections,
        'current_players': this.sinfo.players,
        'alive': this.sinfo.humans,
        'spectators': this.sinfo.spectate,
        'update_time': this.updateTimeAvg.toFixed(3),
        'uptime': Math.round((new Date().getTime() - this.startTime.getTime()) / 1000 / 60),
        'start_time': this.startTime
    };
    this.stats = JSON.stringify(s);
};

// ****************************************** TRACKER ****************************************** //

GameServer.prototype.pingServerTracker = function () {
    var time = new Date().getTime();
    if(this.master + 30 <= time) {
        this.master = time;
        if(this.sinfo.players == 0) this.master += 300; // adding 5 min if no players . . .

        // Library imports needed: var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
        var jsondata = {
            players: this.sinfo.players,                    // total people on server including bots
            alive: this.sinfo.humans,                       // players actually playing
            spectators: this.sinfo.spectate,                // player spectators
            maxplayers: this.config.serverMaxConnections,   // max players server allows
            port: this.config.serverPort,                   // the port used for example 441
            gamemode: this.gameMode.name,                   // name of the game mode, `Free For All` as example
            protocol: 100,                                  // 4, 5 or current agar.io 8, or 100 for all
            name: this.config.serverName,                   // the name of the server
            url: this.config.serverURL,                     // the website url for your client withouth http://
            opp: os.platform() + ' ' + os.arch(),           // platform
            uptime: process.uptime(),                       // uptime in seconds
            version: 'OgarServ ' + this.version,            // OgarServ and Version
            starttime: this.startTime.getTime()             // time the server went online in unix timestamp
        };
        var data = JSON.stringify(jsondata);
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "http://localhost/masterjs", !0);
        xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr.send(data);
    }
};

// ******************************************* CLOSE ******************************************* //

GameServer.prototype.exitserver = function () {
    if(this.config.serverMaxConnections != 0) {
        this.sendChatMessage(null, null, "*** Automatic Server Restart in 30 seconds to clean connections and memory ***");
        // console.log("\u001B[31m*** Automatic Server Restart in 30 seconds ***\u001B[0m");
        this.config.serverMaxConnections = 0;
        this.config.LBextraLine = ("\u2002\u2002\u2002\u2002» Restarting now! «\u2002\u2002\u2002\u2002\u2002\u2002");
        this.config.serverResetTime = 0;
        var temp = setTimeout(function () {
            console.log("\u001B[31m*** Server Shutdown! ***\u001B[0m");
            this.wsServer.close();
            process.exit(1);
            window.close();
        }.bind(this), 30000);
    }
};
