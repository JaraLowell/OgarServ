// Import
var BinaryWriter = require("./BinaryWriter");

function UpdateNodes(playerTracker, Nodes) {
    this.playerTracker = playerTracker;
    this.Nodes = Nodes;
}

module.exports = UpdateNodes;

UpdateNodes.prototype.build = function (protocol) {
    if (!protocol) return null;

    var writer = new BinaryWriter();
    writer.writeUInt8(23);
    this.writeUpdateItems(writer);

    return writer.toBuffer();
};

UpdateNodes.prototype.writeUpdateItems = function (writer) {
    var scrambleX = this.playerTracker.scrambleX;
    var scrambleY = this.playerTracker.scrambleY;
    var scrambleId = this.playerTracker.scrambleId;

    for (var i = 0, len = this.Nodes.length; i < len; i++) {
        var node = this.Nodes[i];
        if (node.nodeId == 0)
            continue;

        var cellX = node.position.x + scrambleX;
        var cellY = node.position.y + scrambleY;

        writer.writeUInt32((node.nodeId ^ scrambleId) >>> 0);
        writer.writeInt32(cellX >> 0);
        writer.writeInt32(cellY >> 0);
        writer.writeUInt16(node.getSize() >>> 0);
        var color = node.getColor();
        writer.writeUInt8(color.r >>> 0);
        writer.writeUInt8(color.g >>> 0);
        writer.writeUInt8(color.b >>> 0);

        var flags = 0;
        if (node.isSpiked)
            flags |= 0x01;
        if (node.isAgitated)
            flags |= 0x10;
        if (node.cellType == 3)
            flags |= 0x20;
        writer.writeUInt8(flags >>> 0);

        writer.writeUInt16(0);
    }
    writer.writeUInt32(0 >> 0);
};
