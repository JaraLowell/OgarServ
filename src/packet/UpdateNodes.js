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
    for (var i = 0, llen = this.nodes.length; llen > i; i++) {
        var node = this.nodes[i];
        if ("undefined" != typeof node) {
            var extrabyte = 0;
            if(node.cellType == 0 && node.name == null) {
                node.getName();
            }

            if (node.skin) extrabyte = 1;

            if (this.serverVersion == 1) {
                nodesLength += 20 + extrabyte + (node.name.length * 2) + node.skin.length;
            } else {
                nodesLength += 16 + extrabyte + (node.name.length * 2) + node.skin.length;
            }
        }
    }

    var lendes = this.destroyQueue.length;
    var buf = new ArrayBuffer(3 + (lendes * 12) + (this.nonVisibleNodes.length * 4) + nodesLength + 8);
    var view = new DataView(buf);

    // Killer List
    view.setUint8(0, 16, true); // Packet ID
    view.setUint16(1, lendes, true); // Nodes to be destroyed
    var offset = 3;
    for (var i = 0; i < lendes; i++) {
        var node = this.destroyQueue[i];

        if (!node) continue;

        var killer = 0;
        if (node.getKiller()) killer = node.getKiller().nodeId;

        view.setUint32(offset, killer, true); // Killer ID
        view.setUint32(offset + 4, node.nodeId, true); // Node ID

        offset += 8;
    }

    // Player List
    for (var i = 0, llen = this.nodes.length; i < llen; i++) {
        var node = this.nodes[i];

        if (typeof node == "undefined") continue;

        var skin = node.skin,
            name = node.name,
            bits = 0,
            agitated = node.agitated;

        if (skin) {
            bits = 1;
            agitated = 0;
        }

        if (this.serverVersion == 1) {
            view.setUint32(offset, node.nodeId, true);
            view.setInt32(offset + 4, node.position.x, true);
            view.setInt32(offset + 8, node.position.y, true);
            view.setInt16(offset + 12, node.getSize(), true);
            view.setUint8(offset + 14, node.color.r, true);
            view.setUint8(offset + 15, node.color.g, true);
            view.setUint8(offset + 16, node.color.b, true);
            view.setUint8(offset + 17, (node.spiked | (bits << 2) | (agitated << 4)), true);
            offset += 18;
        } else {
            view.setUint32(offset, node.nodeId, true);
            view.setUint16(offset + 4, node.position.x, true);
            view.setUint16(offset + 6, node.position.y, true);
            view.setInt16(offset + 8, node.getSize(), true);
            view.setUint8(offset + 10, node.color.r, true);
            view.setUint8(offset + 11, node.color.g, true);
            view.setUint8(offset + 12, node.color.b, true);
            view.setUint8(offset + 13, (node.spiked | (bits << 2) | (agitated << 4)), true);
            offset += 14;
        }

        if (bits) {
            for (var j = 0,klen = skin.length; j < klen; j++) {
                var c = skin.charCodeAt(j);
                if (c) {
                    view.setUint8(offset, c, true);
                }
                offset++;
            }
            view.setUint8(offset, 0, true);
            offset++;
        }

        if (name) {
            for (var j = 0, klen = name.length; j < klen; j++) {
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

    var lenvis = this.nonVisibleNodes.length;
    view.setUint32(offset + 4, (lenvis + lendes), true); // # of non-visible nodes to destroy
    offset += 8;

    // Destroy queue
    for (var i = 0; i < lendes; i++) {
        view.setUint32(offset, this.destroyQueue[i].nodeId, true);
        offset += 4;
    }

    // Nonvisible nodes
    for (var i = 0; i < lenvis; i++) {
        view.setUint32(offset, this.nonVisibleNodes[i].nodeId, true);
        offset += 4;
    }

    return buf;
};
