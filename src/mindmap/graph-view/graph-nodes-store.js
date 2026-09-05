/**
 * GraphNodesStore - persistence for graph-view-only nodes (manual/AI
 * conversation bubbles). Real card nodes live on the board and are derived
 * from arrow relations at view-open time; only view-generated nodes are
 * stored here.
 *
 * Data shape: { [nodeId]: { id, parentId, kind: 'manual'|'ai', title,
 * content, createdAt } }. The store is embedded into the InkSight project
 * payload (graphNodes field) so it travels with .inksight files and runtime
 * snapshots.
 */

const STORE_VERSION = 1;

function sanitizeNode(node) {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || typeof node.parentId !== 'string') {
        return null;
    }
    return {
        id: node.id,
        parentId: node.parentId,
        // 每个 annotation 的图谱视图相互独立：节点归属于打开时的根标注
        rootCardId: typeof node.rootCardId === 'string' ? node.rootCardId : null,
        kind: node.kind === 'ai' ? 'ai' : 'manual',
        title: typeof node.title === 'string' ? node.title : '延伸思考',
        content: typeof node.content === 'string' ? node.content : '',
        createdAt: Number.isFinite(node.createdAt) ? node.createdAt : Date.now()
    };
}

class GraphNodesStore {
    constructor() {
        this.version = STORE_VERSION;
        // nodeId -> node (non-card nodes only)
        this.nodes = new Map();
    }

    getPersistenceData() {
        return {
            version: this.version,
            nodes: Array.from(this.nodes.values())
        };
    }

    restorePersistenceData(data) {
        this.nodes = new Map();
        const list = Array.isArray(data?.nodes) ? data.nodes : [];
        list.forEach((raw) => {
            const node = sanitizeNode(raw);
            if (node) {
                this.nodes.set(node.id, node);
            }
        });
    }

    hasData() {
        return this.nodes.size > 0;
    }

    get(nodeId) {
        return this.nodes.get(nodeId) || null;
    }

    /**
     * Creates or updates a node and returns it.
     */
    upsert({ id, parentId, rootCardId = null, kind = 'manual', title, content = '', createdAt = Date.now() }) {
        if (!id || !parentId) {
            throw new Error('graph node requires id and parentId');
        }
        const node = {
            id,
            parentId,
            rootCardId: typeof rootCardId === 'string' ? rootCardId : null,
            kind: kind === 'ai' ? 'ai' : 'manual',
            title: typeof title === 'string' && title.trim() ? title.trim() : '延伸思考',
            content,
            createdAt
        };
        this.nodes.set(id, node);
        return node;
    }

    getAll() {
        return Array.from(this.nodes.values());
    }

    setTitle(nodeId, title) {
        const node = this.nodes.get(nodeId);
        if (!node) {
            return null;
        }
        node.title = typeof title === 'string' && title.trim() ? title.trim() : node.title;
        return node;
    }

    setContent(nodeId, content) {
        const node = this.nodes.get(nodeId);
        if (!node) {
            return null;
        }
        node.content = typeof content === 'string' ? content : node.content;
        return node;
    }

    /**
     * Removes a node and all of its descendants. Returns the removed ids.
     */
    removeSubtree(nodeId) {
        const removed = [];
        const collect = (id) => {
            if (!this.nodes.has(id)) {
                return;
            }
            this.nodes.delete(id);
            removed.push(id);
            this.nodes.forEach((node) => {
                if (node.parentId === id) {
                    collect(node.id);
                }
            });
        };
        collect(nodeId);
        return removed;
    }

    /**
     * Detaches a subtree from the store without deleting it — used when its
     * ancestor card node disappears from the board. Returns the detached
     * nodes with their parent rewritten to `newParentId`.
     */
    reattachSubtree(nodeId, newParentId) {
        if (!this.nodes.has(nodeId)) {
            return [];
        }
        const moved = [];
        const walk = (id) => {
            const node = this.nodes.get(id);
            if (!node) {
                return;
            }
            if (moved.length === 0) {
                node.parentId = newParentId;
            }
            moved.push(node);
            this.nodes.forEach((child) => {
                if (child.parentId === id) {
                    walk(child.id);
                }
            });
        };
        walk(nodeId);
        return moved;
    }

    clear() {
        this.nodes = new Map();
    }
}

export const graphNodesStore = new GraphNodesStore();
export { STORE_VERSION };
