// Imports
var Commands = require('./modules/CommandList');
var GameServer = require('./GameServer');

// Init variables
var showConsole = true;

// Start msg
console.log("** Ogar - An open source Agar.io server implementation **");

// Handle arguments
process.argv.forEach(function(val) {
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
    // var readline = require('readline');
    // var in_ = readline.createInterface({ input: process.stdin, output: process.stdout });
    // setTimeout(prompt, 100);
    var sys = require("sys");
    var stdin = process.openStdin();
}

stdin.addListener("data", function(d) {
    if ( d.toString().trim() === '' ) return;

    console.log("\u001B[36m[CMD] " + d.toString().trim() + "\u001B[0m" );
    parseCommands( d.toString().trim() );
});

/* // Console functions
function prompt() {
    in_.question("", function(str) {
        parseCommands(str);
        return prompt(); // Too lazy to learn async
    });
}; */

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
        execute(gameServer,split);
    } else {
        console.log("Invalid Command!");
    }
};
