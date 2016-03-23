// Imports
var GameMode = require('../gamemodes');
var Packet = require('../packet');
var Entity = require('../entity');
var fs = require("fs");
var ini = require('./ini.js');

function Commands() {
    this.list = {}; // Empty
}

module.exports = Commands;

// Utils
var fillChar = function (data, char, fieldLength, rTL) {
    var result = data.toString();
    var llen = decodeUnicode(result);
    if (rTL === true) {
        for (var i = llen; i < fieldLength; i++)
            result = char.concat(result);
    }
    else {
        for (var i = llen; i < fieldLength; i++)
            result = result.concat(char);
    }
    return result;
};

var decodeUnicode = function (str) {
    var r = [], i = 0;
    while(i < str.length) {
        var chr = str.charCodeAt(i++);
        if(chr >= 0xD800 && chr <= 0xDBFF) {
            // surrogate pair
            var low = str.charCodeAt(i++);
            r.push(0x10000 + ((chr - 0xD800) << 10) | (low - 0xDC00));
        } else {
            // ordinary character
            r.push(chr);
        }
    }
    return r.length;
};

var seconds2time = function (seconds) {
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds - (hours * 3600)) / 60);
    var seconds = seconds - (hours * 3600) - (minutes * 60);
    var time = "";

    if (hours != 0) {
        time = hours + ":";
    }
    if (minutes != 0 || time !== "") {
        minutes = (minutes < 10 && time !== "") ? "0" + minutes : String(minutes);
        time += minutes + ":";
    }
    if (time === "") {
        time = seconds + " seconds";
    }
    else {
        time += (seconds < 10) ? "0" + seconds : String(seconds);
    }
    return time;
};

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Commands
Commands.list = {
    help: function (gameServer, split) {
        console.log("========================== HELP ============================");
        console.log("\u001B[36maddbot     \u001B[0m: add one or more bot to the server");
        console.log("\u001B[36mban        \u001B[0m: ban a player with IP");
        console.log("\u001B[36mbanlist    \u001B[0m: show current ban list");
        console.log("\u001B[36mboard      \u001B[0m: set scoreboard text");
        console.log("\u001B[36mboardreset \u001B[0m: reset scoreboard text");
        console.log("\u001B[36mchange     \u001B[0m: change specified settings");
        console.log("\u001B[36mclear      \u001B[0m: clear console output");
        console.log("\u001B[36mcolor      \u001B[0m: set cell(s) color by client ID");
        console.log("\u001B[36mexit       \u001B[0m: stop the server");
        console.log("\u001B[36mfood       \u001B[0m: spawn food at specified Location");
        console.log("\u001B[36mgamemode   \u001B[0m: change server gamemode");
        console.log("\u001B[36mkick       \u001B[0m: kick player or bot by client ID");
        console.log("\u001B[36mkill       \u001B[0m: kill cell(s) by client ID");
        console.log("\u001B[36mkillall    \u001B[0m: kill everyone");
        console.log("\u001B[36mmass       \u001B[0m: set cell(s) mass by client ID");
        console.log("\u001B[36mmerge      \u001B[0m: force a player to merge");
        console.log("\u001B[36mname       \u001B[0m: change cell(s) name by client ID");
        console.log("\u001B[36mplayerlist \u001B[0m: get list of players and bots");
        console.log("\u001B[36mpause      \u001B[0m: pause game , freeze all cells");
        console.log("\u001B[36mreload     \u001B[0m: reload config");
        console.log("\u001B[36msay        \u001B[0m: chat from console");
        console.log("\u001B[36mskin       \u001B[0m: change cell(s) skin by client ID");
        console.log("\u001B[36msplit      \u001B[0m: force a player to split");
        console.log("\u001B[36mstatus     \u001B[0m: get server status");
        console.log("\u001B[36mtp         \u001B[0m: teleport player to specified location");
        console.log("\u001B[36munban      \u001B[0m: un ban a player with IP");
        console.log("\u001B[36mvirus      \u001B[0m: spawn virus at a specified Location");
        console.log("============================================================");
    },
    addbot: function (gameServer, split) {
        if (gameServer.config.serverBots != -1) {
            var add = parseInt(split[1]);
            if (isNaN(add)) {
                add = 1; // Adds 1 bot if user doesnt specify a number
            }
            for (var i = 0; i < add; i++) {
                gameServer.bots.addBot();
            }
            console.log("\u001B[36mServer: \u001B[0mAdded " + add + " player bot(s)");
        }
        else
            console.log("\u001B[36mServer: \u001B[0mCan not add bots when config file has bot system disabled (serverBots = -1)");
    },
    ban: function (gameServer, split) {
        var ip = split[1]; // Get ip
        if (gameServer.banned.indexOf(ip) == -1) {
            gameServer.banned.push(ip);
            console.log("\u001B[36mServer: \u001B[0mAdded " + ip + " to the banlist");
            fs.writeFileSync('./gameserver.ban', ini.stringify(gameServer.banned));
            // Remove from game
            for (var i in gameServer.clients) {
                var c = gameServer.clients[i];
                if (!c.remoteAddress) {
                    continue;
                }
                if (c.remoteAddress == ip) {
                    c.sendPacket(new Packet.ServerMsg(91));
                    //this.socket.close();
                    c.close(); // Kick out
                }
            }
        } else {
            console.log("\u001B[36mServer: \u001B[0mThat IP is already banned");
        }
    },
    banlist: function (gameServer, split) {
        if ((typeof split[1] != 'undefined') && (split[1].toLowerCase() == "clear")) {
            gameServer.banned = [];
            console.log("\u001B[36mServer: \u001B[0mCleared ban list");
            fs.unlinkSync('./gameserver.ban');
            return;
        }

        console.log("\u001B[36mServer: \u001B[0mCurrent banned IPs (" + gameServer.banned.length + ")");
        for (var i in gameServer.banned) {
            console.log(gameServer.banned[i]);
        }
    },
    board: function (gameServer, split) {
        var newLB = [];
        for (var i = 1; i < split.length; i++) {
            newLB[i - 1] = split[i];
        }

        // Clears the update leaderboard function and replaces it with our own
        gameServer.gameMode.packetLB = 48;
        gameServer.gameMode.specByLeaderboard = false;
        gameServer.gameMode.updateLB = function (gameServer) {
            gameServer.leaderboard = newLB
        };
        console.log("\u001B[36mServer: \u001B[0mSuccessfully changed leaderboard values");
    },
    boardreset: function (gameServer) {
        // Gets the current gamemode
        var gm = GameMode.get(gameServer.gameMode.ID);

        // Replace functions
        gameServer.gameMode.packetLB = gm.packetLB;
        gameServer.gameMode.updateLB = gm.updateLB;
        console.log("\u001B[36mServer: \u001B[0mSuccessfully reset leaderboard");
    },
    change: function (gameServer, split) {
        var key = split[1];
        var value = split[2];

        // Check if int/float
        if (value.indexOf('.') != -1) {
            value = parseFloat(value);
        } else {
            value = parseInt(value);
        }

        if (typeof gameServer.config[key] != 'undefined') {
            gameServer.config[key] = value;
            console.log("Set " + key + " to " + value);
        } else {
            console.log("\u001B[36mServer: \u001B[0mInvalid config value");
        }
    },
    clear: function () {
        process.stdout.write("\u001b[2J\u001b[0;0H");
    },
    color: function (gameServer, split) {
        // Validation checks
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            console.log("\u001B[36mServer: \u001B[0mPlease specify a valid player ID!");
            return;
        }

        var color = {r: 0, g: 0, b: 0};
        color.r = Math.max(Math.min(parseInt(split[2]), 255), 0);
        color.g = Math.max(Math.min(parseInt(split[3]), 255), 0);
        color.b = Math.max(Math.min(parseInt(split[4]), 255), 0);

        // Sets color to the specified amount
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                client.setColor(color); // Set color
                for (var j in client.cells) {
                    client.cells[j].setColor(color);
                }
                break;
            }
        }
    },
    food: function (gameServer, split) {
        var pos = {x: parseInt(split[1]), y: parseInt(split[2])};
        var mass = parseInt(split[3]);

        // Make sure the input values are numbers
        if (isNaN(pos.x) || isNaN(pos.y)) {
            console.log("\u001B[36mServer: \u001B[0mInvalid coordinates");
            return;
        }

        if (isNaN(mass)) {
            mass = gameServer.config.foodStartMass;
        }

        // Spawn
        var f = new Entity.Food(gameServer.getNextNodeId(), null, pos, mass);
        f.setColor(gameServer.getRandomColor());
        gameServer.addNode(f);
        gameServer.currentFood++;
        console.log("\u001B[36mServer: \u001B[0mSpawned 1 food cell at (" + pos.x + " , " + pos.y + ")");
    },
    gamemode: function (gameServer, split) {
        try {
            var n = parseInt(split[1]);
            var gm = GameMode.get(n); // If there is an invalid gamemode, the function will exit
            gameServer.gameMode.onChange(gameServer); // Reverts the changes of the old gamemode
            gameServer.gameMode = gm; // Apply new gamemode
            gameServer.gameMode.onServerInit(gameServer); // Resets the server
            console.log("\u001B[36mServer: \u001B[0mChanged game mode to " + gameServer.gameMode.name);
        } catch (e) {
            console.log("\u001B[36mServer: \u001B[0mInvalid game mode selected");
        }
    },
    kick: function(gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            console.log("\u001B[36mServer: \u001B[0mPlease specify a valid player ID!");
            return;
        }

        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                var len = client.cells.length;
                for (var j = 0; j < len; j++) {
                    gameServer.removeNode(client.cells[0]);
                }
                client.socket.close();
                console.log("\u001B[36mServer: \u001B[0mKicked " + id);
                break;
            }
        }
    },
    kill: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            console.log("\u001B[36mServer: \u001B[0mPlease specify a valid player ID!");
            return;
        }

        var count = 0;
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                var len = client.cells.length;
                for (var j = 0; j < len; j++) {
                    gameServer.removeNode(client.cells[0]);
                    count++;
                }

                console.log("\u001B[36mServer: \u001B[0mRemoved " + count + " cells");
                break;
            }
        }
    },
    killall: function (gameServer, split) {
        var count = 0;
        var len = gameServer.nodesPlayer.length;
        for (var i = 0; i < len; i++) {
            gameServer.removeNode(gameServer.nodesPlayer[0]);
            count++;
        }
        console.log("\u001B[36mServer: \u001B[0mRemoved " + count + " cells");
    },
    mass: function (gameServer, split) {
        // Validation checks
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            console.log("\u001B[36mServer: \u001B[0mPlease specify a valid player ID!");
            return;
        }
        var amount = Math.max(parseInt(split[2]), 9);
        if (isNaN(amount)) {
            console.log("\u001B[36mServer: \u001B[0mPlease specify a valid number");
            return;
        }
        // Sets mass to the specified amount
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                for (var j in client.cells) {
                    client.cells[j].mass = amount;
                }

                console.log("\u001B[36mServer: \u001B[0mSet mass of " + client.name + " to " + amount);
                break;
            }
        }
    },
    merge: function (gameServer, split) {
        // Validation checks
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            console.log("\u001B[36mServer: \u001B[0mPlease specify a valid player ID!");
            return;
        }
        // Sets merge time
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                for (var j in client.cells) {
                    client.cells[j].calcMergeTime(-10000);
                }
                console.log("\u001B[36mServer: \u001B[0mForced " + client.name + " to merge cells");
                break;
            }
        }
    },
    split: function (gameServer, split) {
        // Validation checks
        var id = parseInt(split[1]);
        var count = parseInt(split[2]);
        if (isNaN(id)) {
            console.log("\u001B[36mServer: \u001B[0mPlease specify a valid player ID!");
            return;
        }
        if (isNaN(count)) {
            //Split into 16 cells
            count = 4;
        }

        // Split!
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                //Split
                for (var i = 0; i < count; i++) {
                    gameServer.splitCells(client);
                }
                console.log("\u001B[36mServer: \u001B[0mForced " + client.name + " to split cells");
                break;
            }
        }
    },
    name: function (gameServer, split) {
        // Validation checks
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            console.log("\u001B[36mServer: \u001B[0mPlease specify a valid player ID!");
            return;
        }
        var name = split[2];
        if (typeof name == 'undefined') {
            console.log("\u001B[36mServer: \u001B[0mPlease type a valid name");
            return;
        }
        // Change name
        for (var i = 0; i < gameServer.clients.length; i++) {
            var client = gameServer.clients[i].playerTracker;

            if (client.pID == id) {
                console.log("\u001B[36mServer: \u001B[0mChanging " + client.name + " to " + name);
                client.name = name;
                return;
            }
        }
        // Error
        console.log("\u001B[36mServer: \u001B[0mPlayer " + id + " was not found");
    },
    playerlist: function (gameServer, split) {
        var showall = false;
        if ((typeof split[1] != 'undefined') && (split[1].toLowerCase() == "all")) {
            showall = true;
        }
        console.log(" ID         | IP              | CELLS | SCORE  | POSITION     | LATENCY | NICK"); // Fill space
        console.log("----------------------------------------------------------------------------------------------");
        for (var i = 0; i < gameServer.clients.length; i++) {
            var client = gameServer.clients[i].playerTracker;

            // ID with 3 digits length
            var id = fillChar((client.pID), ' ', 10, false);

            // Get ip (15 digits length)
            var ip = "BOT";
            if (typeof gameServer.clients[i].remoteAddress != 'undefined') {
                ip = gameServer.clients[i].remoteAddress;
            }
            ip = fillChar(ip, ' ', 15);

            // Get name and data
            var nick = '', cells = '', score = '', position = '', data = '';
            if (client.disconnect >= 0 && showall) {
                var tmp = "(" + client.disconnect + "sec remaining) DISCONNECTED";
                data = fillChar(tmp, '-', ' | CELLS | SCORE  | POSITION    '.length + ( gameServer.config.playerMaxNickLength + 2 ), true);
                console.log("\u001B[31m " + id + " | " + ip + " | " + data + "\u001B[0m");
            }
            else if (client.spectate && showall) {
                if(client.freeMouse) {
                    try {
                        // Get spectated player
                        if (gameServer.getMode().specByLeaderboard) { // Get spec type
                            nick = gameServer.leaderboard[client.spectatedPlayer].name;
                        } else {
                            nick = gameServer.clients[client.spectatedPlayer].playerTracker.name;
                        }
                    } catch (e) {
                        // Specating nobody
                        nick = "";
                    }
                } else nick = "Free Roam Mode";

                nick = (nick == "") ? "No Player Selected" : nick;
                data = "-------------------------------SPECTATOR: " + nick;
                console.log("\u001B[33m " + id + " | " + ip + " | " + data + "\u001B[0m");
            } else if (client.cells.length > 0) {
                nick = (client.name == "") ? "No Player Selected" : client.name;
                cells = fillChar(client.cells.length, ' ', 5, true);
                score = fillChar(client.getScore(true), ' ', 6, true);
                position = fillChar(client.centerPos.x.toFixed(0), ' ', 5, true) + ', ' + fillChar(client.centerPos.y.toFixed(0), ' ', 5, true);
                var yemp = "-";
                if(client.pingssent > 0) {
                    yemp = client.pingssent + "ms";
                    if(client.pingssent > 999.9) {
                        yemp = "∞";
                    }
                }
                console.log(" " + id + " | " + ip + " | " + cells + " | " + score + " | " + position + " | " + fillChar(yemp, ' ', 7, true) + " |\u001B[36m " + nick + "\u001B[0m");
            } else if (showall) {
                // No cells = dead player or in-menu
                data = fillChar('DEAD OR NOT PLAYING', '-', ' | CELLS | SCORE  | POSITION    '.length + ( gameServer.config.playerMaxNickLength + 2 ), true);
                console.log("\u001B[33m " + id + " | " + ip + " | " + data + "\u001B[0m");
            }
        }
    },
    pause: function (gameServer, split) {
        if (gameServer.config.serverAutoPause == 0) {
            gameServer.run = !gameServer.run; // Switches the pause state
            var s = gameServer.run ? "Unpaused" : "Paused";
            console.log("\u001B[36mServer: \u001B[0m" + s + " the game.");
        }
        else
            console.log("\u001B[36mServer: \u001B[0mCan not use pause in auto pause mode");
    },
    reload: function (gameServer) {
        gameServer.loadConfig();
        console.log("\u001B[36mServer: \u001B[0mReloaded the config file successfully");
    },
    settings: function(gameServer) {
        var collom = 0,
            output = '';

        for (var setting in gameServer.config) {
            if ( collom == 0 ) {
                output = fillChar(setting, ' ', 22, false) + ': ' + fillChar(gameServer.config[setting], ' ', 12, false);
                collom = 1;
            }
            else if ( collom == 1 ) {
                output += ' ' + fillChar(setting, ' ', 22, false) + ': ' + fillChar(gameServer.config[setting], ' ', 12, false);
                console.log( output );
                collom = 0;
            }
        }
    },
    skin: function (gameServer, split) {
        // Validation checks
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            console.log("\u001B[36mServer: \u001B[0mPlease specify a valid player ID!");
            return;
        }
        var skin = split[2];
        if (typeof skin == 'undefined') {
            console.log("\u001B[36mServer: \u001B[0mPlease type a valid skin");
            return;
        }
        // Change name
        for (var i = 0; i < gameServer.clients.length; i++) {
            var client = gameServer.clients[i].playerTracker;

            if (client.pID == id) {
                console.log("\u001B[36mServer: \u001B[0mChanging " + client.name + " skin to " + skin);
                client.skin = skin;
                return;
            }
        }
        // Error
        console.log("\u001B[36mServer: \u001B[0mPlayer " + id + " was not found");
    },
    status: function (gameServer, split) {
        console.log("Connected players: " + gameServer.sinfo.players + "/" + gameServer.config.serverMaxConnections);
        console.log("Playing:    " + fillChar(gameServer.sinfo.humans, ' ', 5, true) + " | Connecting: " + fillChar((gameServer.sinfo.players - (gameServer.sinfo.humans + gameServer.sinfo.spectate + gameServer.sinfo.bots)), ' ', 5, true) + " | Spectator:  " + fillChar(gameServer.sinfo.spectate, ' ', 5, true) + " | Bot:        " + fillChar(gameServer.sinfo.bots, ' ', 5, true));
        console.log("-------------------------------------------------------------------------------");
        console.log("clients : " + fillChar(numberWithCommas(gameServer.clients.length), ' ', 27, true) + " | cells  :  " + fillChar(numberWithCommas(gameServer.nodesPlayer.length), ' ', 27, true));
        console.log("food    : " + fillChar(numberWithCommas(gameServer.nodes.length), ' ', 27, true) + " | moving :  " + fillChar(numberWithCommas(gameServer.movingNodes.length), ' ', 27, true));
        console.log("virus   : " + fillChar(numberWithCommas(gameServer.nodesVirus.length), ' ', 27, true) + " | leader :  " + fillChar(numberWithCommas(gameServer.leaderboard.length), ' ', 27, true));
        console.log("ejected : " + fillChar(numberWithCommas(gameServer.nodesEjected.length), ' ', 27, true) + " | banned :  " + fillChar(numberWithCommas(gameServer.banned.length), ' ', 27, true));
        console.log("-------------------------------------------------------------------------------");
        var used = (process.memoryUsage().heapUsed / 1024 ).toFixed(0);
        var total = (process.memoryUsage().heapTotal / 1024 ).toFixed(0);
        var rss = (process.memoryUsage().rss / 1024 ).toFixed(0);
        console.log("Current memory usage: " + numberWithCommas(rss) + " Kb ( Heap: " + numberWithCommas(used) + " / " + numberWithCommas(total) + " Kb )");
        console.log("Server has been running for " + seconds2time(process.uptime()));
        console.log("Current game mode: " + gameServer.gameMode.name);
    },
    tp: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            console.log("\u001B[36mServer: \u001B[0mPlease specify a valid player ID!");
            return;
        }

        // Make sure the input values are numbers
        var pos = {x: parseInt(split[2]), y: parseInt(split[3])};
        if (isNaN(pos.x) || isNaN(pos.y)) {
            console.log("\u001B[36mServer: \u001B[0mInvalid coordinates");
            return;
        }

        // Spawn
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                for (var j in client.cells) {
                    client.cells[j].position.x = pos.x;
                    client.cells[j].position.y = pos.y;
                }

                console.log("\u001B[36mServer: \u001B[0mTeleported " + client.name + " to (" + pos.x + " , " + pos.y + ")");
                break;
            }
        }
    },
    unban: function (gameServer, split) {
        var ip = split[1]; // Get ip
        var index = gameServer.banned.indexOf(ip);
        if (index > -1) {
            gameServer.banned.splice(index, 1);
            console.log("\u001B[36mServer: \u001B[0mUnbanned " + ip);
            if (gameServer.banned.length > 0) {
                fs.writeFileSync('./gameserver.ban', '');
            } else {
                fs.unlinkSync('./gameserver.ban');
            }
        } else {
            console.log("\u001B[36mServer: \u001B[0mThat IP is not banned");
        }
    },
    virus: function (gameServer, split) {
        var pos = {x: parseInt(split[1]), y: parseInt(split[2])};
        var mass = parseInt(split[3]);

        // Make sure the input values are numbers
        if (isNaN(pos.x) || isNaN(pos.y)) {
            console.log("\u001B[36mServer: \u001B[0mInvalid coordinates");
            return;
        }
        if (isNaN(mass)) {
            mass = gameServer.config.virusStartMass;
        }

        // Spawn
        var v = new Entity.Virus(gameServer.getNextNodeId(), null, pos, mass);
        gameServer.addNode(v);
        console.log("\u001B[36mServer: \u001B[0mSpawned 1 virus at (" + pos.x + " , " + pos.y + ")");
    },
    exit: function (gameServer, split) {
        gameServer.exitserver();
    },
    say: function (gameServer, split) {
        var message = "";
        for (var i = 1; i < split.length; i++) {
            message += split[i] + " ";
        }
        gameServer.SendMessage(message);
        console.log("\u001B[36mServer: \u001B[0m" + message);
    }
};
