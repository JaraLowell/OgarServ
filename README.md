## Ogar
Copy of Ogar that I heavily modified, and will continue to update. The [OgarProject](https://ogarproject.com) owns Ogar, and I do not claim it as mine! Original Ogar found [here](https://github.com/OgarProject/Ogar)

## JXcore
Swiching fomr node to JXcore, JXcore is faster, multitreaths and bether memory managment for long hour running prodjects. Please see [this link](https://github.com/jxcore/jxcore)

## What is Done
* Clean up the code
* Make two version Ogar and Agar, Agar is agar.io client compatible, while ogar is for those that use an older protocol. eventually i hope we can remove support for older protocols when people with web clients know how to edit there java source. But that later.
* Cleaned up the console response and commands, see list below
* Added Master Server or Tracker, this server announces it is online to the tracker page. You can there then monitor your server and other people can find your server there as well to play on. See [this link](http://ogar.mivabe.nl/master) for the Tracker page.

## We working on
* MySQL   : Adding MySQL Highscore system 
  Currently being tested!
* Store and Retrieve Bans from file

## MySQL High Score!
To have it active, create an ini file inside the folder called mysql.ini and in there write down 
* host = mysql server ip:port usualy `localhost`
* user = mysql username (make sure you added it and it has write access)
* password = mysql user password
* database = the database to use example `agario`
* table = the score table name (in case you have more then 1 server example: `score`)

## Console Commands
- addbot [Number of Bots] 
  * add one or more bot to the server
- ban [IP]
  * ban a player with IP
- banlist
  * show current ban list
- board [Text]
  * set scoreboard text
- boardreset
  * reset scoreboard text
- change
  * change specified settings
- clear
  * clear console output
- color [Player ID] [Color Red 0~255] [Color Green 0~255] [Color Blue 0~255]
  * set cell(s) color by client ID
- exit
  * stop the server
- food [Position X] [ Position Y] [Mass]
  * spawn food at specified Location
- gamemode [number]
  * change server gamemode
- kick [Player ID]
  * kick player or bot by client ID
- kill [Player ID]
  * kill cell(s) by client ID
- killall
  * kill everyone
- mass [Player ID] [Mass]
  * set cell(s) mass by client ID
- merge [Player ID]
  * force a player to merge
- name [Player ID] [New Name]
  * change cell(s) name by client ID
- playerlist
  * get list of players and bots
- pause
  * pause game , freeze all cells
- reload
  * reload config
- say [Text]
  * chat from console
- split [Player ID]
  * force a player to split
- status
  * get server status
- tp [Player ID] [Position X] [ Position Y]
  * teleport player to specified location
- unban [IP]
  * un ban a player with IP
- virus [Position X] [ Position Y] [Mass]
  * spawn virus at a specified Location

## License
Please see [this link](https://github.com/JaraLowell/OgarServ/blob/OgarServer/LICENSE)
