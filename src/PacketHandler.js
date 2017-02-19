var Packet = require('./packet');
var BinaryReader = require('./packet/BinaryReader');

function PacketHandler(gameServer, socket) {
    this.gameServer = gameServer;
    this.socket = socket;
    this.protocol = 0;
    this.isHandshakePassed = false;
    this.lastChatTick = 0;
    this.pressQ = false;
    this.pressW = false;
    this.pressSpace = false;
    this.lastStatTime = +new Date;
}

module.exports = PacketHandler;

PacketHandler.prototype.handleMessage = function (message) {
    // Validation
    if (message.length == 0) {
        return;
    }
    if (message.length > 256) {
        // anti-spamming
        this.socket.close(1009, "Spam");
        return;
    }

    // no handshake?
    if (!this.isHandshakePassed) {
        if (message[0] != 254 || message.length != 5) {
            // wait handshake
            return;
        }

        var reader = new BinaryReader(message);
        reader.skipBytes(1);

        // Handshake request
        this.protocol = reader.readUInt32();
        if (this.protocol < 1 || this.protocol > 11) {
            this.socket.close(1002, "Not supported protocol " + this.protocol);
            return;
        }

        // Send handshake response
        this.socket.sendPacket(new Packet.ClearAll());
        this.socket.sendPacket(new Packet.SetBorder(this.socket.playerTracker, this.gameServer.border, this.gameServer.config.serverGamemode, "OgarServ " + this.gameServer.version));

        // Send welcome message
        this.gameServer.sendChatMessage(null, this.socket.playerTracker, "Ogar Server version " + this.gameServer.version + " running game mode " + this.gameServer.gameMode.name);
        if (this.gameServer.config.serverWelcome1)
            this.gameServer.sendChatMessage(null, this.socket.playerTracker, this.gameServer.config.serverWelcome1);
        if (this.gameServer.config.serverWelcome2)
            this.gameServer.sendChatMessage(null, this.socket.playerTracker, this.gameServer.config.serverWelcome2);
        if (this.gameServer.config.serverChat == 0)
            this.gameServer.sendChatMessage(null, this.socket.playerTracker, "This server's chat is disabled.");
        if (this.protocol < 4) {
            this.gameServer.sendChatMessage(null, this.socket.playerTracker, "WARNING: Your client requested protocol " + this.protocol + ", assuming 5!");
            this.protocol = 5;
        }

        if (this.protocol == 5 && this.socket.playerTracker.origen == 'ogar.mivabe.nl') {
            this.gameServer.sendChatMessage(null, this.socket.playerTracker, "New Beta Client active! See main page for the link and give it a try.");
        }

        this.isHandshakePassed = true;
        return;
    }
    this.socket.lastAliveTime = +new Date;

    if (this.socket.playerTracker.isMinion && this.socket.playerTracker.spawnCounter >= 2) {
        return;
    }

    var reader = new BinaryReader(message);
    var packetId = reader.readUInt8();

    switch (packetId) {
        case 0:
            if (this.socket.playerTracker.cells.length > 0) {
                break;
            }
            var text = null;
            if (this.protocol <= 5)
                text = reader.readStringZeroUnicode();
            else
                text = reader.readStringZeroUtf8();
            this.setNickname(text);
            break;
        case 1:
            // Spectate mode
            if (this.socket.playerTracker.cells.length <= 0) {
                // Make sure client has no cells
                this.socket.playerTracker.spectate = true;
                this.socket.playerTracker.color = this.gameServer.getGrayColor(this.gameServer.getRandomColor());
            }
            break;
        case 16:
            // Mouse
            var client = this.socket.playerTracker;
            if(!client.freeMouse) break;

            if (message.length == 13) {
                // protocol late 5, 6, 7
                client.mouse.x = reader.readInt32() - client.scrambleX;
                client.mouse.y = reader.readInt32() - client.scrambleY;
            } else if (message.length == 9) {
                // early protocol 5
                client.mouse.x = reader.readInt16() - client.scrambleX;
                client.mouse.y = reader.readInt16() - client.scrambleY;
            } else if (message.length == 21) {
                // protocol 4
                client.mouse.x = reader.readDouble() - client.scrambleX;
                client.mouse.y = reader.readDouble() - client.scrambleY;
                if (isNaN(client.mouse.x))
                    client.mouse.x = client.centerPos.x;
                if (isNaN(client.mouse.y))
                    client.mouse.y = client.centerPos.y;
            }
            break;
        case 17:
            // Pressed Spacebar - Split Cells
            this.pressSpace = true;
            break;
        case 18:
            // Pressed Q - Switch Spectator
            this.pressQ = true;
            break;
        case 21:
            // Predded W - Eject Mass
            this.pressW = true;
            break;
        case 22:
            // Pressed E - Minion Split Cells
            this.socket.playerTracker.minionSplit = true;
            break;
        case 23:
            // Pressed R - Minion Eject Mass
            this.socket.playerTracker.minionEject = true;
            break;
        case 24:
            // Pressed T - Minion stop moving
            this.socket.playerTracker.minionFrozen =! this.socket.playerTracker.minionFrozen;
            break;
        case 25:
            // Pressed P - Minion go collect food
            this.socket.playerTracker.collectPellets =! this.socket.playerTracker.collectPellets;
            break;
        case 104:
            // Tunr on/off Minimap
            var a = reader.readUInt8();
            this.socket.playerTracker.MiniMap = a;
            break;
        case 90:
            // Send Server Info
            this.socket.sendPacket(new Packet.ServerInfo(process.uptime().toFixed(0),
                                                         this.gameServer.sinfo.humans,
                                                         this.gameServer.config.borderWidth,
                                                         this.gameServer.nodes.length,
                                                         this.gameServer.config.serverGamemode));
            break;
        case 99:
            // Chat
            if (message.length < 3)             // first validation
                break;

            var flags = reader.readUInt8();    // flags
            var rvLength = (flags & 2 ? 4:0) + (flags & 4 ? 8:0) + (flags & 8 ? 16:0);
            if (message.length < 3 + rvLength) // second validation
                break;

            reader.skipBytes(rvLength);        // reserved
            var text = null;
            if (this.protocol < 6)
                text = reader.readStringZeroUnicode();
            else
                text = reader.readStringZeroUtf8();

            text = text.trim();

            if(text.length > 1)
            {
                // Profanity filter
                text = this.WordScan(text);
                this.gameServer.onChatMessage(this.socket.playerTracker, null, text);
            }
            break;
        case 254:
            // Server stat
            var time = +new Date;
            var dt = time - this.lastStatTime;
            this.lastStatTime = time;
            if (dt < 1000) break;
            this.socket.sendPacket(new Packet.ServerStat(this.socket.playerTracker));
            break;
        default:
            break;
    }
};

