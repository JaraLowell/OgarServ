var BinaryWriter = require("./BinaryWriter");

function UpdateNodes(Nodes) {
    this.Nodes = Nodes;
}

module.exports = UpdateNodes;

UpdateNodes.prototype.build = function (protocol) {
    var writer = new BinaryWriter();
    writer.writeUInt8(104);
    this.writeUpdateItems(writer);

    return writer.toBuffer();
};

UpdateNodes.prototype.writeUpdateItems = function (writer) {
    for (var i = 0, len = this.Nodes.length; i < len; i++) {
        var node = this.Nodes[i];
        if (!node || !node.nodeId) continue;

        writer.writeUInt32(node.nodeId >>> 0);
        writer.writeInt32(node.position.x >> 0);
        writer.writeInt32(node.position.y >> 0);
        writer.writeUInt16(node._size >>> 0);
        writer.writeUInt8(node.color.r >>> 0);
        writer.writeUInt8(node.color.g >>> 0);
        writer.writeUInt8(node.color.b >>> 0);

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
