// Imports
var version = require('./modules/default.json').version
var Logger = require('./modules/Logger');
var Commands = require('./modules/CommandList');
var GameServer = require('./GameServer');

// Init variables
var showConsole = true;

console.log("\u001B[8;37;44m   ___                  ___                       ");
console.log("  / _ \\ __ _ __ _ _ _  / __| ___ _ ___ _____ _ _  ");
console.log(" | (_) / _` / _` | '_| \\__ \\/ -_) '_\\ V / -_) '_| ");
console.log("  \\___/\\__, \\__,_|_|   |___/\\___|_|  \\_/\\___|_|   ");
console.log("       |___/  \u001B[32mAn open source Agar.io server       \u001B[0m");

// Start msg
Logger.start();

process.on('exit', function (code) {
    Logger.debug("process.exit(" + code + ")");
    Logger.shutdown();
});

process.on('uncaughtException', function (err) {
    Logger.fatal(err.stack);
    process.exit(1);
});

Logger.info("\u001B[1m\u001B[32mOgar Server v" + version + "\u001B[37m - An open source multi-protocol Agar.IO server emulator\u001B[0m");
Logger.info("\u001B[33mNode.js v" + process.versions.node + " (" + process.platform + " " + process.arch + ")\u001B[0m");
Logger.info("\u001B[33mChrome's V8 JavaScript engine v" + process.versions.v8 + "\u001B[0m");
Logger.info("\u001B[33mLibrary HTTP v" + process.versions.http_parser + "\u001B[0m");
Logger.info("\u001B[33mLibrary zlib v" + process.versions.zlib + "\u001B[0m");

// Run Ogar
if (global.gc) {
    // Run GC if install every 15 min
    Logger.info("\u001B[33mGarbage collection cleanup available, setting up 15 min interval cleanup.\u001B[0m");
    setInterval(function(){
        global.gc();
    }, 900000);
}

// Handle arguments
process.argv.forEach(function (val) {
    if (val == "--noconsole") {
        showConsole = false;
    } else if (val == "--help") {
        console.log("Proper Usage: node index.js");
        console.log("    --noconsole         Disables the console");
        console.log("    --help              Help menu.");
        console.log("");
    }
});

// Run Ogar
var gameServer = new GameServer();
gameServer.start();
// Add command handler
gameServer.commands = Commands.list;
// Initialize the server console
if (showConsole) {
    var readline = require('readline');
    var in_ = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    setTimeout(prompt, 100);
}

// Console functions

function prompt() {
    in_.question("", function (str) {
        try {
            parseCommands(str);
        } finally {
            setTimeout(prompt, 0);
        }
    });
}

function parseCommands(str) {
    // Don't process ENTER
    if (str === '')
        return;

    // Log the string
    Logger.write(str);

    // Splits the string
    var split = str.split(" ");

    // Process the first string value
    var first = split[0].toLowerCase();

    // Get command function
    var execute = gameServer.commands[first];
    if (typeof execute != 'undefined') {
        execute(gameServer, split);
    } else {
        gameServer.sendChatMessage(null , null, str);
    }
}
