module.exports = {
    Mode: require('./Mode'),
    FFA: require('./FFA'),
    Teams: require('./Teams'),
    Experimental: require('./Experimental'),
    Experimental2: require('./Experimental2'),
    Tournament: require('./Tournament'),
    HungerGames: require('./HungerGames'),
    Rainbow: require('./Rainbow'),
    Zombie: require('./Zombie'),
    TeamZ: require('./TeamZ.js'),
    TeamX: require('./TeamX.js'),
    Blackhole: require('./Blackhole'),
    VirusOff: require('./VirusOff'),
    Leap: require('./Leap')
};

var get = function (id) {
    var mode;
    switch (id) {
        case 1: // Teams
            mode = new module.exports.Teams();
            break;
        case 2: // Experimental
            mode = new module.exports.Experimental();
            break;
        case 3: // Experimental II (scoltes version)
            mode = new module.exports.Experimental2();
            break;
        case 10: // Tournament
            mode = new module.exports.Tournament();
            break;
        case 11: // Hunger Games
            mode = new module.exports.HungerGames();
            break;
        case 12: // Zombie
            mode = new module.exports.Zombie();
            break;
        case 13: // Zombie Team
            mode = new module.exports.TeamZ();
            break;
        case 14: // Experimental Team
            mode = new module.exports.TeamX();
            break;
        case 15: // VirusOff
            mode = new module.exports.VirusOff();
            break;
        case 16: // Leap
            mode = new module.exports.Leap();
            break;
        case 17: // Blackhole
            mode = new module.exports.Blackhole();
            break;
        case 20: // Rainbow
            mode = new module.exports.Rainbow();
            break;
        default: // FFA is default
            mode = new module.exports.FFA();
            break;
    }
    return mode;
};

module.exports.get = get;