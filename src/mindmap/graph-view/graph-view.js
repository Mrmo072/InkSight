import { hierarchy, tree as d3tree } from 'd3-hierarchy';
import {
    forceCollide,
    forceManyBody,
    forceSimulation,
    forceX,
    forceY
} from 'd3-force';
import { buildGraphTree } from './graph-tree.js';
import { cancelBoardCardFlash } from '../drawnix-board-interactions.js';
import { getAppContext } from '../../app/app-context.js';
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
            <div class="graph-view__pill">延伸思考节点</div>
        `;
        container.appendChild(overlay);
        this.overlay = overlay;

        this.viewport = overlay.querySelector('.graph-view__viewport');
        this.world = overlay.querySelector('.graph-view__world');
        this.nodesContainer = overlay.querySelector('.graph-view__nodes');
        this.edgesLayer = overlay.querySelector('.graph-view__edges');
        this.titleEl = overlay.querySelector('.graph-view__title');
        this.selectionPill = overlay.querySelector('.graph-view__pill');

        overlay.querySelector('.graph-view__back').addEventListener('click', () => this.close());
        overlay.querySelector('.graph-view__center').addEventListener('click', () => {
            const root = this.nodes?.[0];
            if (root) {
                this.focusOnNode(root.id, 'self');
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
        this.selectionPill.addEventListener('click', () => this.handleExtendSelection());
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
        this.childNodesByNodeId = new Map();
        const collectChildren = (node) => {
            this.childNodesByNodeId.set(node.id, node.children || []);
            (node.children || []).forEach(collectChildren);
        };
        collectChildren(this.rawTree);
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
        this.simulation?.stop();
        this.simulation = null;
        this.rawTree = null;
        this.childNodesByNodeId = null;
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
                return existing;
            }

            const parentNode = d.parent ? existingMap.get(d.parent.data.id) : null;
            return {
                id: d.data.id,
                tag: d.data.tag,
                text: d.data.text,
                color: d.data.color,
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
                // 重建子节点 chips，覆盖延伸思考后新增的分支
                el.querySelector('.graph-bubble__chips')?.remove();
                const body = el.querySelector('.graph-bubble__body');
                el.insertBefore(this.createChildChips(node.id), body);
            }
        });

        this.syncBezierEdges();
    }

    createBubble(node) {
        const el = document.createElement('div');
        el.id = this.domId(node.id);
        el.className = 'graph-bubble';
        el.dataset.cardId = node.id;

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
        tag.appendChild(tagTitle);

        const dragIcon = document.createElement('span');
        dragIcon.className = 'graph-bubble__drag-icon';
        dragIcon.textContent = '⠿';

        header.appendChild(tag);
        header.appendChild(dragIcon);

        const body = document.createElement('div');
        body.className = 'graph-bubble__body';
        escapelessText(body, node.text);

        el.appendChild(header);
        el.appendChild(this.createChildChips(node.id));
        el.appendChild(body);

        this.bindNodeDrag(header, node.id);

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

    createChildChips(nodeId) {
        const children = this.childNodesByNodeId?.get(nodeId) || [];
        if (children.length === 0) {
            return document.createDocumentFragment();
        }

        const wrap = document.createElement('div');
        wrap.className = 'graph-bubble__chips';
        children.forEach((child) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'graph-bubble__chip';
            escapelessText(chip, `→ ${child.tag}`);
            chip.title = '点击跳转追踪此思考分支';
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                this.triggerJumpToChild(child.id, nodeId);
            });
            wrap.appendChild(chip);
        });
        return wrap;
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

    handleExtendSelection() {
        const ctx = this.selectedTextContext;
        if (!ctx || !this.rawTree) return;

        const { text, parentId, range } = ctx;
        const newChildId = `graph-ext-${Date.now()}`;

        const mark = document.createElement('mark');
        mark.className = 'graph-mark';
        mark.setAttribute('data-target-id', newChildId);
        mark.title = '点击跳转追踪此思考分支';

        try {
            range.surroundContents(mark);
        } catch (err) {
            console.warn('选区包裹退回机制:', err);
        }

        const appendChildNode = (current) => {
            if (current.id === parentId) {
                current.children = current.children || [];
                current.children.push({
                    id: newChildId,
                    tag: '延伸思考',
                    text: `针对「${text}」的核心逻辑延展与更深入的思考发散...`,
                    color: null,
                    children: []
                });
                return true;
            }
            if (current.children) {
                for (const child of current.children) {
                    if (appendChildNode(child)) return true;
                }
            }
            return false;
        };

        if (!appendChildNode(this.rawTree)) {
            this.selectionPill.style.display = 'none';
            return;
        }

        this.calculateLayout();
        this.renderGraph();

        this.simulation.nodes(this.nodes);
        this.simulation.force('x', forceX((d) => d.targetX).strength(0.35));
        this.simulation.force('y', forceY((d) => d.targetY).strength(0.35));
        this.simulation.alpha(0.7).restart();

        setTimeout(() => {
            this.triggerJumpToChild(newChildId, parentId);
        }, 100);

        this.selectionPill.style.display = 'none';
        window.getSelection().removeAllRanges();
        this.selectedTextContext = null;
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
