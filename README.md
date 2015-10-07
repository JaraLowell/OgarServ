## Ogar
Copy of Ogar that I heavily modified, and will continue to update. The [OgarProject](https://ogarproject.com) owns Ogar, and I do not claim it as mine! Original Ogar found [here](https://github.com/OgarProject/Ogar)

## What is Done
* Clean up the code
* Make two version Ogar and Agar, Agar is agar.io client compatible, while ogar is for those that use an older protocol. eventually i hope we can remove support for older protocols when people with web clients know how to edit there java source. But that later.
* Cleaned up the console response and commands, see list below
* Added Master Server or Tracker, this server announces it is online to the tracker page. You can there then monitor your server and other people can find your server there as well to play on. See [this link](http://ogar.mivabe.nl/master) for the Tracker page.

## We working on
* MySQL   : Adding MySQL Highscore system 
  Currently being tested!
* Store and Retrieve Bans from file

## Console Commands
* addbot     : add one or more bot to the server
* ban        : ban a player with IP
* banlist    : show current ban list
* board      : set scoreboard text
* boardreset : reset scoreboard text
* change     : change specified settings
* clear      : clear console output
* color      : set cell(s) color by client ID
* exit       : stop the server
* food       : spawn food at specified Location
* gamemode   : change server gamemode
* kick       : kick player or bot by client ID
* kill       : kill cell(s) by client ID
* killall    : kill everyone
* mass       : set cell(s) mass by client ID
* merge      : force a player to merge
* name       : change cell(s) name by client ID
* playerlist : get list of players and bots
* pause      : pause game , freeze all cells
* reload     : reload config
* say        : chat from console
* split      : force a player to split
* status     : get server status
* tp         : teleport player to specified location
* unban      : un ban a player with IP
* virus      : spawn virus at a specified Location

## License
Please see [this link](https://github.com/JaraLowell/OgarServ/blob/OgarServer/LICENSE)
