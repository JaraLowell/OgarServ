var Packet = require('./packet');
var LastMsg;
var SpamBlock;

function PacketHandler(gameServer, socket) {
    this.gameServer = gameServer;
    this.socket = socket;
    // Detect protocol version - we can do something about it later
    this.protocol = 0;
    this.pressQ = false;
    this.pressW = false;
    this.pressSpace = false;
}

module.exports = PacketHandler;

PacketHandler.prototype.handleMessage = function (message) {
    function stobuf(buf) {
        var length = buf.length;
        var arrayBuf = new ArrayBuffer(length);
        var view = new Uint8Array(arrayBuf);
        for (var i = 0; i < length; i++) {
            view[i] = buf[i];
        }
        return view.buffer;
    }

    // Discard empty messages
    if (message.length == 0) {
        return;
    }

    var buffer = stobuf(message);
    var view = new DataView(buffer);
    var packetId = view.getUint8(0, true);

    switch (packetId) {
        case 0:
            // Set Nickname
            var nick = '';

            for (var i = 1, llen = view.byteLength; i < llen; i += 2) {
                var charCode = view.getUint16(i, true);
                if (charCode == 0) {
                    break;
                }
                nick += String.fromCharCode(charCode);
            }

            this.setNickname(nick);
            break;
        case 1:
            // Spectate mode
            if (this.socket.playerTracker.cells.length <= 0) {
                this.gameServer.switchSpectator(this.socket.playerTracker);
                this.socket.playerTracker.spectate = true;
            }
            break;
        case 16:
            // Mouse coordinates
            var client = this.socket.playerTracker;
            if (view.byteLength == 13) {
                client.mouse.x = view.getInt32(1, true);
                client.mouse.y = view.getInt32(5, true);
            } else if (view.byteLength == 9) {
                client.mouse.x = view.getInt16(1, true);
                client.mouse.y = view.getInt16(3, true);
            } else if (view.byteLength == 21) {
                client.mouse.x = view.getFloat64(1, true);
                client.mouse.y = view.getFloat64(9, true);
            }
            break;
        case 17:
            // Space Press - Split cell
            this.pressSpace = true;
            break;
        case 18:
            // Q Key Pressed
            this.pressQ = true;
            break;
        case 19:
            // Q Key Released
            break;
        case 21:
            // W Press - Eject mass
            this.pressW = true;
            break;
        case 80:
            // Cookie Code from Agar.io
            for (var message = '', i = 1, llen = view.byteLength; i < llen; i++) {
                message += String.fromCharCode(view.getUint8(i, !0));
            }
            break;
        case 82:
            // User login access token
            var service = view.getUint8(1, !0);
            for (var message = '', i = 2, llen = view.byteLength; i < llen; i++) {
                message += String.fromCharCode(view.getUint8(i, !0));
            }
            switch (service) {
                case 1:
                    // Recieved facebook access token
                    // fbapi(message, this.socket.remoteAddress);
                    break;
                case 2:
                    // recieved google+ access token
                    break;
                default:
                    break;
            }
            break;
        case 90:
            // Send Server Info
            var serv = this.gameServer.getPlayers();
            this.socket.sendPacket(new Packet.ServerInfo(process.uptime().toFixed(0), serv.humans, this.gameServer.config.borderRight, this.gameServer.config.foodMaxAmount, this.gameServer.config.serverGamemode));
            break;
        case 99:
            // Chat
            var message = "",
                maxLen = this.gameServer.config.chatMaxMessageLength * 2,
                offset = 2,
                flags = view.getUint8(1);

            if (flags & 2) {
                offset += 4;
            }
            if (flags & 4) {
                offset += 8;
            }
            if (flags & 8) {
                offset += 16;
            }

            for (var i = offset, llen = view.byteLength; i < llen && i <= maxLen; i += 2) {
                var charCode = view.getUint16(i, true);
                if (charCode == 0) {
                    break;
                }
                message += String.fromCharCode(charCode);
            }

            var wname = this.socket.playerTracker.name;
            if (wname == "") wname = "Spectator";

            if (this.gameServer.config.serverAdminPass != '') {
                if ( this.rcon(message, wname) == true ) break;
            }

            if ((this.gameServer.time - this.socket.playerTracker.cTime) < this.gameServer.config.chatIntervalTime) {
                var time = 1 + Math.floor(((this.gameServer.config.chatIntervalTime - (this.gameServer.time - this.socket.playerTracker.cTime)) / 1000) % 60);
                var packet = new Packet.BroadCast("Wait " + time + " seconds more, before you can send a message.");
                this.socket.sendPacket(packet);
                break;
            }

            this.socket.playerTracker.cTime = this.gameServer.time;

            if (message == LastMsg) {
                ++SpamBlock;
                if (SpamBlock > 5) this.socket.close();
                break;
            }

            LastMsg = message;
            SpamBlock = 0;

            if (this.gameServer.config.chatToConsole == 1) {
                console.log("\u001B[36m" + wname + ": \u001B[0m" + message);
            }

            if (this.gameServer.config.serverLogToFile) {
                var fs = require('fs');
                var wstream = fs.createWriteStream('logs/chat.log', {flags: 'a'});
                wstream.write('[' + this.gameServer.formatTime() + '] ' + wname + ': ' + message + '\n');
                wstream.end();
            }

            var packet = new Packet.Chat(this.socket.playerTracker, message);
            // Send to all clients (broadcast)
            for (var i = 0; i < this.gameServer.clients.length; i++) {
                this.gameServer.clients[i].sendPacket(packet);
            }
            break;
        case 102:
            // Some score stuff it seems send by Agar.io
            break;
        case 254:
            // Handshake setUint32(1, 5, !0)
            break;
        case 255:
            // Connection Start
            if (view.byteLength == 5) {
                var c = this.gameServer.config,
                    serv = this.gameServer.getPlayers();

                // Boot Player if Server Full
                if (serv.players > c.serverMaxConnections) {
                    this.socket.sendPacket(new Packet.ServerMsg(93));
                    this.socket.close();
                }
                this.socket.sendPacket(new Packet.SetBorder(c.borderLeft, c.borderRight, c.borderTop, c.borderBottom));
                this.socket.sendPacket(new Packet.ServerInfo(process.uptime().toFixed(0), serv.humans, c.borderRight, c.foodMaxAmount, this.gameServer.config.serverGamemode));
                break;
            }
            break;
        default:
            console.log("Unknown Packet ID: " + packetId);
            break;
    }
};

