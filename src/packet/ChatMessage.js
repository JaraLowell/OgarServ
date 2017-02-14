var BinaryWriter = require("./BinaryWriter");
var UserRoleEnum = require("../enum/UserRoleEnum");

function ChatMessage(sender, message) {
    this.sender = sender;
    this.message = message;
}

module.exports = ChatMessage;

ChatMessage.prototype.build = function (protocol) {
    var text = this.message,
        name = '',
        flags = 0,
        color = { 'r': 0x9B, 'g': 0x9B, 'b': 0x9B };

    if (text == null) text = "";

    if (this.sender == '\uD83D\uDCE2') {
        flags = 0x40;
    } else if (this.sender != null) {
        name = this.sender._name.replace(/\[(BOT)\] /gi, "");
        if (name == null || name.length == 0) {
            if (this.sender.cells.length > 0)
                name = "An unnamed cell";
            else
                name = "Spectator";
        }
        if (this.sender.cells.length > 0) {
            color = this.sender.cells[0].getColor();
        }
    } else {
        name = "\uD83D\uDCE2 ";
        flags = 0x80;
    }

    var writer = new BinaryWriter();
    writer.writeUInt8(0x63);

    writer.writeUInt8(flags);
    writer.writeUInt8(color.r >> 0);
    writer.writeUInt8(color.g >> 0);
    writer.writeUInt8(color.b >> 0);
    writer.writeStringZeroUnicode(name);
    writer.writeStringZeroUnicode(text);

    return writer.toBuffer();
};
