// Imports
var GameMode = require('../gamemodes');
var Logger = require('./Logger');
var Entity = require('../entity');

function Commands() {
    this.list = {}; // Empty
}

module.exports = Commands;

// Commands
Commands.list = {
    help: function (gameServer, split) {
        console.log("                       ╭────────────────────────────╮                       ");
        console.log("                       │ LIST OF AVAILABLE COMMANDS │                       ");
        console.log("╭──────────────────────┴────────────────────────────┴──────────────────────╮");
        console.log("│                         ----Players and AI----                           │");
        console.log("│                                                                          │");
        console.log("│ playerlist                   │ Get list of players, bots, ID's, etc      │");
        console.log("│ minion [PlayerID] [#] [name] │ Adds suicide minions to the server        │");
        console.log("│ addbot [number]              │ Adds bots to the server                   │");
        console.log("│ kickbot [number]             │ Kick a number of bots                     │");
        console.log("│ kick [PlayerID]              │ Kick player or bot by client ID           │");
        console.log("│ kickall                      │ Kick all players and bots                 │");
        console.log("│ kill [PlayerID]              │ Kill cell(s) by client ID                 │");
        console.log("│ killall                      │ Kill everyone                             │");
        console.log("│                                                                          │");
        console.log("│                          ----Player Commands----                         │");
        console.log("│                                                                          │");
        console.log("│ spawn [entity] [pos] [mass]  | Spawns an entity                          │");
        console.log("│ mass [PlayerID] [mass]       │ Set cell(s) mass by client ID             │");
        console.log("│ merge [PlayerID]             │ Merge all client's cells                  │");
        console.log("│ spawnmass [PlayerID] [mass]  │ Sets a players spawn mass                 │");
        console.log("│ freeze [PlayerID]            │ Freezes a player                          │");
        console.log("│ speed [PlayerID]             │ Sets a players base speed                 │");
        console.log("│ color [PlayerID] [R] [G] [B] │ Set cell(s) color by client ID            │");
        console.log("│ name [PlayerID] [name]       │ Change cell(s) name by client ID          │");
        console.log("│ skin [PlayerID] [string]     | Change cell(s) skin by client ID          │");
        console.log("│ rec [PlayerID]               │ Gives a player instant-recombine          │");
        console.log("│ split [PlayerID] [Amount]    | Forces a player to split                  │");
        console.log("│ tp [X] [Y]                   | Teleports player(s) to XY coordinates     │");
        console.log("│ replace [PlayerID] [entity]  | Replaces a player with an entity          │");
        console.log("│ pop [PlayerID]               | Pops a player with a virus                │");
        console.log("│ play [PlayerID]              | Disable/enables a player from spawning    │");
        console.log("│                                                                          │");
        console.log("│                          ----Server Commands----                         │");
        console.log("│                                                                          │");
        console.log("│ pause                        │ Pause game, freeze all nodes              │");
        console.log("│ board [string] [string] ...  │ Set scoreboard text                       │");
        console.log("│ change [setting] [value]     │ Change specified settings                 │");
        console.log("│ reload                       │ Reload config file and banlist            │");
        console.log("│ ban [PlayerID | IP]          │ Bans a player(s) IP                       │");
        console.log("│ unban [IP]                   │ Unbans an IP                              │");
        console.log("│ banlist                      │ Get list of banned IPs.                   │");
        console.log("│ mute [PlayerID]              │ Mute player from chat                     │");
        console.log("│ unmute [PlayerID]            │ Unmute player from chat                   │");
        console.log("│                                                                          │");
        console.log("│                          ----Miscellaneous----                           │");
        console.log("│                                                                          │");
        console.log("│ clear                        │ Clear console output                      │");
        console.log("│ reset                        | Removes all nodes                         │");
        console.log("│ status                       │ Get server status                         │");
        console.log("│ debug                        | Get/check node lengths                    │");
        console.log("│ exit                         │ Stop the server                           │");
        console.log("│                                                                          │");
        console.log("├──────────────────────────────────────────────────────────────────────────┤");
        console.log('│         Psst! Do "shortcuts" for a list of command shortcuts!            │');
        console.log("╰──────────────────────────────────────────────────────────────────────────╯");
    },
    shortcuts: function (gameServer, split) {
        console.log("                       ╭────────────────────────────╮                       ");
        console.log("                       │ LIST OF COMMAND SHORTCUTS  │                       ");
        console.log("╭──────────────────────┴──────┬─────────────────────┴──────────────────────╮");
        console.log("│ st                          │ Alias for status                           │");
        console.log("│ pl                          │ Alias for playerlist                       │");
        console.log("│ m                           │ Alias for mass                             │");
        console.log("│ sm                          │ Alias for spawnmass                        │");
        console.log("│ ka                          │ Alias for killall                          │");
        console.log("│ k                           │ Alias for kill                             │");
        console.log("│ mg                          │ Alias for merge                            │");
        console.log("│ s                           │ Alias for speed                            │");
        console.log("│ mn                          | Alias for minion                           │");
        console.log("│ f                           | Alias for freeze                           │");
        console.log("│ ab                          | Alias for addbot                           │");
        console.log("│ kb                          | Alias for kickbot                          │");
        console.log("│ c                           | Alias for change                           │");
        console.log("│ n                           | Alias for name                             │");
        console.log("│ rep                         | Alias for replace                          │");
        console.log("╰─────────────────────────────┴────────────────────────────────────────────╯");
    },
    debug: function (gameServer, split) {
        // Count client cells
        var clientCells = 0;
        for (var i in gameServer.clients) {
            clientCells += gameServer.clients[i].playerTracker.cells.length;
        }
        // Output node information
        relayconsole(gameServer,0,"Clients:        " + gameServer.fillChar(gameServer.numberWithCommas(gameServer.clients.length), " ", 6, true) + " / " + gameServer.numberWithCommas(gameServer.config.serverMaxConnections) + " + bots");
        relayconsole(gameServer,0,"Total nodes:    " + gameServer.fillChar(gameServer.numberWithCommas(gameServer.nodes.length), " ", 6, true));
        relayconsole(gameServer,0,"- Client cells: " + gameServer.fillChar(gameServer.numberWithCommas(clientCells), " ", 6, true) + " / " + gameServer.numberWithCommas(gameServer.clients.length * gameServer.config.playerMaxCells));
        relayconsole(gameServer,0,"- Ejected cells:" + gameServer.fillChar(gameServer.numberWithCommas(gameServer.nodesEjected.length), " ", 6, true));
        relayconsole(gameServer,0,"- Food:         " + gameServer.fillChar(gameServer.numberWithCommas(gameServer.currentFood), " ", 6, true) + " / " + gameServer.numberWithCommas(gameServer.config.foodMaxAmount));
        relayconsole(gameServer,0,"- Viruses:      " + gameServer.fillChar(gameServer.numberWithCommas(gameServer.nodesVirus.length), " ", 6, true) + " / " + gameServer.numberWithCommas(gameServer.config.virusMaxAmount));
        relayconsole(gameServer,0,"Moving nodes:   " + gameServer.fillChar(gameServer.numberWithCommas(gameServer.movingNodes.length), " ", 6, true));
        relayconsole(gameServer,0,"Quad nodes:     " + gameServer.fillChar(gameServer.numberWithCommas(gameServer.quadTree.scanNodeCount()), " ", 6, true));
        relayconsole(gameServer,0,"Quad items:     " + gameServer.fillChar(gameServer.numberWithCommas(gameServer.quadTree.scanItemCount()), " ", 6, true));
    },
    reset: function (gameServer, split) {
        relayconsole(gameServer,1,"Removed " + gameServer.nodes.length + " nodes");
        while (gameServer.nodes.length > 0) {
            gameServer.removeNode(gameServer.nodes[0]);
        }
        // just to make sure the jobs done
        while (gameServer.nodesEjected.length > 0) {
            gameServer.removeNode(gameServer.nodesEjected[0]);
        }
        while (gameServer.nodesVirus.length > 0) {
            gameServer.removeNode(gameServer.nodesVirus[0]);
        }
        Commands.list.killall(gameServer, split);
    },
    minion: function(gameServer, split) {
        var id = parseInt(split[1]);
        var add = parseInt(split[2]);
        var name = split.slice(3, split.length).join(' ');

        // Error! ID is NaN
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player id!");
            return;
        }

        // Find ID specified and add/remove minions for them
        for (var i in gameServer.clients) {
            var client = gameServer.clients[i].playerTracker;

            if (client.pID == id) {
                // Remove minions
                if (client.minionControl == true && isNaN(add)) {
                    client.minionControl = false;
                    client.miQ = 0;
                    relayconsole(gameServer,0,"Succesfully removed minions for " + client.getFriendlyName());
                // Add minions
                } else {
                    client.minionControl = true;
                    // Add minions for client
                    if (isNaN(add)) add = 1; 
                    for (var i = 0; i < add; i++) {
                        gameServer.bots.addMinion(client, name);
                    }
                    relayconsole(gameServer,0,"Added " + add + " minions for " + client.getFriendlyName());
                }
                break;
            }
        }
    },
    addbot: function (gameServer, split) {
        var add = parseInt(split[1]);
        if (isNaN(add)) {
            add = 1; // Adds 1 bot if user doesnt specify a number
        }

        for (var i = 0; i < add; i++) {
            gameServer.bots.addBot();
        }
        relayconsole(gameServer,0,"Added " + add + " player bots");
    },
    ban: function (gameServer, split) {
        // Error message
        var logInvalid = "Please specify a valid player ID or IP address!";

        if (split[1] == null) {
            // If no input is given; added to avoid error
            relayconsole(gameServer,1,logInvalid);
            return;
        }

        if (split[1].indexOf(".") >= 0) {
            // If input is an IP address
            var ip = split[1];
            var ipParts = ip.split(".");

            // Check for invalid decimal numbers of the IP address
            for (var i in ipParts) {
                if (i > 1 && ipParts[i] == "*") {
                    // mask for sub-net
                    continue;
                }
                // If not numerical or if it's not between 0 and 255
                // TODO: Catch string "e" as it means "10^".
                if (isNaN(ipParts[i]) || ipParts[i] < 0 || ipParts[i] >= 256) {
                    relayconsole(gameServer,1,logInvalid);
                    return;
                }
            }

            if (ipParts.length != 4) {
                // an IP without 3 decimals
                relayconsole(gameServer,1,logInvalid);
                return;
            }
            ban(gameServer, split, ip);
            return;
        }
        // if input is a Player ID
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            // If not numerical
            relayconsole(gameServer,1,logInvalid);
            return;
        }
        ip = null;
        for (var i in gameServer.clients) {
            var client = gameServer.clients[i];
            if (client == null || !client.isConnected)
                continue;
            if (client.playerTracker.pID == id) {
                ip = client._socket.remoteAddress;
                break;
            }
        }
        if (ip) ban(gameServer, split, ip);
        else relayconsole(gameServer,1,"Player ID " + id + " not found!");
    },
    banlist: function (gameServer, split) {
        relayconsole(gameServer,0,"Showing " + gameServer.ipBanList.length + " banned IPs: ");
        relayconsole(gameServer,0," IP              | IP ");
        relayconsole(gameServer,0,"-----------------------------------");
        for (var i = 0; i < gameServer.ipBanList.length; i += 2) {
            relayconsole(gameServer,0," " + gameServer.fillChar(gameServer.ipBanList[i], " ", 15) + " | " 
                    + (gameServer.ipBanList.length === i + 1 ? "" : gameServer.ipBanList[i + 1])
            );
        }
    },
    kickbot: function (gameServer, split) {
        var toRemove = parseInt(split[1]);
        if (isNaN(toRemove)) {
            toRemove = -1; // Kick all bots if user doesnt specify a number
        }
        if (toRemove < 1) {
            relayconsole(gameServer,1,"Invalid argument!");
            return;
        }
        var removed = 0;
        for (var i = 0; i < gameServer.clients.length; i++) {
            var socket = gameServer.clients[i];
            if (socket.isConnected != null) continue;
            socket.close();
            removed++;
            if (removed >= toRemove)
                break;
        }
        if (removed == 0)
            relayconsole(gameServer,1,"Cannot find any bots");
        else if (toRemove == removed)
            relayconsole(gameServer,1,"Kicked " + removed + " bots");
        else
            relayconsole(gameServer,1,"Only " + removed + " bots were kicked");
    },
    board: function (gameServer, split) {
        var newLB = [], reset = split[1];
        for (var i = 1; i < split.length; i++) {
            if (split[i]) {
                newLB[i - 1] = split[i];
            } else {
                newLB[i - 1] = " ";
            }
        }

        // Clears the update leaderboard function and replaces it with our own
        gameServer.gameMode.packetLB = 48;
        gameServer.gameMode.specByLeaderboard = false;
        gameServer.gameMode.updateLB = function (gameServer) {
            gameServer.leaderboard = newLB;
            gameServer.leaderboardType = 48;
        };
        if (reset != "reset") {
            relayconsole(gameServer,0,"Successfully changed leaderboard values");
            relayconsole(gameServer,0,'Do "board reset" to reset leaderboard');
        }
        if (reset == "reset") {
            // Gets the current gamemode
            var gm = GameMode.get(gameServer.gameMode.ID);

            // Replace functions
            gameServer.gameMode.packetLB = gm.packetLB;
            gameServer.gameMode.updateLB = gm.updateLB;
            relayconsole(gameServer,0,"Successfully reset leaderboard");
        }
    },
    change: function (gameServer, split) {
        if (split.length < 3) {
            relayconsole(gameServer,1,"Invalid command arguments");
            return;
        }
        var key = split[1];
        var value = split[2];

        // Check if int/float
        if (value.indexOf('.') != -1) {
            value = parseFloat(value);
        } else {
            value = parseInt(value);
        }

        if (value == null || isNaN(value)) {
            relayconsole(gameServer,1,"Invalid value: " + value);
            return;
        }
        if (!gameServer.config.hasOwnProperty(key)) {
            relayconsole(gameServer,1,"Unknown config value: " + key);
            return;
        }
        gameServer.config[key] = value;

        // update/validate
        gameServer.config.playerMinSize = Math.max(32, gameServer.config.playerMinSize);
        Logger.setVerbosity(gameServer.config.logVerbosity);
        Logger.setFileVerbosity(gameServer.config.logFileVerbosity);
        relayconsole(gameServer,0,"Set " + key + " = " + gameServer.config[key]);
    },
    settings: function(gameServer) {
        var collom = 0,
            output = '';

        for (var setting in gameServer.config) {
            if ( gameServer.config[setting].length > 12 && collom == 0) {
                output = gameServer.fillChar(setting, ' ', 22, false) + ': ' + gameServer.config[setting];
                relayconsole(gameServer,0,output);
                output = '';
                collom = 0;
            }
            else if ( collom == 0 ) {
                output = gameServer.fillChar(setting, ' ', 22, false) + ': ' + gameServer.fillChar(gameServer.config[setting], ' ', 12, false);
                collom = 1;
            }
            else if ( collom == 1 ) {
                output += ' ' + gameServer.fillChar(setting, ' ', 22, false) + ': ' + gameServer.fillChar(gameServer.config[setting], ' ', 12, false);
                relayconsole(gameServer,0,output);
                collom = 0;
            }
        }
    },
    clear: function () {
        process.stdout.write("\u001b[2J\u001b[0;0H");
    },
    color: function (gameServer, split) {
        // Validation checks
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }

        var color = {
            r: Math.max(Math.min(parseInt(split[2]), 255), 0),
            g: Math.max(Math.min(parseInt(split[3]), 255), 0),
            b: Math.max(Math.min(parseInt(split[4]), 255), 0)
        };

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
    exit: function (gameServer, split) {
        gameServer.exitserver();
    },
    kick: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        // kick player
        var count = 0;
        gameServer.clients.forEach(function (socket) {
            if (socket.isConnected == false)
               return;
            if (id != 0 && socket.playerTracker.pID != id)
                return;
            // remove player cells
            Commands.list.kill(gameServer, split);
            // disconnect
            socket.close(1000, "Kicked from server");
            var name = socket.playerTracker.getFriendlyName();
            relayconsole(gameServer,0,"Kicked \"" + name + "\"");
            gameServer.sendChatMessage(null, null, "Kicked \"" + name + "\""); // notify to don't confuse with server bug
            count++;
        }, this);
        if (count > 0) return;
        if (id == 0)
            relayconsole(gameServer,1,"No players to kick!");
        else
            relayconsole(gameServer,1,"Player with ID " + id + " not found!");
    },
    mute: function (gameServer, args) {
        if (!args || args.length < 2) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        var id = parseInt(args[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        var player = playerById(id, gameServer);
        if (player == null) {
            relayconsole(gameServer,1,"Player with id=" + id + " not found!");
            return;
        }
        if (player.isMuted) {
            relayconsole(gameServer,1,"Player with id=" + id + " already muted!");
            return;
        }
        relayconsole(gameServer,0,"Player \"" + player.getFriendlyName() + "\" was muted");
        player.isMuted = true;
    },
    unmute: function (gameServer, args) {
        if (!args || args.length < 2) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        var id = parseInt(args[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        var player = playerById(id, gameServer);
        if (player == null) {
            relayconsole(gameServer,1,"Player with id=" + id + " not found!");
            return;
        }
        if (!player.isMuted) {
            relayconsole(gameServer,1,"Player with id=" + id + " already not muted!");
            return;
        }
        relayconsole(gameServer,0,"Player \"" + player.getFriendlyName() + "\" was unmuted");
        player.isMuted = false;
    },
    kickall: function (gameServer, split) {
        this.id = 0; //kick ALL players
        // kick player
        var count = 0;
        gameServer.clients.forEach(function (socket) {
            if (socket.isConnected == false)
               return;
            if (this.id != 0 && socket.playerTracker.pID != this.id)
                return;
            // remove player cells
            Commands.list.killall(gameServer, split);
            // disconnect
            socket.close(1000, "Kicked from server");
            var name = socket.playerTracker.getFriendlyName();
            relayconsole(gameServer,0,"Kicked \"" + name + "\"");
            gameServer.sendChatMessage(null, null, "Kicked \"" + name + "\""); // notify to don't confuse with server bug
            count++;
        }, this);
        if (count > 0) return;
        if (this.id == 0)
            relayconsole(gameServer,1,"No players to kick!");
        else
            relayconsole(gameServer,1,"Player with ID " + this.id + " not found!");
    },
    kill: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
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
                client.resetstats();
                relayconsole(gameServer,0,"Killed " + client.getFriendlyName() + " and removed " + count + " cells");
                break;
            }
        }
    },
    killall: function (gameServer, split) {
        var count = 0;
        for (var i = 0; i < gameServer.clients.length; i++) {
            var playerTracker = gameServer.clients[i].playerTracker;
            while (playerTracker.cells.length > 0) {
                gameServer.removeNode(playerTracker.cells[0]);
                count++;
            }
            playerTracker.resetstats();
        }
        if (this.id) relayconsole(gameServer,0,"Removed " + count + " cells");
    },
    mass: function (gameServer, split) {
        // Validation checks
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        var amount = parseInt(split[2]);
        if (isNaN(amount)) {
            relayconsole(gameServer,1,"Please specify a valid number");
            return;
        }
        var size = Math.sqrt(amount * 100);

        // Sets mass to the specified amount
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                for (var j in client.cells) {
                    client.cells[j].setSize(size);
                }
                relayconsole(gameServer,0,"Set mass of " + client.getFriendlyName() + " to " + (size * size / 100).toFixed(3));
                break;
            }
        }
    },
    spawnmass: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }

        var amount = Math.max(parseInt(split[2]), 9);
        var size = Math.sqrt(amount * 100);
        if (isNaN(amount)) {
            relayconsole(gameServer,1,"Please specify a valid mass!");
            return;
        }

        // Sets spawnmass to the specified amount
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                client.spawnmass = size;
                relayconsole(gameServer,0,"Set spawnmass of "+ client.getFriendlyName() + " to " + (size * size / 100).toFixed(3));
            }
        }
    },
    speed: function (gameServer, split) {
        var id = parseInt(split[1]);
        var speed = parseInt(split[2]);
        if (isNaN(id)) {
            relayconsole(gameServer,0,"Please specify a valid player ID!");
            return;
        }

        if (isNaN(speed)) {
            relayconsole(gameServer,0,"Please specify a valid speed!");
            return;
        }

        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                client.customspeed = speed;
                // override getSpeed function from PlayerCell
                Entity.PlayerCell.prototype.getSpeed = function () {
                    var speed = 2.1106 / Math.pow(this._size, 0.449);
                    // tickStep = 40ms
                    this._speed = (this.owner.customspeed > 0) ? 
                    speed * 40 * this.owner.customspeed : // Set by command
                    speed * 40 * this.gameServer.config.playerSpeed;
                    return this._speed;
                };
            }
        }
        relayconsole(gameServer,0,"Set base speed of "+ client.getFriendlyName() + " to " + speed);
    },
    merge: function (gameServer, split) {
        // Validation checks
        var id = parseInt(split[1]);
        var set = split[2];
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }

        // Find client with same ID as player entered
        var client;
        for (var i = 0; i < gameServer.clients.length; i++) {
            if (id == gameServer.clients[i].playerTracker.pID) {
                client = gameServer.clients[i].playerTracker;
                break;
            }
        }

        if (!client) {
            relayconsole(gameServer,1,"Client is nonexistent!");
            return;
        }

        if (client.cells.length == 1) {
            relayconsole(gameServer,1,"Client already has one cell!");
            return;
        }

        // Set client's merge override
        var state;
        if (set == "true") {
            client.mergeOverride = true;
            client.mergeOverrideDuration = 100;
            state = true;
        } else if (set == "false") {
            client.mergeOverride = false;
            client.mergeOverrideDuration = 0;
            state = false;
        } else {
            if (client.mergeOverride) {
                client.mergeOverride = false;
                client.mergeOverrideDuration = 0;
            } else {
                client.mergeOverride = true;
                client.mergeOverrideDuration = 100;
            }
            state = client.mergeOverride;
        }
        if (state) relayconsole(gameServer,0,client.getFriendlyName() + " is now force merging");
        else relayconsole(gameServer,0,client.getFriendlyName() + " isn't force merging anymore");
    },
    rec: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }

        // set rec for client
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                client.rec = !client.rec;
                if (client.rec) relayconsole(gameServer,0,client.getFriendlyName() + " is now in rec mode!");
                else relayconsole(gameServer,0,client.getFriendlyName() + " is no longer in rec mode");
            }
        }
    },
    split: function (gameServer, split) {
        var id = parseInt(split[1]);
        var count = parseInt(split[2]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        if (isNaN(count)) {
            relayconsole(gameServer,0,"Split player 4 times");
            count = 4;
        }
        if (count > gameServer.config.playerMaxCells) {
            relayconsole(gameServer,0,"Split player to playerMaxCells");
            count = gameServer.config.playerMaxCells;
        }
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                for (var i = 0; i < count; i++) {
                    gameServer.splitCells(client);
                }
                relayconsole(gameServer,0,"Forced " + client.getFriendlyName() + " to split " + count + " times");
                break;
            }
        }
    },
    playerinfo: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        var foundplayer = false;
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                if(client._name) {
                    var socket = gameServer.clients[i];
                    var time = +new Date;
                    var playtime = (time - client.connectedTime) / 1000 >> 0;
                    relayconsole(gameServer,0,"Player ID:" + id + " (" + client._name + ") bin connected for " + gameServer.seconds2time(playtime));
                    if(!client.spectate) {
                        playtime = (time - client.stats.playstart) / 1000 >> 0;
                        relayconsole(gameServer,0,"-----------------------------------------------------");
                        relayconsole(gameServer,0,"Bin playing for " + gameServer.seconds2time(playtime));
                        relayconsole(gameServer,0,"Current Score : " + (client._score / 100 >> 0) + " (Highest was: " + (client.stats.score / 100 >> 0) + ")");
                        relayconsole(gameServer,0,"-----------------------------------------------------");
                        relayconsole(gameServer,0,"ate food     : " + client.stats.foodeat + " cells");
                        relayconsole(gameServer,0,"    players  : " + client.stats.playereat + " cells");
                        relayconsole(gameServer,0,"    virus    : " + client.stats.viruseat + " cells");
                        relayconsole(gameServer,0,"    surprice : " + client.stats.surpeat + " cells");
                        relayconsole(gameServer,0,"spawned      : " + client.spawnCounter + " times");
                        relayconsole(gameServer,0,"-----------------------------------------------------");
                    } else relayconsole(gameServer,0,"Currently spectating");

                    if (socket.isConnected) {
                        relayconsole(gameServer,0,"Connected trough " + socket.remoteAddress + " from " + client.origen);
                        relayconsole(gameServer,0,"Using protocol " + socket.packetHandler.protocol);
                    } else relayconsole(gameServer,0,"This is a Local BOT or disconnected player");

                } else relayconsole(gameServer,0,"Player ID:" + id + " has no playerinfo yet");
                foundplayer = true;
                break;
            }
        }
        if(!foundplayer) relayconsole(gameServer,0,"Player ID:" + id + " was not found in the playerlist");
    },
    name: function (gameServer, split) {
        // Validation checks
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }

        var name = split.slice(2, split.length).join(' ');
        if (typeof name == 'undefined') {
            relayconsole(gameServer,1,"Please type a valid name");
            return;
        }

        // Change name
        for (var i = 0; i < gameServer.clients.length; i++) {
            var client = gameServer.clients[i].playerTracker;

            if (client.pID == id) {
                relayconsole(gameServer,0,"Changing " + client.getFriendlyName() + " to " + name);
                client.setName(name);
                return;
            }
        }

        // Error
        relayconsole(gameServer,1,"Player " + id + " was not found");
    },
    skin: function (gameServer, args) {
        if (!args || args.length < 3) {
            relayconsole(gameServer,1,"Please specify a valid player ID and skin name!");
            return;
        }
        var id = parseInt(args[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        var skin = args[2].trim();
        if (!skin) {
            relayconsole(gameServer,1,"Please specify skin name!");
        }
        var player = playerById(id, gameServer);
        if (player == null) {
            relayconsole(gameServer,1,"Player with id=" + id + " not found!");
            return;
        }
        if (player.cells.length > 0) {
            relayconsole(gameServer,1,"Player is alive, skin will not be applied to existing cells");
        }
        relayconsole(gameServer,0,"Player \"" + player.getFriendlyName() + "\"'s skin is changed to " + skin);
        player.setSkin(skin);
    },
    unban: function (gameServer, split) {
        if (split.length < 2 || split[1] == null || split[1].trim().length < 1) {
            relayconsole(gameServer,1,"Please specify a valid IP!");
            return;
        }
        var ip = split[1].trim();
        var index = gameServer.ipBanList.indexOf(ip);
        if (index < 0) {
            relayconsole(gameServer,1,"IP " + ip + " is not in the ban list!");
            return;
        }
        gameServer.ipBanList.splice(index, 1);
        saveIpBanList(gameServer);
        relayconsole(gameServer,0,"Unbanned IP: " + ip);
    },
    playerlist: function (gameServer, split) {
        relayconsole(gameServer,0,"Current players: " + gameServer.clients.length);
        relayconsole(gameServer,0,'Do "playerlist m" or "pl m" to list minions');
        relayconsole(gameServer,0," ID     | IP              | P | " + gameServer.fillChar('NICK', ' ', gameServer.config.playerMaxNickLength) + " | CELLS | SCORE  | POSITION    "); // Fill space
        relayconsole(gameServer,0,gameServer.fillChar('', '-', ' ID     | IP              |   |  | CELLS | SCORE  | POSITION      '.length + gameServer.config.playerMaxNickLength));
        var sockets = gameServer.clients.slice(0);
        sockets.sort(function (a, b) { return a.playerTracker.pID - b.playerTracker.pID; });
        for (var i = 0; i < sockets.length; i++) {
            var socket = sockets[i];
            var client = socket.playerTracker;
            var ip = (client.isMi) ? "[MINION]" : "[BOT]";
            var type = split[1];

            // list minions
            if (client.isMi) {
                if (typeof type == "undefined" || type == "" || type != "m") {
                    continue;
                } else if (type == "m") {
                    ip = "[MINION]";
                }
            }

            var id = gameServer.fillChar((client.pID), ' ', 6, true);

            // Get ip (15 digits length)
            var ip = gameServer.fillChar("[BOT]", ' ', 15);
            if (socket.isConnected != null) {
                ip = gameServer.fillChar(socket.remoteAddress, ' ', 15);
                if(socket.upgradeReq.headers.origin == 'http://' + gameServer.config.serverURL) ip = "\u001B[32m" + gameServer.fillChar(ip, ' ', 15) + "\u001B[0m";
            }

            var protocol = gameServer.clients[i].packetHandler.protocol;
            if (protocol == null)
                protocol = "?"
            if (client.MiniMap) protocol = "\u001B[31m" + protocol + "\u001B[0m";
            // Get name and data
            var nick = '',
                cells = '',
                score = '',
                position = '',
                data = '';
            if (socket.closeReason != null) {
                // Disconnected
                var reason = "[DISCONNECTED] ";
                if (socket.closeReason.code)
                    reason += "[" + socket.closeReason.code + "] ";
                if (socket.closeReason.message)
                    reason += socket.closeReason.message;
                relayconsole(gameServer,0," " + id + " | " + ip + " | " + protocol + " | " + reason);
            } else if (!socket.packetHandler.protocol && socket.isConnected) {
                relayconsole(gameServer,0," " + id + " | " + ip + " | " + protocol + " | " + "[CONNECTING]");
            } else if (client.spectate) {
                nick = "in free-roam";
                if (!client.freeRoam) {
                    var target = client.getSpectateTarget();
                    if (target != null) {
                        nick = target.getFriendlyName();
                    }
                }
                data = gameServer.fillChar("SPECTATING: " + nick, '-', ' | CELLS | SCORE  | POSITION      '.length + gameServer.config.playerMaxNickLength, true);
                relayconsole(gameServer,0," " + id + " | " + ip + " | " + protocol + " | " + data);
            } else if (client.cells.length > 0) {
                nick = gameServer.fillChar(client.getFriendlyName(), ' ', gameServer.config.playerMaxNickLength);
                cells = gameServer.fillChar(client.cells.length, ' ', 5, true);
                score = gameServer.fillChar((client.getScore() / 100) >> 0, ' ', 6, true);
                position = gameServer.fillChar(client.centerPos.x >> 0, ' ', 6, true) + ', ' + gameServer.fillChar(client.centerPos.y >> 0, ' ', 6, true);
                relayconsole(gameServer,0," " + id + " | " + ip + " | " + protocol + " | " + nick + " | " + cells + " | " + score + " | " + position);
            } else {
                // No cells = dead player or in-menu
                data = gameServer.fillChar('DEAD OR NOT PLAYING', '-', ' | CELLS | SCORE  | POSITION      '.length + gameServer.config.playerMaxNickLength, true);
                relayconsole(gameServer,0," " + id + " | " + ip + " | " + protocol + " | " + data);
            }
        }
    },
    pause: function (gameServer, split) {
        gameServer.run = !gameServer.run; // Switches the pause state
        var s = gameServer.run ? "Unpaused" : "Paused";
        relayconsole(gameServer,0,s + " the game.");
    },
    freeze: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,0,"Please specify a valid player ID!");
            return;
        }

        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                client.frozen = !client.frozen;
                if (client.frozen) {
                    relayconsole(gameServer,0,"Froze " + client.getFriendlyName());
                } else {
                    relayconsole(gameServer,0,"Unfroze " + client.getFriendlyName());
                }
                break;
            }
        }
    },
    reload: function (gameServer, split) {
        gameServer.loadConfig();
        gameServer.loadIpBanList();
        relayconsole(gameServer,0,"Reloaded the config file succesully");
    },
    status: function (gameServer, split) {
        var rss = parseInt((process.memoryUsage().rss / 1024 ).toFixed(0));
        if (rss > this.mempeek) {
            gameServer.mempeek = rss;
        }
        relayconsole(gameServer,0,"Connected players: " + gameServer.sinfo.players + "/" + gameServer.config.serverMaxConnections);
        relayconsole(gameServer,0,"Players: " + gameServer.sinfo.humans + " - Bots: " + gameServer.sinfo.bots);
        relayconsole(gameServer,0,"Server has been running for " + Math.floor(process.uptime() / 60) + " minutes");
        relayconsole(gameServer,0,"Current memory usage: " + gameServer.numberWithCommas(rss) + 'Kb (Peek: ' + gameServer.numberWithCommas(gameServer.mempeek) + 'Kb)');
        relayconsole(gameServer,0,"Current game mode: " + gameServer.gameMode.name);
        relayconsole(gameServer,0,"Current update time: " + gameServer.updateTimeAvg.toFixed(3) + " [ms]  (" + getLagMessage(gameServer.updateTimeAvg) + ")");
    },
    tp: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }

        // Make sure the input values are numbers
        var pos = {
            x: parseInt(split[2]),
            y: parseInt(split[3])
        };
        if (isNaN(pos.x) || isNaN(pos.y)) {
            relayconsole(gameServer,1,"Invalid coordinates");
            return;
        }

        // Spawn
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                for (var j in client.cells) {
                    client.cells[j].setPosition(pos);
                    gameServer.updateNodeQuad(client.cells[j]);
                }

                relayconsole(gameServer,0,"Teleported " + client.getFriendlyName() + " to (" + pos.x + " , " + pos.y + ")");
                break;
            }
        }
    },
    spawn: function (gameServer, split) {
        var ent = split[1];
        if (typeof ent == "undefined" || ent == "" || (ent != "virus" && ent != "food" && ent != "mothercell")) {
            relayconsole(gameServer,1,"Please specify either virus, food, or mothercell");
        }

        var pos = {
            x: parseInt(split[2]),
            y: parseInt(split[3])
        };
        var mass = parseInt(split[4]);

        // Make sure the input values are numbers
        if (isNaN(pos.x) || isNaN(pos.y)) {
            relayconsole(gameServer,1,"Invalid coordinates");
            return;
        }

        // Start size for each entity 
        if (ent == "virus") {
            var size = gameServer.config.virusMinSize;
        } else if (ent == "mothercell") {
            size = gameServer.config.virusMinSize * 2.5;
        } else if (ent == "food") {
            size = gameServer.config.foodMinMass;
        }

        if (!isNaN(mass)) {
            size = Math.sqrt(mass * 100);
        }

        // Spawn for each entity
        if (ent == "virus") {
            var virus = new Entity.Virus(gameServer, null, pos, size);
            gameServer.addNode(virus);
            relayconsole(gameServer,0,"Spawned 1 virus at (" + pos.x + " , " + pos.y + ")");
        } else if (ent == "food") {
            var food = new Entity.Food(gameServer, null, pos, size);
            food.setColor(gameServer.getRandomColor());
            gameServer.addNode(food);
            relayconsole(gameServer,0,"Spawned 1 food cell at (" + pos.x + " , " + pos.y + ")");
        } else if (ent == "mothercell") {
            var mother = new Entity.MotherCell(gameServer, null, pos, size);
            gameServer.addNode(mother);
            relayconsole(gameServer,0,"Spawned 1 mothercell at (" + pos.x + " , " + pos.y + ")");
        }
    },
    replace: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        var ent = split[2];
        if (typeof ent == "undefined" || ent == "" || (ent != "virus" && ent != "food" && ent != "mothercell")) {
            relayconsole(gameServer,1,"Please specify either virus, food, or mothercell");
        }
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                while (client.cells.length > 0) {
                    var cell = client.cells[0];
                    gameServer.removeNode(cell);
                    // replace player with entity
                    if (ent == "virus") {
                        var virus = new Entity.Virus(gameServer, null, cell.position, cell._size);
                        gameServer.addNode(virus);
                        relayconsole(gameServer,0,"Replaced " + client.getFriendlyName() + " with a virus");
                    } else if (ent == "food") {
                        var food = new Entity.Food(gameServer, null, cell.position, cell._size);
                        food.setColor(gameServer.getRandomColor());
                        gameServer.addNode(food);
                        relayconsole(gameServer,0,"Replaced " + client.getFriendlyName() + " with a food cell");
                    } else if (ent == "mothercell") {
                        var mother = new Entity.MotherCell(gameServer, null, cell.position, cell._size);
                        gameServer.addNode(mother);
                        relayconsole(gameServer,0,"Replaced " + client.getFriendlyName() + " with a mothercell");
                    }
                }
            }
        }
    },
    pop: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                var virus = new Entity.Virus(gameServer, null, client.centerPos, gameServer.config.virusMinSize);
                gameServer.addNode(virus);
                relayconsole(gameServer,0,"Popped " + client.getFriendlyName());
            }
        }
    },
    play: function (gameServer, split) {
        var id = parseInt(split[1]);
        if (isNaN(id)) {
            relayconsole(gameServer,1,"Please specify a valid player ID!");
            return;
        }
        for (var i in gameServer.clients) {
            if (gameServer.clients[i].playerTracker.pID == id) {
                var client = gameServer.clients[i].playerTracker;
                client.disableSpawn = !client.disableSpawn;
                if (client.disableSpawn) {
                    Commands.list.kill(gameServer, split);
                    relayconsole(gameServer,0,"Disabled spawning for " + client.getFriendlyName());
                } else {
                    relayconsole(gameServer,0,"Enabled spawning for " + client.getFriendlyName());
                }
            }
        }
    },

    // Aliases for commands
    st: function (gameServer, split) { // Status
        Commands.list.status(gameServer, split);
    },
    pl: function (gameServer, split) { // Playerlist
        Commands.list.playerlist(gameServer, split);
    },
    m: function (gameServer, split) { // Mass
        Commands.list.mass(gameServer, split);
    },
    mn: function (gameServer, split) { // Minion
        Commands.list.minion(gameServer, split);
    },
    sm: function (gameServer, split) { // Spawnmass
        Commands.list.spawnmass(gameServer, split);
    },
    ka: function (gameServer, split) { // Killall
        Commands.list.killall(gameServer, split);
    },
    k: function (gameServer, split) { // Kill
        Commands.list.kill(gameServer, split);
    },
    mg: function (gameServer, split) { // Merge
        Commands.list.merge(gameServer, split);
    },
    s: function (gameServer, split) { // Speed
        Commands.list.speed(gameServer, split);
    },
    f: function (gameServer, split) { // Freeze
        Commands.list.freeze(gameServer, split);
    },
    ab: function (gameServer, split) { // Addbot
        Commands.list.addbot(gameServer, split); 
    },
    kb: function (gameServer, split) { // Kickbot
        Commands.list.kickbot(gameServer, split);
    },
    c: function (gameServer, split) { // Change
        Commands.list.change(gameServer, split);
    },
    n: function (gameServer, split) { // Name
        Commands.list.name(gameServer, split);
    },
    rep: function (gameServer, split) {
        Commands.list.replace(gameServer, split);
    }
};