PacketHandler.prototype.rcon = function(message, wname) {
    var passkey = "/rcon " + this.gameServer.config.serverAdminPass + " ";
    if (message.substr(0, passkey.length) == passkey) {
        var cmd = message.substr(passkey.length, message.length);
        console.log("\u001B[36m" + wname + ": \u001B[0missued a remote console command: " + cmd);
        var split = cmd.split(" "),
            first = split[0].toLowerCase(),
            execute = this.gameServer.commands[first];
        if (typeof execute != 'undefined') {
            execute(this.gameServer, split);
        } else {
            console.log("Invalid Command!");
        }
        return true;
    } else if (message.substr(0, 6) == "/rcon ") {
        console.log("\u001B[36m" + wname + ": \u001B[0missued a remote console command but used a wrong pass key!");
        return true;
    }
    return false;
}

PacketHandler.prototype.setNickname = function(newNick) {
    var client = this.socket.playerTracker;
    if (client.cells.length < 1) {
        // Set name first
        var newSkin = "";
        if (newNick != null && newNick.length != 0) {
            if (newNick[0] == "<") {
                var n = newNick.indexOf(">", 1);
                if (n != -1) {
                    newSkin = "%" + newNick.slice(1, n);
                    newNick = newNick.slice(n+1);
                }
            } else if (newNick[0] == "|") {
                var n = newNick.indexOf("|", 1);
                if (n != -1) {
                    newSkin = ":http://" + newNick.slice(1, n);
                    newNick = newNick.slice(n+1);
                }
            }
        }

        // Remove spaces incase there where any inbetween skin and name
        newNick = newNick.trim();

        if (newNick.length > (this.gameServer.config.playerMaxNickLength + 1)) {
            newNick = newNick.slice(0, (this.gameServer.config.playerMaxNickLength + 1));
        }

        // No name or weird name, lets call it Cell + pid Number
        if (newNick == "" || newNick == "Unregistered" || newNick == "Un Named") {
            newNick = "Cell" + client.pID;
        }
        // Banned name, lets call it Virus + pid number
        if ( newNick.toLowerCase() == "nazi" || newNick.toLowerCase() == "hitler" || newNick.toLowerCase() == "isis" ) {
            newNick = "Virus" + client.pID;
        }

        if (this.gameServer.gameMode.haveTeams) {
            client.setName(" "+newNick+" "); //trick to disable skins in teammode
        } else {
            client.setName(newNick);
        }

        if (newSkin) {
            this.socket.saveSkin = newSkin;
        } else if (this.socket.saveSkin) {
            newSkin = this.socket.saveSkin;
        }

        client.setSkin(newSkin);

        // If client has no cells... then spawn a player
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer,client);

        // Turn off spectate mode
        client.spectate = false;
    }
};
