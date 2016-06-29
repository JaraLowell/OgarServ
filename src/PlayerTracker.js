var Packet = require('./packet');
var GameServer = require('./GameServer');

function PlayerTracker(gameServer, socket) {
    this.pID = -1;
    this.disconnect = -1; // Disconnection
    this.name = '';
    this.skin = '';
    this.gameServer = gameServer;
    this.socket = socket;
    this.nodeAdditionQueue = [];
    this.nodeDestroyQueue = [];
    this.visibleNodes = [];
    this.cells = [];
    this.score = 0;  // Leaderboard
    this.hscore = 0; // High score
    this.cscore = 0; // Max Cells
    this.writeInfo = 12;
    this.remoteAddress = "undefined";
    this.pingssent = process.hrtime();
    this.mouse = {x: 0, y: 0};
    this.startpos = {x: 0, y: 0};
    this.tickLeaderboard = 0; //
    this.tickViewBox = 0;
    this.mouseCells = []; // For individual cell movement
    this.team = 0;
    this.cTime = new Date();
    this.lastchat = "";
    this.spam = 0;
    this.spectate = true;
    this.freeRoam = false; // Free-roam mode enables player to move in spectate mode
    this.freeMouse = true;
    this.spectatedPlayer = -1; // Current player that this player is watching

    // Viewing box
    this.sightRangeX = 0;
    this.sightRangeY = 0;
    this.centerPos = {x: 3000, y: 3000};
    this.viewBox = {
        topY: 0,
        bottomY: 0,
        leftX: 0,
        rightX: 0,
        width: 0, // Half-width
        height: 0 // Half-height
    };

    // Gamemode function
    if (gameServer) {
        // Find center
        this.centerPos.x = (gameServer.config.borderLeft - gameServer.config.borderRight) / 2;
        this.centerPos.y = (gameServer.config.borderTop - gameServer.config.borderBottom) / 2;
        this.mouse = this.centerPos;
        // Player id
        this.pID = gameServer.getNewPlayerID();
        // Gamemode function
        gameServer.gameMode.onPlayerInit(this);
    };
}

module.exports = PlayerTracker;

// Setters/Getters
PlayerTracker.prototype.setName = function (name) {
    this.name = name;
};

PlayerTracker.prototype.getName = function () {
    return this.name;
};

PlayerTracker.prototype.setSkin = function(skin) {
    this.skin = skin;
};

PlayerTracker.prototype.getSkin = function () {
    return this.skin;
};

PlayerTracker.prototype.getScore = function (reCalcScore) {
    if (reCalcScore) {
        var s = 0;
        for (var i = 0, llen = this.cells.length; i < llen; i++) {
            s += this.cells[i].mass;
        }
        this.score = s;
        if (s > this.hscore) this.hscore = s;
    }
    if (this.cells.length > this.cscore) this.cscore = this.cells.length;
    return this.score >> 0;
};

PlayerTracker.prototype.setColor = function (color) {
    this.color.r = color.r;
    this.color.b = color.b;
    this.color.g = color.g;
};

PlayerTracker.prototype.getTeam = function () {
    return this.team;
};

