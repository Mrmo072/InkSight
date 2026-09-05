import { hierarchy, tree as d3tree } from 'd3-hierarchy';
import {
    forceCollide,
    forceManyBody,
    forceSimulation,
    forceX,
    forceY
} from 'd3-force';
import { buildGraphTree } from './graph-tree.js';
import { graphNodesStore } from './graph-nodes-store.js';
import { cancelBoardCardFlash } from '../drawnix-board-interactions.js';
import { getAppContext } from '../../app/app-context.js';
import { aiConfigManager } from '../../core/ai-config-manager.js';
import { chatComplete } from '../../core/ai-client.js';
import { modalManager } from '../../ui/modal-manager.js';
import { emitAppNotification } from '../../ui/app-notifications.js';
import { marked } from 'marked';
import './graph-view.css';

const NS = 'http://www.w3.org/2000/svg';

function escapelessText(parent, text) {
    parent.appendChild(document.createTextNode(text));
}

class GraphViewController {
    constructor() {
        this.isOpen = false;
        this.overlay = null;
        this.simulation = null;
        this.nodes = [];
        this.links = [];
        this.rawTree = null;
        this.childNodesByNodeId = null;
        this.transform = { x: 0, y: 0, scale: 1 };
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.selectedTextContext = null;
        this.justClickedMarkTimestamp = 0;
        this.edgeItems = new Map();
    }

