function UpdateNodes(destroyQueue, nodes, nonVisibleNodes, serverVersion) {
    this.destroyQueue = destroyQueue;
    this.nodes = nodes;
    this.nonVisibleNodes = nonVisibleNodes;
    this.serverVersion = serverVersion;
}

module.exports = UpdateNodes;

/* Package Setup (ID 16)
 * --------------------
 * 4 | setUint32 | ID
 * 4 | setInt32  | pos-X
 * 4 | setInt32  | pos-Y
 * 2 | setUint16 | size
 * 1 | setUint8  | color-R
 * 1 | setUint8  | color-G
 * 1 | setUint8  | color-B
 * 1 | setUint8  | flags (1:isVirus, 2:skip-fa, 4:read-fa, 16:isAgitated)
 * 4 | setUint32 | length of fa
 * ? | setUint8  | fa starting with a %
 * ? | setUint16 | name
 * 4 | setUint32 | end
 * 4 | setUint32 | number of blobs being removed
 * 4 | setUint32 | id player_id to remove
 */

UpdateNodes.prototype.build = function () {
    // Calculate nodes sub packet size before making the data view
    var nodesLength = 0;
    for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];

        if (typeof node == "undefined") {
            continue;
        }

        var skin = node.getPremium(),
            bits = 0;
        if (skin) bits = 1;

        if (this.serverVersion == 1)
            nodesLength = nodesLength + 20 + (node.getName().length * 2) + skin.length + bits;
        else
            nodesLength = nodesLength + 16 + (node.getName().length * 2) + skin.length + bits;
    }

    var buf = new ArrayBuffer(3 + (this.destroyQueue.length * 12) + (this.nonVisibleNodes.length * 4) + nodesLength + 8);
    var view = new DataView(buf);

    view.setUint8(0, 16, true); // Packet ID
    view.setUint16(1, this.destroyQueue.length, true); // Nodes to be destroyed

    var offset = 3;
    for (var i = 0; i < this.destroyQueue.length; i++) {
        var node = this.destroyQueue[i];

        if (!node) {
            continue;
        }

        var killer = 0;
        if (node.getKiller()) {
            killer = node.getKiller().nodeId;
        }

        view.setUint32(offset, killer, true); // Killer ID
        view.setUint32(offset + 4, node.nodeId, true); // Node ID

        offset += 8;
    }

    for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];

        if (typeof node == "undefined") {
            continue;
        }

        var name = node.getName(),
            skin = node.getPremium(),
            bits = 0;

        if (skin) {
            bits = 1;
        }

        if (this.serverVersion == 1) {
            view.setUint32(offset, node.nodeId, true);
            view.setInt32(offset + 4, node.position.x, true);
            view.setInt32(offset + 8, node.position.y, true);
            view.setUint16(offset + 12, node.getSize(), true);
            view.setUint8(offset + 14, node.color.r, true);
            view.setUint8(offset + 15, node.color.g, true);
            view.setUint8(offset + 16, node.color.b, true);
            view.setUint8(offset + 17, node.spiked | (bits << 2) | (node.agitated << 4), true);
            offset += 18;
        } else {
            view.setUint32(offset, node.nodeId, true);
            view.setUint16(offset + 4, node.position.x, true);
            view.setUint16(offset + 6, node.position.y, true);
            view.setUint16(offset + 8, node.getSize(), true);
            view.setUint8(offset + 10, node.color.r, true);
            view.setUint8(offset + 11, node.color.g, true);
            view.setUint8(offset + 12, node.color.b, true);
            view.setUint8(offset + 13, node.spiked | (bits << 2) | (node.agitated << 4), true);
            offset += 14;
        }

        // Skip name,  flag is | 1 << 1
        // view.setUint32(offset, skinname.length, true);
        // offset += 4

        if (bits) {
            for (var j = 0; j < skin.length; j++) {
                var c = skin.charCodeAt(j);
                if (c) {
                    view.setUint8(offset, c, true);
                }
                offset += 1;
            }
            view.setUint8(offset, 0, true);
            offset += 1;
        }

        if (name) {
            for (var j = 0; j < name.length; j++) {
                var c = name.charCodeAt(j);
                if (c) {
                    view.setUint16(offset, c, true);
                }
                offset += 2;
            }
        }

        view.setUint16(offset, 0, true); // End of string
        offset += 2;
    }

    var len = this.nonVisibleNodes.length + this.destroyQueue.length;
    view.setUint32(offset + 4, len, true); // # of non-visible nodes to destroy
    offset += 8;

    // Destroy queue + nonvisible nodes
    for (var i = 0; i < this.destroyQueue.length; i++) {
        var node = this.destroyQueue[i];

        if (!node) {
            continue;
        }

        view.setUint32(offset, node.nodeId, true);
        offset += 4;
    }
    for (var i = 0; i < this.nonVisibleNodes.length; i++) {
        var node = this.nonVisibleNodes[i];

        if (!node) {
            continue;
        }

        view.setUint32(offset, node.nodeId, true);
        offset += 4;
    }

    return buf;
};