// Functions
PlayerTracker.prototype.update = function () {
    // Actions buffer (So that people cant spam packets)
    if (this.gameServer.run) {
        if (this.socket.packetHandler.pressSpace) { // Split cell
            this.gameServer.gameMode.pressSpace(this.gameServer, this);
            this.socket.packetHandler.pressSpace = false;
        }

        if (this.socket.packetHandler.pressW) { // Eject mass
            this.gameServer.gameMode.pressW(this.gameServer, this);
            this.socket.packetHandler.pressW = false;
        }

        if (this.socket.packetHandler.pressQ) { // Q Press
            this.gameServer.gameMode.pressQ(this.gameServer, this);
            this.socket.packetHandler.pressQ = false;
        }

        var updateNodes = []; // Nodes that need to be updated via packet

        // Remove nodes from visible nodes if possible
        var d = 0;
        while (d < this.nodeDestroyQueue.length) {
            var index = this.visibleNodes.indexOf(this.nodeDestroyQueue[d]);
            if (index > -1) {
                this.visibleNodes.splice(index, 1);
                d++; // Increment
            } else {
                // Node was never visible anyways
                this.nodeDestroyQueue.splice(d, 1);
            }
        }

        // Get visible nodes every 400 ms
        var nonVisibleNodes = []; // Nodes that are not visible
        if (this.tickViewBox <= 0) {
            var newVisible = this.calcViewBox();

            // Compare and destroy nodes that are not seen
            for (var i = 0, d = this.visibleNodes.length; i < d; i++) {
                var index = newVisible.indexOf(this.visibleNodes[i]);
                if (index == -1) {
                    // Not seen by the client anymore
                    nonVisibleNodes.push(this.visibleNodes[i]);
                }
            }

            // Add nodes to client's screen if client has not seen it already
            for (var i = 0, d = newVisible.length; i < d; i++) {
                var index = this.visibleNodes.indexOf(newVisible[i]);
                if (index == -1) {
                    updateNodes.push(newVisible[i]);
                }
            }

            this.visibleNodes = newVisible;
            // Reset Ticks
            this.tickViewBox = 2;
        } else {
            this.tickViewBox--;
            // Add nodes to screen
            for (var i = 0, d = this.nodeAdditionQueue.length; i < d; i++) {
                var node = this.nodeAdditionQueue[i];
                this.visibleNodes.push(node);
                updateNodes.push(node);
            }
        }

        // Update moving nodes
        for (var i = 0, llen = this.visibleNodes.length; i < llen; i++) {
            var node = this.visibleNodes[i];
            if (node.sendUpdate()) {
                // Sends an update if cell is moving
                updateNodes.push(node);
            }
        }

        // Send packet
        this.socket.sendPacket(new Packet.UpdateNodes(this.nodeDestroyQueue, updateNodes, nonVisibleNodes, this.gameServer.config.serverVersion));
        this.nodeDestroyQueue = []; // Reset destroy queue
        this.nodeAdditionQueue = []; // Reset addition queue

        // Update leaderboard
        if (this.tickLeaderboard <= 0) {
            this.socket.sendPacket(this.gameServer.lb_packet);
            this.tickLeaderboard = 40; // 20 ticks = 1 second
            if (this.gameServer.sqlconfig.host != '') {
                this.writeInfo--;
            }
        } else {
            this.tickLeaderboard--;
        }
    }

    // Handle MySQL (about every 12 seconds)
    if (this.writeInfo <= 0) {
        var ip = "BOT";
        if (typeof this.socket.remoteAddress != 'undefined' && this.socket.remoteAddress != 'undefined') {
            ip = this.socket.remoteAddress;
        }

        if( ip != "BOT" && this.hscore > 500 ) {
            this.gameServer.mysql.writeScore(this.name, ip, this.hscore, this.gameServer.sqlconfig.table);
        }

        this.writeInfo = 12;
    }

    // Handles disconnections
    if (this.disconnect > 0) {
        // Player has disconnected... remove it when the timer hits -1
        this.disconnect--;
        if (this.cells.length) {
            // Remove all client cells
            var len = this.cells.length;
            for(var i = 0; i < len; i++) {
                var cell = this.socket.playerTracker.cells[0];
                if (!cell) {
                    continue;
                }
                while(cell.mass > this.gameServer.config.ejectMassLoss) {
                    cell.mass -= Math.round(this.gameServer.config.ejectMassLoss * 3.33);
                    this.gameServer.ejectBoom(cell.position, cell.getColor());
                }
                this.gameServer.removeNode(cell);
            }
        }

        this.gameServer.apcount = 0;
        if (this.disconnect == 0) {
            // Remove from client list
            var index = this.gameServer.clients.indexOf(this.socket);
            if (index != -1) {
                this.gameServer.clients.splice(index, 1);
            }
        }
    }
};

// Viewing box (And Highscore Check)
PlayerTracker.prototype.updateSightRange = function () {
    var totalSize = 1.0,
        totalScore = 0;

    for (var i = 0, len = this.cells.length; i < len; i++) {
        if (!this.cells[i]) {
            continue;
        }
        totalSize += this.cells[i].getSize();
        totalScore += this.cells[i].mass;
    }

    var factor = Math.pow(Math.min(64.0 / totalSize, 1), 0.4);
    this.sightRangeX = this.gameServer.config.serverViewBaseX / factor;
    this.sightRangeY = this.gameServer.config.serverViewBaseY / factor;

    if (totalScore > this.hscore) this.hscore = totalScore;
};

// Get center of cells
PlayerTracker.prototype.updateCenter = function () {
    var len = this.cells.length;

    if (len <= 0) {
        return; // End the function if no cells exist
    }

    var X = 0;
    var Y = 0;
    for (var i = 0; i < len; i++) {
        if (!this.cells[i]) {
            continue;
        }

        X += this.cells[i].position.x;
        Y += this.cells[i].position.y;
    }

    this.centerPos.x = X / len >> 0;
    this.centerPos.y = Y / len >> 0;
};

PlayerTracker.prototype.calcViewBox = function () {
    if (this.spectate) {
        // Spectate mode
        if(this.freeRoam) {
            return this.getSpectateNodesF();
        } else {
            return this.getSpectateNodes();
        }
    }

    // Main function
    this.updateSightRange();
    this.updateCenter();

    // Box
    this.viewBox.topY = this.centerPos.y - this.sightRangeY;
    this.viewBox.bottomY = this.centerPos.y + this.sightRangeY;
    this.viewBox.leftX = this.centerPos.x - this.sightRangeX;
    this.viewBox.rightX = this.centerPos.x + this.sightRangeX;
    this.viewBox.width = this.sightRangeX;
    this.viewBox.height = this.sightRangeY;

    var newVisible = [];
    for (var node, i = 0, llen = this.gameServer.nodes.length; i < llen; i++) {
        node = this.gameServer.nodes[i];
        if (!node) {
            continue;
        } else if (node.mass < 1) {
            continue;
        } else if (node.visibleCheck(this.viewBox, this.centerPos) || node.owner == this) {
            // Cell is in range of viewBox
            newVisible.push(node);
        }
    }
    return newVisible;
};

