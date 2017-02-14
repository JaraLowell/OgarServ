var BinaryWriter = require("./BinaryWriter");

function UpdateNodes(playerTracker, addNodes, updNodes, eatNodes, delNodes) {
    this.playerTracker = playerTracker;
    this.addNodes = addNodes;
    this.updNodes = updNodes;
    this.eatNodes = eatNodes;
    this.delNodes = delNodes;
}

module.exports = UpdateNodes;

UpdateNodes.prototype.build = function (protocol) {
    if (!protocol) return null;

    var writer = new BinaryWriter();
    writer.writeUInt8(0x10);                                // Packet ID
    this.writeEatItems(writer);

    if (protocol < 5) this.writeUpdateItems4(writer);
    else if (protocol == 5) this.writeUpdateItems5(writer);
    else this.writeUpdateItems6(writer, protocol);

    this.writeRemoveItems(writer, protocol);
    return writer.toBuffer();
};

// protocol 4
UpdateNodes.prototype.writeUpdateItems4 = function (writer) {
    var scrambleX = this.playerTracker.scrambleX;
    var scrambleY = this.playerTracker.scrambleY;
    var scrambleId = this.playerTracker.scrambleId;

    for (var i = 0, len = this.updNodes.length; i < len; i++) {
        var node = this.updNodes[i];
        if (!node || !node.nodeId) continue;

        var cellX = node.position.x + scrambleX;
        var cellY = node.position.y + scrambleY;

        writer.writeUInt32((node.nodeId ^ scrambleId) >>> 0);
        writer.writeInt16(cellX >> 0);
        writer.writeInt16(cellY >> 0);
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
    for (var i = 0, len = this.addNodes.length; i < len; i++) {
        var node = this.addNodes[i];
        if (!node || !node.nodeId) continue;

        var cellX = node.position.x + scrambleX;
        var cellY = node.position.y + scrambleY;
        var cellName = null;
        if (node.owner) {
            cellName = node.owner._nameUnicode;
        }

        writer.writeUInt32((node.nodeId ^ scrambleId) >>> 0);
        writer.writeInt16(cellX >> 0);
        writer.writeInt16(cellY >> 0);
        writer.writeUInt16(node._size >>> 0);
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

        if (cellName) writer.writeBytes(cellName);
        else writer.writeUInt16(0);
    }
    writer.writeUInt32(0);
};

// protocol 5
UpdateNodes.prototype.writeUpdateItems5 = function (writer) {
    var scrambleX = this.playerTracker.scrambleX;
    var scrambleY = this.playerTracker.scrambleY;
    var scrambleId = this.playerTracker.scrambleId;
    for (var i = 0, len = this.updNodes.length; i < len; i++) {
        var node = this.updNodes[i];
        if (!node || !node.nodeId) continue;

        var cellX = node.position.x + scrambleX;
        var cellY = node.position.y + scrambleY;

        writer.writeUInt32((node.nodeId ^ scrambleId) >>> 0);
        writer.writeInt32(cellX >> 0);
        writer.writeInt32(cellY >> 0);
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
    for (var i = 0, len = this.addNodes.length; i < len; i++) {
        var node = this.addNodes[i];
        if (!node || !node.nodeId) continue;

        var cellX = node.position.x + scrambleX;
        var cellY = node.position.y + scrambleY;

        var skinName = null;
        var cellName = null;
        if (node.owner) {
            skinName = node.owner._skinUtf8;
            cellName = node.owner._nameUnicode;
        } else if (typeof node.skinName == 'object') {
            skinName = node.skinName;
        } else {
            if (node.cellType == 2 || node.cellType == 5) {
                var temp = new BinaryWriter();
                temp.writeStringZeroUtf8('%gas');
                skinName = node.skinName = temp.toBuffer();
            } else if(node.cellType == 3) {
                var temp = new BinaryWriter();
                temp.writeStringZeroUtf8('%proton');
                skinName = node.skinName = temp.toBuffer();
            }
        }

        writer.writeUInt32((node.nodeId ^ scrambleId) >>> 0);
        writer.writeInt32(cellX >> 0);
        writer.writeInt32(cellY >> 0);
        writer.writeUInt16(node._size >>> 0);
        writer.writeUInt8(node.color.r >>> 0);
        writer.writeUInt8(node.color.g >>> 0);
        writer.writeUInt8(node.color.b >>> 0);

        var flags = 0;
        if (node.isSpiked)
            flags |= 0x01;
        if (skinName != null)
            flags |= 0x04;
        if (node.isAgitated)
            flags |= 0x10;
        if (node.cellType == 3)
            flags |= 0x20;
        writer.writeUInt8(flags >>> 0);

        if (flags & 0x04)
            writer.writeBytes(skinName);

        if (cellName) writer.writeBytes(cellName);
        else writer.writeUInt16(0);
    }
    writer.writeUInt32(0 >> 0);
};

// protocol 6
UpdateNodes.prototype.writeUpdateItems6 = function (writer, protocol) {
    var scrambleX = this.playerTracker.scrambleX;
    var scrambleY = this.playerTracker.scrambleY;
    var scrambleId = this.playerTracker.scrambleId;
    for (var i = 0, len = this.updNodes.length; i < len; i++) {
        var node = this.updNodes[i];
        if (!node || !node.nodeId) continue;

        var cellX = node.position.x + scrambleX;
        var cellY = node.position.y + scrambleY;

        writer.writeUInt32((node.nodeId ^ scrambleId) >>> 0);
        writer.writeInt32(cellX >> 0);
        writer.writeInt32(cellY >> 0);
        writer.writeUInt16(node._size >>> 0);

        var flags = 0;
        if (node.isSpiked)
            flags |= 0x01;
        if (node.cellType == 0)
            flags |= 0x02;
        if (node.isAgitated)
            flags |= 0x10;
        if (node.cellType == 3)
            flags |= 0x20;
        writer.writeUInt8(flags >>> 0);

        if (flags & 0x02) {
            writer.writeUInt8(node.color.r >>> 0);
            writer.writeUInt8(node.color.g >>> 0);
            writer.writeUInt8(node.color.b >>> 0);
        }
    }
    for (var i = 0, len = this.addNodes.length; i < len; i++) {
        var node = this.addNodes[i];
        if (!node || !node.nodeId) continue;

        var cellX = node.position.x + scrambleX;
        var cellY = node.position.y + scrambleY;
        var skinName = null;
        var cellName = null;
        if (node.owner) {
            skinName = node.owner._skinUtf8;
            if(protocol == 7) cellName = node.owner._nameUnicode; else cellName = node.owner._nameUtf8;
        } else if (typeof node.skinName == 'object') {
            skinName = node.skinName;
        } else {
            if (node.cellType == 2 || node.cellType == 5) {
                var temp = new BinaryWriter();
                temp.writeStringZeroUtf8('%gas');
                skinName = node.skinName = temp.toBuffer();
            } else if(node.cellType == 3) {
                var temp = new BinaryWriter();
                temp.writeStringZeroUtf8('%proton');
                skinName = node.skinName = temp.toBuffer();
            }
        }

        writer.writeUInt32((node.nodeId ^ scrambleId) >>> 0);
        writer.writeInt32(cellX >> 0);
        writer.writeInt32(cellY >> 0);
        writer.writeUInt16(node._size >>> 0);

        var flags = 0;
        if (node.isSpiked)
            flags |= 0x01;
        if (true)
            flags |= 0x02;
        if (skinName != null)
            flags |= 0x04;
        if (cellName != null)
            flags |= 0x08;
        if (node.isAgitated)
            flags |= 0x10;
        if (node.cellType == 3)
            flags |= 0x20;
        if (protocol == 7)
            flags |= 0x40;

        writer.writeUInt8(flags >>> 0);

        if (flags & 0x02) {
            writer.writeUInt8(node.color.r >>> 0);
            writer.writeUInt8(node.color.g >>> 0);
            writer.writeUInt8(node.color.b >>> 0);
        }
        if (flags & 0x04)
            writer.writeBytes(skinName);
        if (flags & 0x08)
            writer.writeBytes(cellName);
    }
    writer.writeUInt32(0);
};

UpdateNodes.prototype.writeEatItems = function (writer) {
    var scrambleId = this.playerTracker.scrambleId;

    writer.writeUInt16(this.eatNodes.length >>> 0);
    for (var i = 0, len = this.eatNodes.length; i < len; i++) {
        var node = this.eatNodes[i];
        var hunterId = 0;
        if (node.getKiller()) {
            hunterId = node.getKiller().nodeId;
        }
        writer.writeUInt32((hunterId ^ scrambleId) >>> 0);
        writer.writeUInt32((node.nodeId ^ scrambleId) >>> 0);
    }
};

UpdateNodes.prototype.writeRemoveItems = function (writer, protocol) {
    var scrambleId = this.playerTracker.scrambleId;
    var length = this.eatNodes.length + this.delNodes.length;

    if (protocol < 6)
        writer.writeUInt32(length >>> 0);
    else
        writer.writeUInt16(length >>> 0);

    for (var i = 0, len = this.eatNodes.length; i < len; i++) {
        var node = this.eatNodes[i];
        writer.writeUInt32((node.nodeId ^ scrambleId) >>> 0);
    }
    for (var i = 0, len = this.delNodes.length; i < len; i++) {
        var node = this.delNodes[i];
        writer.writeUInt32((node.nodeId ^ scrambleId) >>> 0);
    }
};
