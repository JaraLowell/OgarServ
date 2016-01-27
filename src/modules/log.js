var fs   = require("fs");
var util = require('util');
var EOL  = require('os').EOL;

function Log() {
    // Nothing
}

module.exports = Log;

var fillChar = function (data, char, fieldLength, rTL) {
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

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

var seconds2time = function(seconds) {
    var hours   = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds - (hours * 3600)) / 60);
    var seconds = seconds - (hours * 3600) - (minutes * 60);
    var time = "";

    if (hours != 0) {
      time = hours+":";
    }
    if (minutes != 0 || time !== "") {
      minutes = (minutes < 10 && time !== "") ? "0"+minutes : String(minutes);
      time += minutes+":";
    }
    if (time === "") {
      time = seconds+" seconds";
    }
    else {
      time += (seconds < 10) ? "0"+seconds : String(seconds);
    }
    return time;
};

Log.prototype.setup = function(gameServer) {
    if (!fs.existsSync('./logs')) {
        // Make log folder
        fs.mkdir('./logs');
    }
    switch (gameServer.config.serverLogLevel) {
        case 2:
            ip_log = fs.createWriteStream('./logs/ip.log', {flags : 'w'});

            // Override
            this.onConnect = function(ip) {
                ip_log.write("["+this.formatTime()+"] Connect: " + ip + EOL);
            };

            this.onDisconnect = function(ip) {
                ip_log.write("["+this.formatTime()+"] Disconnect: " + ip + EOL);
            };

            this.onWriteConsole = function(gameServer) {
                var serv = gameServer.getPlayers();
                var used = (process.memoryUsage().heapUsed / 1024 ).toFixed(0);
                var total = (process.memoryUsage().heapTotal / 1024 ).toFixed(0);
                var rss = (process.memoryUsage().rss / 1024 ).toFixed(0);
                var line1 = "\u001B[4mPlaying :   " + fillChar(serv.humans, ' ', 5, true) + " │ Connecting: " + fillChar((serv.players-(serv.humans+serv.spectate+serv.bots)), ' ', 5, true) + " │ Spectator:  " + fillChar(serv.spectate, ' ', 5, true) + " │ Bot:        " + fillChar(serv.bots, ' ', 5, true) + " \u001B[24m";
                var line2 = "ejected : " + fillChar(numberWithCommas(gameServer.nodesEjected.length), ' ', 27, true) + " │ cells    :" + fillChar(numberWithCommas(gameServer.nodesPlayer.length), ' ', 27, true) + " ";
                var line3 = "food    : " + fillChar(numberWithCommas(gameServer.nodes.length), ' ', 27, true) + " │ moving   :" + fillChar(numberWithCommas(gameServer.movingNodes.length), ' ', 27, true) + " ";
                var line4 = "virus   : " + fillChar(numberWithCommas(gameServer.nodesVirus.length), ' ', 27, true) + " │ leader   :" + fillChar(numberWithCommas(gameServer.leaderboard.length), ' ', 27, true) + " ";
                var line5 = "uptime  : " + fillChar(numberWithCommas(seconds2time(process.uptime())), ' ', 27, true) + " │ memory   :" + fillChar(numberWithCommas(rss), ' ', 27, true) + " \u001B[24m";
                // process.stdout.write("\u001B[?7h"); // 132 character mode?
                process.stdout.write("\u001B[s\u001B[H\u001B[6r");
                process.stdout.write("\u001B[8;36;44m   ___                  " + line1 + EOL);
                process.stdout.write("  / _ \\ __ _ __ _ _ _   " + line2 + EOL);
                process.stdout.write(" | (_) / _` / _` | '_|  " + line3 + EOL);
                process.stdout.write("  \\___/\\__, \\__,_|_|    " + line4 + EOL);
                process.stdout.write("\u001B[4m       |___/ server     " + line5 + EOL);
                process.stdout.write("\u001B[0m\u001B[u");
            };
        case 1:
            console_log = fs.createWriteStream('./logs/console.log', {flags : 'w'});
            var LastMsg;

            console.log = function(d) {
                if ( d === LastMsg ) return;
                else 
                {
                    LastMsg = d;

                    var date = new Date();
                    var hour = date.getHours();
                    hour = (hour < 10 ? "0" : "") + hour;
                    var min  = date.getMinutes();
                    min = (min < 10 ? "0" : "") + min;
                    var yada = "[" + hour +":" + min + "] ";

                    var text = yada + util.format(d);

                    // Remove Color Codes from log
                    text = text.replace("\u001B[0m","");  // Reset
                    text = text.replace("\u001B[31m",""); // Red
                    text = text.replace("\u001B[32m",""); // Green
                    text = text.replace("\u001B[33m",""); // Yellow
                    text = text.replace("\u001B[34m",""); // Blue
                    text = text.replace("\u001B[35m",""); // Purple
                    text = text.replace("\u001B[36m",""); // Cyan

                    console_log.write(text + EOL);
                    process.stdout.write(yada + util.format(d) + EOL);
                }
            };
        case 0:
            // Prevent crashes
            process.on('uncaughtException', function(err) {
                console.log(err.stack);
            });
        default:
            break;
    }
};

Log.prototype.onConnect = function(ip) {
    // Nothing
};

Log.prototype.onDisconnect = function(ip) {
    // Nothing
};

Log.prototype.onWriteConsole = function(gameServ) {
    // Nothing
};

Log.prototype.formatTime = function() {
    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    return hour + ":" + min;
}