// functions from GameServer
function relayconsole(gameServer, level, msg) {
    if(level) {
        Logger.warn(msg);
    }
    else {
        Logger.print(msg);
    }
    gameServer.AdminSendChat("\uD83D\uDCE2", {r:255,g:0,b:0}, msg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''));
};

function playerById (id, gameServer) {
    if (id == null) return null;
    for (var i = 0; i < gameServer.clients.length; i++) {
        var playerTracker = gameServer.clients[i].playerTracker;
        if (playerTracker.pID == id) {
            return playerTracker;
        }
    }
    return null;
};

function getLagMessage (updateTimeAvg) {
    if (updateTimeAvg < 20)
        return "perfectly smooth";
    if (updateTimeAvg < 35)
        return "good";
    if (updateTimeAvg < 40)
        return "tiny lag";
    if (updateTimeAvg < 50)
        return "lag";
    return "extremely high lag";
};

function saveIpBanList (gameServer) {
    var fs = require("fs");
    try {
        var blFile = fs.createWriteStream('../src/ipbanlist.txt');
        // Sort the blacklist and write.
        gameServer.ipBanList.sort().forEach(function (v) {
            blFile.write(v + '\n');
        });
        blFile.end();
        Logger.info(gameServer.ipBanList.length + " IP ban records saved.");
    } catch (err) {
        Logger.error(err.stack);
        Logger.error("Failed to save " + '../src/ipbanlist.txt' + ": " + err.message);
    }
};

function ban (gameServer, split, ip) {
    var ipBin = ip.split('.');
    if (ipBin.length != 4) {
        relayconsole(gameServer,1,"Invalid IP format: " + ip);
        return;
    }
    gameServer.ipBanList.push(ip);
    if (ipBin[2] == "*" || ipBin[3] == "*") {
        relayconsole(gameServer,0,"The IP sub-net " + ip + " has been banned");
    } else {
        relayconsole(gameServer,0,"The IP " + ip + " has been banned");
    }
    gameServer.clients.forEach(function (socket) {
        // If already disconnected or the ip does not match
        if (socket == null || !socket.isConnected || !gameServer.checkIpBan(socket.remoteAddress))
            return;
        // remove player cells
        Commands.list.kill(gameServer, split);
        // disconnect
        socket.close(null, "Banned from server");
        var name = socket.playerTracker.getFriendlyName();
        relayconsole(gameServer,0,"Banned: \"" + name + "\" with Player ID " + socket.playerTracker.pID);
        gameServer.sendChatMessage(null, null, "Banned \"" + name + "\""); // notify to don't confuse with server bug
    }, gameServer);
    saveIpBanList(gameServer);
};