PacketHandler.prototype.setNickname = function (text) {
    var name = "";
    var skin = null;
    if (text != null && text.length > 0) {
        var skinName = null;
        var userName = text;
        var n = -1;
        if (text[0] == '<' && (n = text.indexOf('>', 1)) >= 1) {
            if (n > 1)
                skinName = "%" + text.slice(1, n);
            else
                skinName = "";
            userName = text.slice(n + 1);
        }
        //else if (text[0] == "|" && (n = text.indexOf('|', 1)) >= 0) {
        //    skinName = ":http://i.imgur.com/" + text.slice(1, n) + ".png";
        //    userName = text.slice(n + 1);
        //}
        //if (skinName && !this.gameServer.checkSkinName(skinName)) {
        //    skinName = null;
        //    userName = text;
        //}
        skin = skinName;
        name = userName;
    }
    if (name.length > this.gameServer.config.playerMaxNickLength) {
        name = name.substring(0, this.gameServer.config.playerMaxNickLength);
    }

    name = name.trim();
    if(name != "") {
        if(this.socket.isConnected != null)
            name = this.WordScan(name);
        if(name == '\uD83D\uDCE2')
            name = 'Noob';

        // Weird name, lets call it Cell + pid Number
        if (name.toLowerCase() == "unregistered" || name.toLowerCase() == "an unnamed cell" || name.toLowerCase() == "adblock! :(" || name.toLowerCase() == "adblocker :(") {
            var s = this.socket.playerTracker.pID.toString();
            while (s.length < 4) s = "0" + s;
            name = "Cell" + s;
        }
    } else {
        // No name
        var s = this.socket.playerTracker.pID.toString();
        while (s.length < 4) s = "0" + s;
        name = "Cell" + s;
    }
    if(skin != null) skin = skin.trim();
    this.socket.playerTracker.joinGame(name, skin);
};

PacketHandler.prototype.WordScan = function(line) {
    // a few bad words...
    line = line.replace(/isis/gi, "kiss");
    line = line.replace(/faggot/gi, "cloud");
    line = line.replace(/hitler/gi, "coyote");
    line = line.replace(/nazi/gi, "rat");
    line = line.replace(/cock/gi, "broom");
    line = line.replace(/fuck/gi, "meow");
    line = line.replace(/dick/gi, "rose");
    line = line.replace(/suck/gi, "fly");
    line = line.replace(/bitch/gi, "sweet");
    line = line.replace(/shit/gi, "poo");
    line = line.replace(/cunt/gi, "egad");
    line = line.replace(/slut/gi, "love");
    line = line.replace(/weed/gi, "flower");
    line = line.replace(/gay/gi, "bat");
    line = line.replace(/penis/gi, "darn");
    line = line.replace(/nigger/gi, "tigger");
    line = line.replace(/nigga/gi, "tigger");
    line = line.replace(/porn/gi, "milk");
    line = line.replace(/cocaine/gi, "candy");

    // Stop Stealing My BOT's Tags already!
    line = line.replace(/\[(BOT)\]/gi, "[2ch]");
    line = line.replace(/<BOT>/gi, "<2ch>");

    // Block http:// in chat/name
    line = line.replace(/.*?:\/\//g, "");

    return line;
};
