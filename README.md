## Downloads
See the [releases](https://github.com/JaraLowell/OgarServ/releases) section for downloads

## Project Info
![Language](https://img.shields.io/badge/language-Java-yellow.svg)
[![License](https://img.shields.io/badge/license-GPLv3-663399.svg)](https://github.com/JaraLowell/OgarServ/blob/OgarServer/LICENSE)

## [![Language](https://img.shields.io/badge/Ogar-Node-red.svg)](https://github.com/OgarProject/Ogar) Ogar
Copy of Ogar that I heavily modified, and will continue to update. The [OgarProject](https://ogarproject.com) owns Ogar, and I do not claim it as mine! Original Ogar found [here](https://github.com/OgarProject/Ogar)

## [![Language](https://img.shields.io/badge/JXCore-Nodejx-red.svg)](https://github.com/jxcore/jxcore) JXcore
Swiching fomr node to JXcore, JXcore is faster, multitreaths and bether memory managment for long hour running prodjects. Please see [JXcore](https://github.com/jxcore/jxcore) for more info.

## What is Done
* Clean up the code
* Make two version `Ogar` and `Agar`, Agar is agar.io client compatible, while ogar is for those that use an older protocol. eventually i hope we can remove support for older protocols when people with web clients know how to edit there java source. But that later.
* Cleaned up the console response and commands, see list below
* `serverBots = [Number]` is now Bot min Players, if more players are alive in the game and bots get killed they dont return till the live users drops under the Number set in serverBots.
* Added `Master Server` or Tracker, this server announces it is online to the tracker page. You can there then monitor your server and other people can find your server there as well to play on. See [-= Ogar Tracker =-](http://ogar.mivabe.nl/master) for the Tracker page.
* Added auto shutdown server (for auto resets) this by default is set to 24 hours, but can be changed trough `serverResetTime: 24` in your gameserver.ini. Setting it to 0 (zero) disables auto shutdown.

* ![Language](https://img.shields.io/badge/Chat-99-green.svg) This Server supports Chat for both ogar and agar (Package 99)
* ![Language](https://img.shields.io/badge/Info-90-green.svg) This Server supports Server Info for both ogar and agar (Package 90)

## We working on
* MySQL   : Adding MySQL Highscore system 
  - Currently being tested!
* Store and Retrieve Bans from file

## [![Language](https://img.shields.io/badge/language-MySQL-red.svg)](https://www.mysql.com) MySQL High Score!
To have it active, create an ini file inside the folder called mysql.ini and in there write down 
* `host =` mysql server ip:port usualy `localhost`
* `user =` mysql username (make sure you added it and it has write access)
* `password =` mysql user password
* `database =` the database to use example `agario`
* `table =` the score table name (in case you have more then 1 server example: `score`)

## Console Commands
Command | Info
--------|--------
addbot [Number of Bots] | add one or more bot to the server
ban [IP] |  ban a player with IP
banlist | show current ban list
board [Text] | set scoreboard text
boardreset | reset scoreboard text
change | change specified settings
clear | clear console output
color [Player ID] [Color R] [Color G] [Color B] | set cell(s) color by client ID
exit | stop the server
food [Position X] [ Position Y] [Mass] | spawn food at specified Location
gamemode [number] | change server gamemode
kick [Player ID] | kick player or bot by client ID
kill [Player ID] | kill cell(s) by client ID
killall | kill everyone
mass [Player ID] [Mass] | set cell(s) mass by client ID
merge [Player ID] | force a player to merge
name [Player ID] [New Name] | change cell(s) name by client ID
playerlist | get list of players and bots
pause | pause game , freeze all cells
reload | reload config
say [Text] | chat from console
split [Player ID] | force a player to split
status | get server status
tp [Player ID] [Position X] [ Position Y] | teleport player to specified location
unban [IP] | un ban a player with IP
virus [Position X] [ Position Y] [Mass] | spawn virus at a specified Location

## Game Mode's Currently Available
 Number | Full Name
--------|--------
0 | Free For All
1 | Teams
2 | Experimental
10 | Tournament
11 | Hunger Games
12 | Zombie
13 | Zombie Teams
14 | Zombie Experimental Teams
20 | Rainbow
22 | Blackhole

## gameserver.ini
Config | Meaning
-------|--------
serverMaxConnections: 64 | Maximum amount of connections to the server
serverPort: 44411 | Server port
serverGamemode: 0 | Gamemode, See list above
serverResetTime: 24 | Time in hours to reset (0 is off)
serverName: My url| The name to display on the [Tracker](http://ogar.mivabe.nl/master) (leave empty will show ip:port, max 32char)
serverBots: 0 | Amount of player bots min players on server
serverViewBaseX: 1024 | Base view X distance of players (Warning: high values may cause lag)
serverViewBaseY: 592 | Base view Y distance of players
serverStatsPort: -88 | Port for stats server. Having a negative number will disable the stats server
serverStatsUpdate: 60 | Amount of seconds per update for the server stats
gameLBlength: 10 | Number of names to display on Leaderboard (Vanilla value: 10)
borderLeft: 0 | Left border of map (Vanilla value 0)
borderRight: 12000 | Right border of map (Vanilla value 12000)
borderTop: 0 | Top border of map (Vanilla value 0)
borderBottom: 12000 | Bottom border of map (Vanilla value 1200)
spawnInterval: 20 | The interval between each food cell spawn in ticks (1 tick = 50 ms)
foodSpawnAmount: 10 | The amount of food to spawn per interval
foodStartAmount: 100 | The starting amount of food in the map
foodMaxAmount: 500 | Maximum food cells on the map
foodMass: 1 | Starting food size (In mass)
virusMinAmount: 10 | Minimum amount of viruses on the map
virusMaxAmount: 50 | Maximum amount of viruses on the map. If this amount is reached, then ejected cells will pass through viruses
virusStartMass: 100 | Starting virus size (In mass)
virusFeedAmount: 7 | Amount of times you need to feed a virus to shoot it
ejectMass: 12 | Mass of ejected cells
ejectMassLoss: 16 | Mass lost when ejecting cells
ejectSpeed: 160 | Base speed of ejected cells
ejectSpawnPlayer: 50 | Chance for a player to spawn from ejected mass
playerStartMass: 10 | Starting mass of the player cell
playerMaxMass: 22500 | Maximum mass a player can have
playerMinMassEject: 32 | Mass required to eject a cell
playerMinMassSplit: 36 | Mass required to split
playerMaxCells: 16 | Max cells the player is allowed to have
playerRecombineTime: 30 | Base amount of seconds before a cell is allowed to recombine
playerMassDecayRate: .002 | Amount of mass lost per second
playerMinMassDecay: 9 | Minimum mass for decay to occur
playerMaxNickLength: 15 | Maximum nick length
playerDisconnectTime: 60 | The amount of seconds it takes for a player cell to be removed after disconnection (If set to -1, cells are never removed)
tourneyMaxPlayers: 12 | Maximum amount of participants for tournament style game modes
tourneyPrepTime: 10 | Amount of ticks to wait after all players are ready (1 tick = 1000 ms)
tourneyEndTime: 30 | Amount of ticks to wait after a player wins (1 tick = 1000 ms)
tourneyTimeLimit: 20 | Time limit of the game, in minutes
tourneyAutoFill: 0 | If set to a value higher than 0, the tournament match will automatically fill up with bots after this amount of seconds
tourneyAutoFillPlayers: 1 | The timer for filling the server with bots will not count down unless there is this amount of real players
chatMaxMessageLength: 70 | Maximum message length

## Enjoy!
