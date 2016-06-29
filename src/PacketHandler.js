var Packet = require('./packet');

function PacketHandler(gameServer, socket) {
    this.gameServer = gameServer;
    this.socket = socket;
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
            if(!client.freeMouse) break;

            if (view.byteLength == 13) {
                // protocol late 5, 6, 7
                client.mouse.x = view.getInt32(1, true);
                client.mouse.y = view.getInt32(5, true);
            } else if (view.byteLength == 9) {
                // early protocol 5
                client.mouse.x = view.getInt16(1, true);
                client.mouse.y = view.getInt16(3, true);
            } else if (view.byteLength == 21) {
                // protocol 4
                client.mouse.x = view.getFloat64(1, true);
                client.mouse.y = view.getFloat64(9, true);
            }

            if (isNaN(client.mouse.x)) client.mouse.x = client.centerPos.x;
            if (isNaN(client.mouse.y)) client.mouse.y = client.centerPos.y;

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
            // for (var message = '', i = 1, llen = view.byteLength; i < llen; i++) {
            //    message += String.fromCharCode(view.getUint8(i, !0));
            // }
            break;
        case 82:
            // User login access token
            break;
        case 90:
            // Send Server Info
            this.socket.sendPacket(new Packet.ServerInfo(process.uptime().toFixed(0), this.gameServer.sinfo.humans, this.gameServer.config.borderRight, this.gameServer.nodes.length, this.gameServer.config.serverGamemode));
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

            // Remove trailing spaces
            message = message.trim();
            if (message == "") {
                break;
            }

            // Get player name
            var wname = this.socket.playerTracker.name;
            if (wname == "") wname = "Spectator";

            // Rcon if enabled
            if (this.gameServer.config.serverAdminPass != '') {
                if ( this.rcon(message, wname) == true ) break;
            }

            // Spam chat delay
            if ((this.gameServer.time - this.socket.playerTracker.cTime) < this.gameServer.config.chatIntervalTime) {
                var time = 1 + Math.floor(((this.gameServer.config.chatIntervalTime - (this.gameServer.time - this.socket.playerTracker.cTime)) / 1000) % 60);
                var packet = new Packet.BroadCast("*** Wait " + time + " seconds more, before you can send a message. ***");
                this.socket.sendPacket(packet);
                break;
            }
            this.socket.playerTracker.cTime = this.gameServer.time;

            // Location to chat
            if(message == "pos") message = this.MyPos();

            // Repeating chat block
            if (message == this.socket.playerTracker.lastchat) {
                this.socket.playerTracker.spam++;
                if (this.socket.playerTracker.spam > 2)
                {
                    console.log("\u001B[35m" + wname + " kicked for spam\u001B[0m");
                    var packet = new Packet.BroadCast("*** Your kicked for spamming chat! ***");
                    this.socket.sendPacket(packet);
                    this.socket.close();
                    break;
                }
            } else {
                this.socket.playerTracker.lastchat = message;
                this.socket.playerTracker.spam = 0;
            }

            // Profanity filter
            message = this.WordScan(message);

            // Chat logging
            if (this.gameServer.config.chatToConsole == 1) {
                console.log("\u001B[36m" + wname + ": \u001B[0m" + message);
            }

            if (this.gameServer.config.serverLogToFile) {
                var fs = require('fs');
                var wstream = fs.createWriteStream('logs/chat.log', {flags: 'a'});
                wstream.write('[' + this.gameServer.formatTime() + '] ' + wname + ': ' + message + '\n');
                wstream.end();
            }

            // Send to all clients (broadcast)
            var packet = new Packet.Chat(this.socket.playerTracker, message);
            for (var i = 0, llen = this.gameServer.clients.length; i < llen; i++) {
                this.gameServer.clients[i].sendPacket(packet);
            }
            break;
        case 102:
            // Some score stuff it seems send by Agar.io
            break;
        case 254:
            this.protocol = view.getInt32(1, true);
            if(this.protocol < 4) this.protocol = 4;
            this.socket.sendPacket(new Packet.ClearNodes());
            break;
        case 255:
            // Connection Start
            if (view.byteLength == 5) {
                var c = this.gameServer.config;

                // Boot Player if Server Full
                if (this.gameServer.sinfo.players > c.serverMaxConnections) {
                    this.socket.sendPacket(new Packet.ServerMsg(93));
                    this.socket.close();
                    break;
                }
                this.socket.sendPacket(new Packet.SetBorder(c.borderLeft, c.borderRight, c.borderTop, c.borderBottom, this.gameServer.version));
                this.socket.sendPacket(new Packet.ServerInfo(process.uptime().toFixed(0), this.gameServer.sinfo.humans, c.borderRight, c.foodMaxAmount, c.serverGamemode));
            }
            break;
        default:
            console.log("Unknown Packet ID: " + packetId);
            break;
    }
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
    line = line.replace(/servertime/gi, "time now is " + this.gameServer.formatTime());

    // Stop Stealing My BOT's Tags already!
    line = line.replace(/\[(BOT)\]/gi, "[2ch]");
    line = line.replace(/<BOT>/gi, "<2ch>");

    // Block http:// in chat/name
    line = line.replace(/.*?:\/\//g, "");

    return line;
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
};

PacketHandler.prototype.MyPos = function() {
    var clientpos = this.socket.playerTracker.centerPos;
    var msizex = (this.gameServer.config.borderRight - this.gameServer.config.borderLeft) / 5;
    var msizey = (this.gameServer.config.borderBottom - this.gameServer.config.borderTop) / 5;

    var pX = "1";
    var shortX = "left";
    if( clientpos.x > msizex      ) { pX = "2"; shortX = "left";  }
    if( clientpos.x > (msizex * 2)) { pX = "3"; shortX = "middle";}
    if( clientpos.x > (msizex * 3)) { pX = "4"; shortX = "right"; }
    if( clientpos.x > (msizex * 4)) { pX = "5"; shortX = "right"; }

    var pY = "A";
    var shortY = "top";
    if( clientpos.y > msizey      ) { pY = "B"; shortY = "top"; }
    if( clientpos.y > (msizey * 2)) { pY = "C"; shortY = "middle"; }
    if( clientpos.y > (msizey * 3)) { pY = "D"; shortY = "bottom"; }
    if( clientpos.y > (msizey * 4)) { pY = "E"; shortY = "bottom"; }

    var short = "";
    if(shortY == "middle" && shortX == "middle") {
        short = "center @ ";
    } else {
        short = shortY + " " + shortX + " @ ";
    }

    return "i am at " + clientpos.x + " : " + clientpos.y + " (" + short + pY + pX + ")";
};

PacketHandler.prototype.setNickname = function(newNick) {
    var client = this.socket.playerTracker;
    if (client.cells.length < 1) {
        if (typeof this.socket.remoteAddress != 'undefined' && this.socket.remoteAddress != 'undefined') {
            newNick = this.WordScan(newNick);
        }
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

// Fun functions to reverse a string, for example `OgarServ` to `vreSragO`
// Used as April's first joke in 2016
PacketHandler.prototype.ReverseString = function(s) {
  return s.split('').reverse().join('')
};
