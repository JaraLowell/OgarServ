function MySQL() {

}

module.exports = MySQL;

MySQL.prototype.init = function (sqlconfig) {
    this.mysql = require('mysql');
    this.connection = this.mysql.createConnection({
        host: sqlconfig.host,
        user: sqlconfig.user,
        charset: 'utf8mb4',
        password: sqlconfig.password,
        database: sqlconfig.database
    });
    this.connection.on('error', function (err) {
        console.log('\u001B[31mMySQL Error!\u001B[0m\n', err);
    });
};

MySQL.prototype.connect = function () {
    this.connection.connect(function (err) {
        if (err != null)
            console.log('\u001B[31mMySQL Error!\u001B[0m\n', err);
    });
    this.connection.query('SET sql_mode = ""');
};

MySQL.prototype.ping = function () {
    this.connection.query('SELECT 1');
};

MySQL.prototype.close = function () {
    this.connection.end();
};

MySQL.prototype.writeScore = function (name, skin, ip, stats, table) {
    var time = +new Date;
    var playtime = (time - stats.playstart) / 1000 >> 0;
    var score = stats.score / 100 >> 0

    // Delete Old Records from Todays Score List
    this.connection.query('DELETE FROM `' + table + '` WHERE DATE(`lastseen`) != CURDATE()');

    // Write Score to Todays Score List
    this.connection.query('INSERT INTO `' + table + '` (`name`,`ip`,`score`,`lastseen`) VALUES ( ? , ? , ? ,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE `score` = IF(`score` < ? , ? , `score`),`lastseen` = CURRENT_TIMESTAMP', [name, ip, score, score, score], function (err, rows, fields) {
        if (err != null) console.log('\u001B[31mMySQL Error!\u001B[0m\n' + err);
    });

    // Write All time score and additional info
    this.connection.query('INSERT INTO `' + table + 'all` (`name`,`skin`,`ip`,`score`,`eat_players`,`eat_virus`,`eat_food`,`eat_surprice`,`timeplayed`,`lastseen`) VALUES ( ?, ? , ? , ? , ? , ? , ? , ? , ? ,CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE `score` = IF(`score` < ? , ? , `score`), `skin` = ?,`eat_players` = `eat_players` + ?, `eat_virus` = `eat_virus` + ?, `eat_food` = `eat_food` + ?, `eat_surprice` = `eat_surprice` + ?, `timeplayed` = `timeplayed` + ?, `lastseen` = CURRENT_TIMESTAMP', [name,skin,ip,score,stats.playereat,stats.viruseat,stats.foodeat,stats.surpeat,playtime,score,score,skin,stats.playereat,stats.viruseat,stats.foodeat,stats.surpeat,playtime], function (err, rows, fields) {
        if (err != null) console.log('\u001B[31mMySQL Error!\u001B[0m\n' + err);
    });
};

MySQL.prototype.createTable = function (table, database) {
    this.connection.query('CREATE DATABASE IF NOT EXISTS `' + database + '` CHARACTER SET=utf8mb4 COLLATE=utf8mb4_general_ci;', function (err, rows, fields) {
        if (err != null) console.log('\u001B[31mMySQL Error!\u001B[0m\n' + err);
    });
    this.connection.query('CREATE TABLE IF NOT EXISTS `' + table + '` (`name` varchar(24) COLLATE utf8mb4_general_ci NOT NULL, `ip` varchar(16) COLLATE utf8_bin NOT NULL, `score` mediumint(9) NOT NULL, `lastseen` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY `name` (`name`,`ip`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT="Ogar Player Score";', function (err, rows, fields) {
        if (err != null) console.log('\u001B[31mMySQL Error!\u001B[0m\n' + err);
    });
    this.connection.query('CREATE TABLE IF NOT EXISTS `' + table + 'all` (`name` varchar(24) COLLATE utf8mb4_general_ci NOT NULL,`ip` varchar(16) COLLATE utf8_bin NOT NULL,`skin` varchar(24) COLLATE utf8_bin NOT NULL,`score` mediumint(9) NOT NULL,`eat_players` int NOT NULL,`eat_virus` int NOT NULL,`eat_food` int NOT NULL,`eat_surprice` int NOT NULL,`timeplayed` int NOT NULL,`lastseen` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY `name` (`name`,`ip`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT="Ogar Player Score";', function (err, rows, fields) {
        if (err != null) console.log('\u001B[31mMySQL Error!\u001B[0m\n' + err);
    });
};