    mount() {
        if (this.overlay) {
            return;
        }

        const container = document.getElementById('mindmap-container');
        if (!container) {
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'graph-view';
        overlay.innerHTML = `
            <div class="graph-view__hud">
                <button type="button" class="graph-view__back">
                    <span>←</span> 返回脑图
                </button>
                <div class="graph-view__title"></div>
            </div>
            <div class="graph-view__controls">
                <button type="button" class="graph-view__btn graph-view__center">
                    ◎ 居中视图
                </button>
            </div>
            <div class="graph-view__viewport">
                <div class="graph-view__world">
                    <svg class="graph-view__svg"><g class="graph-view__edges"></g></svg>
                    <div class="graph-view__nodes"></div>
                </div>
            </div>
            <div class="graph-view__dialog" hidden>
                <div class="graph-view__dialog-card">
                    <div class="graph-view__dialog-title">延伸思考</div>
                    <textarea class="graph-view__dialog-input" rows="3"
                        placeholder="输入要传递给 AI 的问题…（Enter 发送，Shift+Enter 换行）"></textarea>
                    <div class="graph-view__dialog-actions">
                        <button type="button" class="graph-view__dialog-btn" data-action="cancel">取消</button>
                        <button type="button" class="graph-view__dialog-btn" data-action="manual">仅创建节点</button>
                        <button type="button" class="graph-view__dialog-btn graph-view__dialog-btn--primary" data-action="ai">AI 回答</button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(overlay);
        this.overlay = overlay;

        // 选区胶囊挂到 body：面板祖先链上的 transform 会劫持 fixed 定位
        const selectionPill = document.createElement('div');
        selectionPill.className = 'graph-view__pill';
        selectionPill.textContent = '延伸思考节点';
        document.body.appendChild(selectionPill);
        this.selectionPill = selectionPill;

        this.viewport = overlay.querySelector('.graph-view__viewport');
        this.world = overlay.querySelector('.graph-view__world');
        this.nodesContainer = overlay.querySelector('.graph-view__nodes');
        this.edgesLayer = overlay.querySelector('.graph-view__edges');
        this.titleEl = overlay.querySelector('.graph-view__title');
        this.dialogEl = overlay.querySelector('.graph-view__dialog');
        this.dialogInput = overlay.querySelector('.graph-view__dialog-input');
        this.dialogTitleEl = overlay.querySelector('.graph-view__dialog-title');
        this.dialogContext = null;

        overlay.querySelector('.graph-view__back').addEventListener('click', () => this.close());
        overlay.querySelector('.graph-view__center').addEventListener('click', () => {
            const root = this.nodes?.[0];
            if (root) {
                this.focusOnNode(root.id, 'self');
            }
        });

        this.dialogEl.addEventListener('click', (e) => {
            if (e.target === this.dialogEl) {
                this.hideDialog();
                return;
            }
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) {
                return;
            }
            e.stopPropagation();
            if (action === 'cancel') {
                this.hideDialog();
            } else if (action === 'ai') {
                this.submitExtendDialog('ai');
            } else if (action === 'manual') {
                this.submitExtendDialog('manual');
            }
        });
        this.dialogInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // 有选区的上下文默认走 AI 回答，手动添加默认创建普通节点
                this.submitExtendDialog(this.dialogContext?.range ? 'ai' : 'manual');
            }
        });

        this.viewport.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.graph-bubble') || e.target.closest('.graph-view__pill')) return;
            this.isPanning = true;
            this.panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
            this.viewport.classList.add('panning');
        });

        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        this.viewport.addEventListener('wheel', this.onWheel, { passive: false });
        document.addEventListener('pointerdown', this.onPointerDownCapture, true);
        document.addEventListener('selectionchange', this.onSelectionChange);
        document.addEventListener('keydown', this.onKeyDown);
        this.selectionPill.addEventListener('click', () => this.showExtendDialog());
    }

    onPointerMove = (e) => {
        if (!this.isOpen || !this.isPanning) return;
        this.transform.x = e.clientX - this.panStart.x;
        this.transform.y = e.clientY - this.panStart.y;
        this.applyTransform();
    };

    onPointerUp = () => {
        if (!this.isPanning) return;
        this.isPanning = false;
        this.viewport?.classList.remove('panning');
    };

    onWheel = (e) => {
        if (!this.isOpen) return;
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        const newScale = Math.min(Math.max(this.transform.scale * zoomFactor, 0.4), 2.2);
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        this.transform.x = mouseX - (mouseX - this.transform.x) * (newScale / this.transform.scale);
        this.transform.y = mouseY - (mouseY - this.transform.y) * (newScale / this.transform.scale);
        this.transform.scale = newScale;
        this.applyTransform();
    };

    onPointerDownCapture = (e) => {
        if (!this.isOpen) return;
        const mark = e.target.closest('mark.graph-mark');
        if (mark) {
            const targetChildId = mark.getAttribute('data-target-id');
            const parentCard = mark.closest('.graph-bubble');
            if (targetChildId) {
                e.preventDefault();
                e.stopPropagation();
                this.justClickedMarkTimestamp = Date.now();
                this.triggerJumpToChild(targetChildId, parentCard ? parentCard.dataset.cardId : null);
            }
            return;
        }

        if (!this.selectionPill.contains(e.target) && !e.target.closest('.graph-bubble__body')) {
            this.selectionPill.style.display = 'none';
        }
    };

    onSelectionChange = () => {
        if (!this.isOpen) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;

        const text = sel.toString().trim();
        if (text.length === 0) return;

        const range = sel.getRangeAt(0);
        const containerBubble = range.commonAncestorContainer.nodeType === 1
            ? range.commonAncestorContainer.closest('.graph-bubble')
            : range.commonAncestorContainer.parentElement?.closest('.graph-bubble');

        if (!containerBubble) {
            this.selectionPill.style.display = 'none';
            return;
        }

        const rect = range.getBoundingClientRect();
        this.selectedTextContext = {
            text,
            parentId: containerBubble.dataset.cardId,
            range: range.cloneRange()
        };

        this.selectionPill.style.display = 'flex';
        this.selectionPill.style.left = `${rect.left + rect.width / 2}px`;
        this.selectionPill.style.top = `${rect.top - 12}px`;
    };

    onKeyDown = (e) => {
        if (!this.isOpen || e.key !== 'Escape') return;
        if (this.dialogEl && !this.dialogEl.hidden) {
            this.hideDialog();
            return;
        }
        if (document.querySelector('.modal-overlay.active')) return;
        this.close();
    };

    open({ rootCardId }) {
        return this._open(rootCardId);
    }

    _open(rootCardId) {
        this.mount();
        if (!this.overlay) return false;

        const context = getAppContext();
        const board = context?.board;
        const getCardById = (id) => context?.cardSystem?.cards.get(id) || null;

        const result = buildGraphTree({ board, getCardById, rootCardId });
        if (!result) {
            return false;
        }

        this.rawTree = result.tree;
        this.rebuildTreeIndex();
        this.mergePersistedNodes();
        this.nodes = [];
        this.links = [];
        this.transform = { x: 0, y: 0, scale: 1 };
        this.clearGraphDom();

        this.titleEl.textContent = this.rawTree.tag;
        this.calculateLayout();
        this.renderGraph();
        this.setupSimulation();

        // 根气泡居中。容器可能刚从隐藏切换为可见（尺寸仍为 0 或在过渡中），
        // 用 rAF 循环等尺寸就绪后再定位，尺寸稳定后停止。
        this._centered = false;
        this._lastViewportSize = null;
        requestAnimationFrame(() => this.centerRootLoop());

        this.isOpen = true;
        this.overlay.classList.add('active');
        // 双击标注会先触发单击的节点闪烁定位，开图后它毫无意义，取消之
        cancelBoardCardFlash(context?.board);
        return true;
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.overlay.classList.remove('active');
        this.selectionPill.style.display = 'none';
        this.hideDialog();
        this.simulation?.stop();
        this.simulation = null;
        this.rawTree = null;
        this.childNodesByNodeId = null;
        this.nodeById = null;
        this.parentByNodeId = null;
        this.nodes = [];
        this.links = [];
        this.selectedTextContext = null;
        this.clearGraphDom();
        window.getSelection()?.removeAllRanges();
    }

    clearGraphDom() {
        if (!this.overlay) return;
        this.nodesContainer.innerHTML = '';
        this.edgesLayer.innerHTML = '';
        this.edgeItems.clear();
    }

    /**
     * Rebuilds lookup indexes (children / parent / node maps) from rawTree.
     * Card-derived nodes are marked kind 'card'; persisted nodes merged in
     * afterwards carry their own kind.
     */
    rebuildTreeIndex() {
        this.childNodesByNodeId = new Map();
        this.nodeById = new Map();
        this.parentByNodeId = new Map();
        const walk = (node, parentId) => {
            node.kind = node.kind || 'card';
            this.nodeById.set(node.id, node);
            this.parentByNodeId.set(node.id, parentId);
            this.childNodesByNodeId.set(node.id, node.children || []);
            (node.children || []).forEach((child) => walk(child, node.id));
        };
        walk(this.rawTree, null);
    }

    /**
     * Merges persisted graph-view nodes (manual/AI) into the freshly derived
     * card tree. Nodes are scoped to the root annotation they were created
     * under, so each annotation's graph view stays independent. Nodes whose
     * parent chain no longer exists on the board are reattached to the root
     * so their content is never lost.
     */
    mergePersistedNodes() {
        if (!graphNodesStore.hasData()) {
            return;
        }

        const rootId = this.rawTree.id;
        const persisted = graphNodesStore.getAll().filter((n) => !n.rootCardId || n.rootCardId === rootId);
        if (persisted.length === 0) {
            return;
        }
        const persistedIds = new Set(persisted.map((n) => n.id));
        const toTreeNode = (n) => ({
            id: n.id,
            tag: n.title,
            text: n.content || '（无内容）',
            color: n.kind === 'ai' ? '#a855f7' : '#38bdf8',
            kind: n.kind,
            children: []
        });

        const childrenByParent = new Map();
        persisted.forEach((n) => {
            const list = childrenByParent.get(n.parentId) || [];
            list.push(n);
            childrenByParent.set(n.parentId, list);
        });

        const attach = (storeNode, parentTreeNode) => {
            const treeNode = toTreeNode(storeNode);
            parentTreeNode.children.push(treeNode);
            (childrenByParent.get(storeNode.id) || []).forEach((child) => attach(child, treeNode));
        };

        persisted
            .filter((n) => !persistedIds.has(n.parentId) && !this.nodeById.has(n.parentId))
            .forEach((orphan) => attach(orphan, this.rawTree));

        // parentId 指向树上真实节点（卡片或已挂载的持久化节点）的剩余分支
        const attachExisting = (treeNode) => {
            (childrenByParent.get(treeNode.id) || []).forEach((storeNode) => {
                if (treeNode.children.some((child) => child.id === storeNode.id)) {
                    return;
                }
                attach(storeNode, treeNode);
            });
            (treeNode.children || []).forEach(attachExisting);
        };
        attachExisting(this.rawTree);

        this.rebuildTreeIndex();
    }

    applyTreeChange() {
        this.rebuildTreeIndex();
        this.calculateLayout();
        this.renderGraph();
        this.simulation.nodes(this.nodes);
        this.simulation.alpha(0.7).restart();
    }

    /**
     * Creates a persisted child node under parentId and refreshes the view.
     * Returns the view node.
     */
    createChildNode({ parentId, title, content = '', kind = 'manual' }) {
        const id = `gv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const storeNode = graphNodesStore.upsert({
            id,
            parentId,
            rootCardId: this.rawTree?.id || null,
            kind,
            title,
            content
        });
        const parentTreeNode = this.nodeById.get(parentId);
        if (!parentTreeNode) {
            return null;
        }

        const treeNode = {
            id: storeNode.id,
            tag: storeNode.title,
            text: storeNode.content || '（无内容）',
            color: storeNode.kind === 'ai' ? '#a855f7' : '#38bdf8',
            kind: storeNode.kind,
            children: []
        };
        parentTreeNode.children.push(treeNode);
        this.applyTreeChange();
        return treeNode;
    }

    /**
     * Removes a view node subtree (persisted nodes only — card nodes are
     * owned by the board).
     */
    deleteSubtree(nodeId) {
        const treeNode = this.nodeById.get(nodeId);
        if (!treeNode || treeNode.kind === 'card') {
            return;
        }
        const parentId = this.parentByNodeId.get(nodeId);
        const parentTreeNode = this.parentByNodeId.get(nodeId) ? this.nodeById.get(parentId) : null;
        if (parentTreeNode) {
            parentTreeNode.children = parentTreeNode.children.filter((child) => child.id !== nodeId);
        }
        graphNodesStore.removeSubtree(nodeId);
        this.applyTreeChange();
    }

    /**
     * Builds the AI conversation messages for a new question under parentId:
     * every ancestor up to the root contributes context (card nodes as
     * excerpt context, AI nodes as prior user/assistant turns).
     */
    buildConversation(parentId, question) {
        const chain = [];
        let cursor = parentId;
        while (cursor) {
            const node = this.nodeById.get(cursor);
            if (!node) {
                break;
            }
            chain.unshift(node);
            cursor = this.parentByNodeId.get(cursor);
        }

        const messages = [];
        chain.forEach((node) => {
            if (node.kind === 'ai') {
                messages.push({ role: 'user', content: node.tag });
                messages.push({ role: 'assistant', content: node.text });
            } else {
                messages.push({ role: 'user', content: `[文献摘录｜${node.tag}]\n${node.text}` });
            }
        });
        messages.push({ role: 'user', content: question });

        // Anthropic/Gemini 需要相邻消息角色交替，合并连续同角色消息
        const merged = [];
        messages.forEach((message) => {
            const last = merged[merged.length - 1];
            if (last && last.role === message.role) {
                last.content = `${last.content}\n\n${message.content}`;
            } else {
                merged.push({ ...message });
            }
        });
        return merged;
    }

    calculateLayout() {
        const hierarchyRoot = hierarchy(this.rawTree);
        const treeLayout = d3tree().nodeSize([150, 410]);
        treeLayout(hierarchyRoot);

        const d3Nodes = hierarchyRoot.descendants();
        const d3Links = hierarchyRoot.links();

        let minY = Infinity;
        d3Nodes.forEach((d) => { if (d.x < minY) minY = d.x; });
        const verticalOffset = (this.viewport.clientHeight / 2) - (minY < 0 ? minY : 0);

        const existingMap = new Map(this.nodes.map((n) => [n.id, n]));

        this.nodes = d3Nodes.map((d) => {
            const targetX = 220 + d.y;
            const targetY = verticalOffset + d.x;
            const existing = existingMap.get(d.data.id);

            if (existing) {
                existing.targetX = targetX;
                existing.targetY = targetY;
                existing.tag = d.data.tag;
                existing.text = d.data.text;
                existing.color = d.data.color;
                existing.kind = d.data.kind;
                return existing;
            }

            const parentNode = d.parent ? existingMap.get(d.parent.data.id) : null;
            return {
                id: d.data.id,
                tag: d.data.tag,
                text: d.data.text,
                color: d.data.color,
                kind: d.data.kind,
                targetX,
                targetY,
                x: parentNode ? parentNode.x + 40 : targetX,
                y: parentNode ? parentNode.y : targetY,
                vx: 0,
                vy: 0
            };
        });

        this.links = d3Links.map((d) => ({
            source: d.source.data.id,
            target: d.target.data.id
        }));
    }

    setupSimulation() {
        this.simulation?.stop();
        this.simulation = forceSimulation(this.nodes)
            .force('x', forceX((d) => d.targetX).strength(0.35))
            .force('y', forceY((d) => d.targetY).strength(0.35))
            .force('collide', forceCollide().radius(155).iterations(4))
            .force('charge', forceManyBody().strength(-80))
            .alphaDecay(0.04);

        this.simulation.on('tick', () => this.onSimulationTick());
    }

    onSimulationTick() {
        this.nodes.forEach((node) => {
            const el = document.getElementById(this.domId(node.id));
            if (el) {
                el.style.left = `${node.x}px`;
                el.style.top = `${node.y}px`;
            }
        });
        this.syncBezierEdges();
    }

    domId(cardId) {
        return `graph-node-${cardId}`;
    }

    syncBezierEdges() {
        const nodeMap = new Map(this.nodes.map((n) => [n.id, n]));

        this.edgeItems.forEach((item, key) => {
            const [sourceId, targetId] = key.split('->');
            const sourceNode = nodeMap.get(sourceId);
            const targetNode = nodeMap.get(targetId);
            if (!sourceNode || !targetNode) return;

            const sx = sourceNode.x + 135;
            const sy = sourceNode.y;
            const tx = targetNode.x - 135;
            const ty = targetNode.y;

            const curvature = Math.max((tx - sx) * 0.5, 45);
            const pathData = `M ${sx} ${sy} C ${sx + curvature} ${sy}, ${tx - curvature} ${ty}, ${tx} ${ty}`;

            item.main.setAttribute('d', pathData);
            item.pulse.setAttribute('d', pathData);
        });
    }

    renderGraph() {
        this.links.forEach((link) => {
            const key = `${link.source}->${link.target}`;
            if (this.edgeItems.has(key)) return;

            const g = document.createElementNS(NS, 'g');
            const main = document.createElementNS(NS, 'path');
            main.setAttribute('class', 'graph-link');
            const pulse = document.createElementNS(NS, 'path');
            pulse.setAttribute('class', 'graph-link-pulse');
            g.appendChild(main);
            g.appendChild(pulse);
            this.edgesLayer.appendChild(g);
            this.edgeItems.set(key, { main, pulse });
        });

        this.nodes.forEach((node) => {
            let el = document.getElementById(this.domId(node.id));
            if (!el) {
                el = this.createBubble(node);
                this.nodesContainer.appendChild(el);
            } else {
                el.querySelector('.graph-bubble__tag-title').textContent = node.tag;
            }
        });

        this.syncBezierEdges();
    }

    createBubble(node) {
        const el = document.createElement('div');
        el.id = this.domId(node.id);
        el.className = 'graph-bubble';
        el.dataset.cardId = node.id;
        el.dataset.kind = node.kind || 'card';

        const header = document.createElement('div');
        header.className = 'graph-bubble__header';

        const tag = document.createElement('div');
        tag.className = 'graph-bubble__tag';
        if (node.color) {
            const dot = document.createElement('span');
            dot.className = 'graph-bubble__color-dot';
            dot.style.backgroundColor = node.color;
            tag.appendChild(dot);
        }
        const tagTitle = document.createElement('span');
        tagTitle.className = 'graph-bubble__tag-title';
        escapelessText(tagTitle, node.tag);
        if (node.kind && node.kind !== 'card') {
            tagTitle.title = '点击修改标题';
            tagTitle.classList.add('graph-bubble__tag-title--editable');
            tagTitle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startTitleEdit(node.id, tagTitle);
            });
        } else {
            tagTitle.title = '卡片节点标题由来源文档管理';
        }
        tag.appendChild(tagTitle);