PlayerTracker.prototype.getSpectateNodesF = function () {
    // User is in free roam
    // To mimic agar.io, get distance from center to mouse and apply a part of the distance
    var dist = this.gameServer.getDist(this.mouse.x, this.mouse.y, this.centerPos.x, this.centerPos.y);
    var angle = this.getAngle(this.mouse.x, this.mouse.y, this.centerPos.x, this.centerPos.y);
    var speed = Math.min(dist / 24, 124); // Not to break laws of universe by going faster than light speed

    this.centerPos.x += speed * Math.sin(angle);
    this.centerPos.y += speed * Math.cos(angle);

    // Check if went away from borders
    this.checkBorderPass();

    // Now that we've updated center pos, get nearby cells
    // We're going to use config's view base times 3.5

    var mult = 4.5; // To simplify multiplier, in case this needs editing later on
    this.viewBox.topY = this.centerPos.y - this.gameServer.config.serverViewBaseY * mult;
    this.viewBox.bottomY = this.centerPos.y + this.gameServer.config.serverViewBaseY * mult;
    this.viewBox.leftX = this.centerPos.x - this.gameServer.config.serverViewBaseX * mult;
    this.viewBox.rightX = this.centerPos.x + this.gameServer.config.serverViewBaseX * mult;
    this.viewBox.width = this.gameServer.config.serverViewBaseX * mult;
    this.viewBox.height = this.gameServer.config.serverViewBaseY * mult;

    // Use calcViewBox's way of looking for nodes
    var newVisible = [], specZoom = 256;
    for (var i = 0; i < this.gameServer.nodes.length; i++) {
        node = this.gameServer.nodes[i];
        if (!node) {
            continue;
        } else if (node.cellType == 1) {
            continue;
        } else if (node.visibleCheck(this.viewBox, this.centerPos)) {
            // Cell is in range of viewBox
            newVisible.push(node);
            if(node.size > specZoom) specZoom = node.size;
        }
    }
    specZoom = Math.pow(Math.min(40.5 / (specZoom * 3.14), 1.0), 0.4) * 0.6; // Constant zoom
    this.socket.sendPacket(new Packet.UpdatePosition(this.centerPos.x, this.centerPos.y, specZoom));
    return newVisible;
};

PlayerTracker.prototype.getSpectateNodes = function () {
    var specPlayer;

    if (this.gameServer.getMode().specByLeaderboard) {
        this.spectatedPlayer = Math.min(this.gameServer.leaderboard.length - 1, this.spectatedPlayer);
        specPlayer = this.spectatedPlayer == -1 ? null : this.gameServer.leaderboard[this.spectatedPlayer];
    } else {
        this.spectatedPlayer = Math.min(this.gameServer.clients.length - 1, this.spectatedPlayer);
        specPlayer = this.spectatedPlayer == -1 ? null : this.gameServer.clients[this.spectatedPlayer].playerTracker;
    }

    if (specPlayer) {
        // If selected player has died/disconnected, switch spectator and try again next tick
        if (specPlayer.cells.length == 0) {
            this.gameServer.switchSpectator(this);
            return [];
        }

        // Get spectated player's location and calculate zoom amount
        var specZoom = Math.sqrt(100 * specPlayer.score);
        specZoom = Math.pow(Math.min(40.5 / specZoom, 1.0), 0.4) * 0.6;
        // TODO: Send packet elsewhere so it is send more often
        this.socket.sendPacket(new Packet.UpdatePosition(specPlayer.centerPos.x, specPlayer.centerPos.y, specZoom));
        // TODO: Recalculate visible nodes for spectator to match specZoom
        return specPlayer.visibleNodes.slice(0, specPlayer.visibleNodes.length);
    } else {
        this.gameServer.switchSpectator(this);
        return []; // Nothing
    }
};

PlayerTracker.prototype.checkBorderPass = function () {
    // A check while in free-roam mode to avoid player going into nothingness
    if (this.centerPos.x < this.gameServer.config.borderLeft) {
        this.centerPos.x = this.gameServer.config.borderLeft;
    }
    if (this.centerPos.x > this.gameServer.config.borderRight) {
        this.centerPos.x = this.gameServer.config.borderRight;
    }
    if (this.centerPos.y < this.gameServer.config.borderTop) {
        this.centerPos.y = this.gameServer.config.borderTop;
    }
    if (this.centerPos.y > this.gameServer.config.borderBottom) {
        this.centerPos.y = this.gameServer.config.borderBottom;
    }
};

PlayerTracker.prototype.getAngle = function(x1, y1, x2, y2) {
    var deltaY = y1 - y2;
    var deltaX = x1 - x2;
    return Math.atan2(deltaX, deltaY);
};
