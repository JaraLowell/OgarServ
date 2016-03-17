// Imports
var Commands = require('./modules/CommandList');
var GameServer = require('./GameServer');

// Init variables
var showConsole = true;

// Start msg
console.log("\u001B[8;37;44m   ___                  ___                       ");
console.log("  / _ \\ __ _ __ _ _ _  / __| ___ _ ___ _____ _ _  ");
console.log(" | (_) / _` / _` | '_| \\__ \\/ -_) '_\\ V / -_) '_| ");
console.log("  \\___/\\__, \\__,_|_|   |___/\\___|_|  \\_/\\___|_|   ");
console.log("       |___/  \u001B[32mAn open source Agar.io server       \u001B[0m");

console.log("");
console.log("\u001B[33m Node.js v" + process.versions.node + " (" + process.platform + " " + process.arch + ")");
console.log(" Chrome's V8 JavaScript engine v" + process.versions.v8);
console.log(" Library HTTP v" + process.versions.http_parser);
console.log(" Library zlib v" + process.versions.zlib + "\u001B[0m");

// Handle arguments
process.argv.forEach(function (val) {
    if (val == "--noconsole") {
        showConsole = false;
    } else if (val == "--help") {
        console.log(" Proper Usage: jx index.js");
        console.log("    --noconsole         Disables the console");
        console.log("    --help              Help menu.");
    }
});

// Run Ogar
if (global.gc) {
    // Run GC if install every 15 min
    console.log("\u001B[33m Garbage collection cleanup available, setting up 15 min interval cleanup.\u001B[0m");
    setInterval(function(){
        global.gc();
    }, 900000);
}

console.log("");
var gameServer = new GameServer();
gameServer.start();

// Add command handler
gameServer.commands = Commands.list;
// Initialize the server console
if (showConsole) {
    // var readline = require('readline');
    // var in_ = readline.createInterface({ input: process.stdin, output: process.stdout });
    // setTimeout(prompt, 100);
    var sys = require("util");
    var stdin = process.openStdin();
}

stdin.addListener("data", function (d) {
    if (d.toString().trim() === '') return;
    process.stdout.write('\033[1A\033[2K');
    console.log("\u001B[36m[CMD] " + d.toString().trim() + "\u001B[0m");
    parseCommands(d.toString().trim());
});

function parseCommands(str) {
    // Don't process ENTER
    if (str === '' || str === '\n')
        return;

    // Splits the string
    var split = str.split(" ");

    // Process the first string value
    var first = split[0].toLowerCase();

    // Get command function
    var execute = gameServer.commands[first];
    if (typeof execute != 'undefined') {
        execute(gameServer, split);
    } else {
        console.log("Invalid Command!");
    }
}