        const headerActions = document.createElement('div');
        headerActions.className = 'graph-bubble__actions';

        const addChildBtn = document.createElement('button');
        addChildBtn.type = 'button';
        addChildBtn.className = 'graph-bubble__action-btn';
        addChildBtn.textContent = '＋';
        addChildBtn.title = '创建子节点';
        addChildBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const childNode = this.createChildNode({
                parentId: node.id,
                title: '新思考节点',
                content: '（待补充）',
                kind: 'manual'
            });
            if (childNode) {
                // 飞向新节点并直接进入标题编辑
                setTimeout(() => {
                    this.triggerJumpToChild(childNode.id, node.id);
                    const tagTitle = document.querySelector(
                        `#${CSS.escape(this.domId(childNode.id))} .graph-bubble__tag-title`
                    );
                    if (tagTitle) {
                        this.startTitleEdit(childNode.id, tagTitle);
                    }
                }, 100);
            }
        });
        headerActions.appendChild(addChildBtn);

        // 手动/AI 节点支持用标题作为问题调用 AI 填充内容
        if (node.kind && node.kind !== 'card') {
            const aiFillBtn = document.createElement('button');
            aiFillBtn.type = 'button';
            aiFillBtn.className = 'graph-bubble__action-btn graph-bubble__action-btn--ai';
            aiFillBtn.textContent = '✨';
            aiFillBtn.title = '以标题为问题，调用 AI 生成内容';
            aiFillBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                // 以树节点的实时标题为准（视图节点可能因刚编辑而不同步）
                const treeNode = this.nodeById?.get(node.id);
                if (!treeNode || treeNode.tag === '新思考节点' || !treeNode.tag?.trim()) {
                    emitAppNotification({ message: '请先把标题改写成你要问 AI 的问题', level: 'info' });
                    return;
                }
                const parentId = this.parentByNodeId?.get(node.id) || null;
                await this.requestAiAnswer(treeNode, treeNode.tag, parentId);
            });
            headerActions.appendChild(aiFillBtn);
        }

        if (node.id !== this.rawTree?.id && node.kind !== 'card') {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'graph-bubble__action-btn graph-bubble__action-btn--danger';
            deleteBtn.textContent = '🗑';
            deleteBtn.title = '删除此节点及其所有子节点';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmed = await modalManager.confirm({
                    title: '删除思考分支',
                    message: '将删除该节点及其所有子节点（脑图上的卡片节点不受影响）。确定删除？',
                    confirmLabel: '删除',
                    cancelLabel: '取消',
                    danger: true
                });
                if (confirmed) {
                    this.deleteSubtree(node.id);
                }
            });
            headerActions.appendChild(deleteBtn);
        }

        const dragIcon = document.createElement('span');
        dragIcon.className = 'graph-bubble__drag-icon';
        dragIcon.textContent = '⠿';

        header.appendChild(tag);
        header.appendChild(headerActions);
        header.appendChild(dragIcon);

        const body = document.createElement('div');
        body.className = 'graph-bubble__body graph-bubble__body--md';
        body.innerHTML = marked.parse(node.text || '');
        // Markdown 链接在新标签页打开，避免污染画布会话
        body.addEventListener('click', (e) => {
            const anchor = e.target.closest('a');
            if (anchor?.href) {
                e.preventDefault();
                window.open(anchor.href, '_blank', 'noopener');
            }
        });

        el.appendChild(header);
        el.appendChild(body);

        this.bindNodeDrag(header, node.id);

        // 双击标题区/边缘切换放大态；正文内双击保留原生选词。
        // 放大的气泡更宽，需同步放大其碰撞半径并重启模拟，避免与其他气泡重叠。
        header.addEventListener('dblclick', (e) => {
            if (e.target.closest('.graph-bubble__action-btn')) return;
            const expanded = el.classList.toggle('graph-bubble--expanded');
            const viewNode = this.nodes.find((n) => n.id === node.id);
            if (viewNode) {
                viewNode.expanded = expanded;
                // 圆形碰撞需覆盖矩形对角线，否则放大气泡的角落仍会压到相邻气泡
                const rect = el.getBoundingClientRect();
                viewNode.collideRadius = expanded
                    ? Math.hypot(rect.width, rect.height) / 2 + 12
                    : 155;
                this.simulation?.force(
                    'collide',
                    forceCollide().radius((d) => d.collideRadius || 155).iterations(4)
                );
                this.simulation?.alpha(0.6).restart();
            }
        });

        el.addEventListener('pointerup', (e) => {
            if (Date.now() - this.justClickedMarkTimestamp < 350) return;
            const sel = window.getSelection();
            if (sel && sel.toString().trim().length > 0) return;

            if (e.target.closest('.graph-bubble__header') || e.target === el) {
                this.focusOnNode(node.id, 'self');
            }
        });

        return el;
    }

    startTitleEdit(nodeId, tagTitle) {
        const treeNode = this.nodeById?.get(nodeId);
        if (!treeNode || tagTitle.querySelector('input')) {
            return;
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'graph-bubble__title-input';
        input.value = treeNode.tag;
        tagTitle.replaceChildren(input);
        input.focus();
        input.select();

        const commit = () => {
            const nextTitle = input.value.trim();
            if (nextTitle && nextTitle !== treeNode.tag) {
                treeNode.tag = nextTitle;
                graphNodesStore.setTitle(nodeId, nextTitle);
                // 同步视图节点，避免其他交互读到过期标题
                const viewNode = this.nodes.find((n) => n.id === nodeId);
                if (viewNode) {
                    viewNode.tag = nextTitle;
                }
            }
            tagTitle.replaceChildren();
            escapelessText(tagTitle, treeNode.tag);
        };

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                tagTitle.replaceChildren();
                escapelessText(tagTitle, treeNode.tag);
            }
        });
        input.addEventListener('blur', commit);
    }

    bindNodeDrag(dragHandle, nodeId) {
        dragHandle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            const activeNode = this.nodes.find((n) => n.id === nodeId);
            if (!activeNode) return;

            let isDragging = false;
            const startScreenX = e.clientX;
            const startScreenY = e.clientY;
            const initialNodeX = activeNode.x;
            const initialNodeY = activeNode.y;

            const onPointerMove = (moveEvent) => {
                const dist = Math.hypot(moveEvent.clientX - startScreenX, moveEvent.clientY - startScreenY);
                if (dist > 4) {
                    isDragging = true;
                    this.simulation?.alpha(0.85).alphaTarget(0.35).restart();

                    const currentScale = this.transform.scale;
                    const dx = (moveEvent.clientX - startScreenX) / currentScale;
                    const dy = (moveEvent.clientY - startScreenY) / currentScale;

                    activeNode.fx = initialNodeX + dx;
                    activeNode.fy = initialNodeY + dy;
                }
            };

            const onPointerUp = () => {
                if (isDragging) {
                    this.simulation?.alphaTarget(0);
                    activeNode.fx = null;
                    activeNode.fy = null;
                }
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
            };

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });
    }

    triggerJumpToChild(childId, fromParentId) {
        if (fromParentId) {
            const item = this.edgeItems.get(`${fromParentId}->${childId}`);
            if (item) {
                item.main.classList.add('graph-link--active');
                setTimeout(() => item.main.classList.remove('graph-link--active'), 1500);
            }
        }
        this.focusOnNode(childId, 'child');
    }

    /**
     * Wraps the selected range in one or more marks. Unlike
     * range.surroundContents, this also works when the selection spans
     * multiple DOM elements (e.g. markdown-generated <p>/<code> nodes):
     * every participating text node's covered segment gets its own mark
     * clone sharing the same data-target-id.
     */
    wrapRangeWithMark(range, mark) {
        if (!range || range.collapsed) {
            return false;
        }

        const root = range.commonAncestorContainer.nodeType === 1
            ? range.commonAncestorContainer
            : range.commonAncestorContainer.parentNode;

        const textNodes = [];
        if (range.startContainer === range.endContainer && range.startContainer.nodeType === 3) {
            textNodes.push(range.startContainer);
        } else {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => (range.intersectsNode(node) && node.textContent.length
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT)
            });
            let current;
            while ((current = walker.nextNode())) {
                textNodes.push(current);
            }
        }

        let wrappedAny = false;
        textNodes.forEach((textNode) => {
            const start = textNode === range.startContainer ? range.startOffset : 0;
            const end = textNode === range.endContainer ? range.endOffset : textNode.textContent.length;
            if (end <= start) {
                return;
            }

            const middle = start > 0 ? textNode.splitText(start) : textNode;
            if (end - start < middle.textContent.length) {
                middle.splitText(end - start);
            }

            const wrapped = mark.cloneNode();
            middle.parentNode.insertBefore(wrapped, middle);
            wrapped.appendChild(middle);
            wrappedAny = true;
        });

        return wrappedAny;
    }

    showExtendDialog() {
        const ctx = this.selectedTextContext;
        if (!ctx || !this.rawTree) return;
        this.openDialog(ctx, '延伸思考', ctx.text || '');
    }

    openDialog(context, titleText, prefill = '') {
        this.dialogContext = context;
        this.dialogTitleEl.textContent = titleText;
        this.dialogInput.value = prefill;
        this.dialogEl.hidden = false;
        this.dialogInput.focus();
        this.dialogInput.select();
    }

    hideDialog() {
        if (!this.dialogEl) return;
        this.dialogEl.hidden = true;
        this.dialogContext = null;
        this.dialogInput.value = '';
    }

    submitExtendDialog(mode) {
        const ctx = this.dialogContext;
        const question = (this.dialogInput?.value || '').trim();
        if (!ctx || !question) {
            return;
        }
        const { parentId, range } = ctx;
        this.hideDialog();

        // 选中文本包裹为可跳转的 mark，指向新生成的子节点
        const node = this.createChildNode({
            parentId,
            title: question,
            content: mode === 'ai' ? '（AI 思考中…）' : '（待补充）',
            kind: mode === 'ai' ? 'ai' : 'manual'
        });
        if (!node) {
            return;
        }

        if (range) {
            const mark = document.createElement('mark');
            mark.className = 'graph-mark';
            mark.setAttribute('data-target-id', node.id);
            mark.title = '点击跳转追踪此思考分支';
            this.wrapRangeWithMark(range, mark);
        }

        this.selectionPill.style.display = 'none';
        window.getSelection().removeAllRanges();
        this.selectedTextContext = null;

        setTimeout(() => {
            this.triggerJumpToChild(node.id, parentId);
        }, 100);

        if (mode === 'ai') {
            void this.requestAiAnswer(node, question, parentId);
        }
    }

    async requestAiAnswer(treeNode, question, parentId) {
        const config = aiConfigManager.get();
        if (!aiConfigManager.isConfigured()) {
            this.updateNodeContent(treeNode.id, '（AI 接口未配置：请在设置中填写接口地址、API Key 和模型名）');
            emitAppNotification({ message: 'AI 接口尚未配置，已在设置中新增“AI 接口”分组', level: 'warning' });
            return;
        }

        const bubbleEl = document.getElementById(this.domId(treeNode.id));
        bubbleEl?.classList.add('graph-bubble--loading');

        try {
            const answer = await chatComplete(config, {
                system: '你是深度阅读助手。用户正在阅读文献并对摘录内容做渐进式思考。请基于给定的文献摘录上下文和此前的思考对话，回答用户的新问题；回答应简明、紧扣上下文。',
                messages: this.buildConversation(parentId, question)
            });
            this.updateNodeContent(treeNode.id, answer);
        } catch (error) {
            this.updateNodeContent(treeNode.id, `（AI 请求失败：${error.message}）`);
            emitAppNotification({ message: `AI 请求失败：${error.message}`, level: 'error' });
        } finally {
            bubbleEl?.classList.remove('graph-bubble--loading');
        }
    }

    updateNodeContent(nodeId, text) {
        const treeNode = this.nodeById?.get(nodeId);
        if (!treeNode) return;
        treeNode.text = text;
        graphNodesStore.setContent(nodeId, text);
        const body = document.querySelector(`#${CSS.escape(this.domId(nodeId))} .graph-bubble__body`);
        if (body) {
            body.innerHTML = marked.parse(text || '');
        }
    }

    focusOnNode(nodeId, type = 'child') {
        const targetNode = this.nodes.find((n) => n.id === nodeId);
        if (!targetNode) return;

        const cardEl = document.getElementById(this.domId(nodeId));
        if (cardEl) {
            cardEl.classList.remove('graph-bubble--targeted-child', 'graph-bubble--targeted-self');
            void cardEl.offsetWidth;
            cardEl.classList.add(type === 'child'
                ? 'graph-bubble--targeted-child'
                : 'graph-bubble--targeted-self');
        }

        const currentScale = Math.max(this.transform.scale, 0.95);
        this.transform.x = this.viewport.clientWidth / 2 - targetNode.x * currentScale;
        this.transform.y = this.viewport.clientHeight / 2 - targetNode.y * currentScale;
        this.transform.scale = currentScale;

        this.world.style.transition = 'transform 0.65s cubic-bezier(0.16, 1, 0.3, 1)';
        this.applyTransform();
        setTimeout(() => {
            this.world.style.transition = 'none';
        }, 700);
    }

    centerRootLoop(retries = 90) {
        if (!this.isOpen || !this.nodes.length) {
            return;
        }

        const size = { w: this.viewport.clientWidth, h: this.viewport.clientHeight };
        if (size.w > 0 && size.h > 0) {
            const sizeChanged = !this._lastViewportSize
                || this._lastViewportSize.w !== size.w
                || this._lastViewportSize.h !== size.h;
            if (sizeChanged || !this._centered) {
                this._lastViewportSize = size;
                this._centered = true;
                const root = this.nodes[0];
                this.transform.scale = 1;
                this.transform.x = size.w / 2 - root.targetX;
                this.transform.y = size.h / 2 - root.targetY;
                this.applyTransform();
            }
        }

        if (retries > 0) {
            requestAnimationFrame(() => this.centerRootLoop(retries - 1));
        }
    }

    applyTransform() {
        this.world.style.transform =
            `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
    }
}

export const graphViewController = new GraphViewController();

export function openGraphView({ rootCardId }) {
    return graphViewController._open(rootCardId);
}

export function closeGraphView() {
    graphViewController.close();
}

export function isGraphViewOpen() {
    return graphViewController.isOpen;
}
