/**
 * GraphNodesStore - persistence for graph-view-only nodes (manual/AI
 * conversation bubbles). Real card nodes live on the board and are derived
 * from arrow relations at view-open time; only view-generated nodes are
 * stored here.
 *
 * Data shape: { [nodeId]: { id, parentId, kind: 'manual'|'ai', title,
 * question, titleCustomized, content, createdAt } }. The store is embedded into the InkSight project
 * payload (graphNodes field) so it travels with .inksight files and runtime
 * snapshots.
 */

const STORE_VERSION = 3;

function sanitizeNode(node) {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || typeof node.parentId !== 'string') {
        return null;
    }
    const kind = node.kind === 'ai' ? 'ai' : 'manual';
    const title = typeof node.title === 'string' && node.title.trim()
        ? node.title.trim()
        : '延伸思考';
    return {
        id: node.id,
        parentId: node.parentId,
        // 每个 annotation 的图谱视图相互独立：节点归属于打开时的根标注
        rootCardId: typeof node.rootCardId === 'string' ? node.rootCardId : null,
        kind,
        title,
        // v1 stored the AI question in title. Preserve it during migration.
        question: typeof node.question === 'string'
            ? node.question.trim()
            : (kind === 'ai' ? title : ''),
        titleCustomized: node.titleCustomized === true,
        content: typeof node.content === 'string' ? node.content : '',
        createdAt: Number.isFinite(node.createdAt) ? node.createdAt : Date.now()
    };
}

class GraphNodesStore {
    constructor() {
        this.version = STORE_VERSION;
        // nodeId -> node (non-card nodes only)
        this.nodes = new Map();
        // rootCardId -> transient-looking but user-visible graph UI state.
        // Keeping it in the project payload lets the same graph reopen where
        // the user left it without mixing state between root annotations.
        this.viewStates = new Map();
    }

    getPersistenceData() {
        return {
            version: this.version,
            nodes: Array.from(this.nodes.values()),
            viewStates: Array.from(this.viewStates.entries()).map(([rootCardId, state]) => ({
                rootCardId,
                selectedNodeId: state.selectedNodeId,
                expandedNodeIds: Array.from(state.expandedNodeIds)
            }))
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
        this.viewStates = new Map();
        const states = Array.isArray(data?.viewStates) ? data.viewStates : [];
        states.forEach((raw) => {
            if (!raw || typeof raw.rootCardId !== 'string') return;
            this.viewStates.set(raw.rootCardId, {
                selectedNodeId: typeof raw.selectedNodeId === 'string' ? raw.selectedNodeId : null,
                expandedNodeIds: new Set(
                    Array.isArray(raw.expandedNodeIds)
                        ? raw.expandedNodeIds.filter((id) => typeof id === 'string')
                        : []
                )
            });
        });
    }

    hasData() {
        return this.nodes.size > 0 || this.viewStates.size > 0;
    }

    getViewState(rootCardId) {
        const state = this.viewStates.get(rootCardId);
        return state
            ? {
                selectedNodeId: state.selectedNodeId,
                expandedNodeIds: Array.from(state.expandedNodeIds)
            }
            : { selectedNodeId: null, expandedNodeIds: [] };
    }

    setSelectedNode(rootCardId, nodeId) {
        if (typeof rootCardId !== 'string') return;
        const state = this.viewStates.get(rootCardId) || {
            selectedNodeId: null,
            expandedNodeIds: new Set()
        };
        state.selectedNodeId = typeof nodeId === 'string' ? nodeId : null;
        this.viewStates.set(rootCardId, state);
    }

    setExpandedNode(rootCardId, nodeId, expanded) {
        if (typeof rootCardId !== 'string' || typeof nodeId !== 'string') return;
        const state = this.viewStates.get(rootCardId) || {
            selectedNodeId: null,
            expandedNodeIds: new Set()
        };
        if (expanded) {
            state.expandedNodeIds.add(nodeId);
        } else {
            state.expandedNodeIds.delete(nodeId);
        }
        this.viewStates.set(rootCardId, state);
    }

    get(nodeId) {
        return this.nodes.get(nodeId) || null;
    }

    /**
     * Creates or updates a node and returns it.
     */
    upsert({ id, parentId, rootCardId = null, kind = 'manual', title, question, titleCustomized = false, content = '', createdAt = Date.now() }) {
        if (!id || !parentId) {
            throw new Error('graph node requires id and parentId');
        }
        const normalizedKind = kind === 'ai' ? 'ai' : 'manual';
        const normalizedTitle = typeof title === 'string' && title.trim() ? title.trim() : '延伸思考';
        const node = {
            id,
            parentId,
            rootCardId: typeof rootCardId === 'string' ? rootCardId : null,
            kind: normalizedKind,
            title: normalizedTitle,
            question: typeof question === 'string'
                ? question.trim()
                : (normalizedKind === 'ai' ? normalizedTitle : ''),
            titleCustomized: titleCustomized === true,
            content,
            createdAt
        };
        this.nodes.set(id, node);
        return node;
    }

    getAll() {
        return Array.from(this.nodes.values());
    }

    setTitle(nodeId, title, { customized = true } = {}) {
        const node = this.nodes.get(nodeId);
        if (!node) {
            return null;
        }
        node.title = typeof title === 'string' && title.trim() ? title.trim() : node.title;
        node.titleCustomized = customized;
        return node;
    }

    setQuestion(nodeId, question) {
        const node = this.nodes.get(nodeId);
        const normalizedQuestion = typeof question === 'string' ? question.trim() : '';
        if (!node || !normalizedQuestion) {
            return null;
        }
        node.question = normalizedQuestion;
        if (!node.titleCustomized) {
            node.title = normalizedQuestion;
        }
        return node;
    }

    resetTitleToQuestion(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.question) {
            return null;
        }
        node.title = node.question;
        node.titleCustomized = false;
        return node;
    }

    setKind(nodeId, kind) {
        const node = this.nodes.get(nodeId);
        if (!node) {
            return null;
        }
        node.kind = kind === 'ai' ? 'ai' : 'manual';
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
        this.viewStates = new Map();
    }
}

export const graphNodesStore = new GraphNodesStore();
export { STORE_VERSION };
