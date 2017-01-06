var BinaryWriter = require("./BinaryWriter");

function ServerInfo(uptime, players, msize, mfood, smode) {
    this.uptime = uptime;
    this.players = players;
    this.msize = msize;
    this.mfood = mfood;
    this.smode = smode;

}

module.exports = ServerInfo;

ServerInfo.prototype.build = function () {
    var writer = new BinaryWriter();
    writer.writeUInt8(90);             // Message Id
    writer.writeDouble(this.uptime);
    writer.writeDouble(this.players);
    writer.writeDouble(this.msize);
    writer.writeDouble(this.mfood);
    writer.writeDouble(this.smode);
    return writer.toBuffer();
};
