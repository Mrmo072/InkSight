import { cardSystem } from '../core/card-system.js';
import { modalManager } from '../ui/modal-manager.js';

export class MindmapView {
    constructor(container) {
        this.container = container;
        this.cards = new Map(); // id -> element

        // SVG Layer for connections
        this.svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svgLayer.style.position = 'absolute';
        this.svgLayer.style.top = '0';
        this.svgLayer.style.left = '0';
        this.svgLayer.style.width = '100%';
        this.svgLayer.style.height = '100%';
        this.svgLayer.style.pointerEvents = 'none'; // Let clicks pass through
        this.svgLayer.style.zIndex = '0';
        this.container.appendChild(this.svgLayer);

        this.setupListeners();

        // Drag state
        this.draggedCardId = null;
        this.offset = { x: 0, y: 0 };
        this.isDragging = false;
        this.dragStartTime = 0;

        window.addEventListener('card-removed', (e) => {
            const cardId = typeof e.detail === 'object' ? e.detail.id : e.detail;
            this.removeCardElement(cardId);
        });

        window.addEventListener('connections-updated', () => {
            this.renderConnections();
        });

        // Render existing cards
        cardSystem.getCards().forEach(card => this.renderCard(card));
        this.renderConnections();

        // Listen for card-added event
        window.addEventListener('card-added', (e) => {
            this.renderCard(e.detail);
        });

        // Listen for cards-restored event
        window.addEventListener('cards-restored', (e) => {
            // Clear existing cards from DOM
            this.cards.forEach(el => el.remove());
            this.cards.clear();

            // Render all restored cards
            e.detail.cards.forEach(card => this.renderCard(card));
            this.renderConnections();
        });
    }

    setupListeners() {
        // Setup global mouse event listeners for dragging
        this.container.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.container.addEventListener('mouseup', () => this.onMouseUp());

        // Layout button
        const layoutBtn = document.getElementById('layout-btn');
        if (layoutBtn) {
            layoutBtn.addEventListener('click', () => this.autoLayout());
        }
    }

    renderCard(cardData) {
        const cardEl = document.createElement('div');
        cardEl.className = 'mindmap-card';
        cardEl.id = `card-${cardData.id}`;
        cardEl.dataset.id = cardData.id;
        cardEl.style.left = `${cardData.position.x}px`;
        cardEl.style.top = `${cardData.position.y}px`;

        // Different rendering for image vs text cards
        if (cardData.type === 'image') {
            cardEl.innerHTML = `
              <div class="card-header">
                <div class="card-handle">
                  <span class="material-icons-round" style="font-size: 16px;">drag_indicator</span>
                </div>
                <div class="card-actions">
                   <span class="material-icons-round delete-btn" style="font-size: 16px; cursor: pointer;">close</span>
                </div>
              </div>
              <div class="card-content">
                <img src="${cardData.imageData}" style="max-width: 100%; height: auto; display: block;" />
              </div>
              <div class="connect-handle"></div>
            `;
        } else {
            cardEl.innerHTML = `
              <div class="card-header">
                <div class="card-handle">
                  <span class="material-icons-round" style="font-size: 16px;">drag_indicator</span>
                </div>
                <div class="card-actions">
                   <span class="material-icons-round delete-btn" style="font-size: 16px; cursor: pointer;">close</span>
                </div>
              </div>
              <div class="card-content">${cardData.content}</div>
              <div class="connect-handle"></div>
            `;
        }

        // Style
        cardEl.style.position = 'absolute';
        cardEl.style.width = '200px';
        cardEl.style.backgroundColor = 'white';
        cardEl.style.border = '1px solid var(--border)';
        cardEl.style.borderRadius = '8px';
        cardEl.style.padding = '8px';
        cardEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        cardEl.style.fontSize = '14px';
        cardEl.style.zIndex = '10';

        // Header
        const header = cardEl.querySelector('.card-header');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '4px';
        header.style.color = 'var(--text-secondary)';

        // Drag handle
        const handle = cardEl.querySelector('.card-handle');
        handle.style.cursor = 'grab';

        // Make the entire card draggable
        cardEl.style.cursor = 'grab';

        const startDrag = (e) => {
            if (e.target.closest('.delete-btn') || e.target.closest('.connect-handle')) {
                return;
            }

            this.draggedCardId = cardData.id;
            this.isDragging = false;
            this.dragStartTime = Date.now();

            const rect = cardEl.getBoundingClientRect();
            this.offset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            cardEl.style.cursor = 'grabbing';
            // Don't stop propagation to allow click events if not moved
        };

        handle.addEventListener('mousedown', startDrag);
        cardEl.addEventListener('mousedown', startDrag);

        // Content Interaction
        const contentEl = cardEl.querySelector('.card-content');

        let clickTimeout = null;

        // 1. Double Click -> Preview
        contentEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (clickTimeout) {
                clearTimeout(clickTimeout);
                clickTimeout = null;
            }

            if (cardData.type === 'image') {
                modalManager.showImage(cardData.imageData);
            } else {
                modalManager.showText(cardData.content);
            }
        });

        // 2. Single Click -> Jump to Source
        contentEl.addEventListener('click', (e) => {
            // Check if it was a drag operation (moved or held for long)
            if (this.isDragging || (Date.now() - this.dragStartTime > 200)) {
                return;
            }

            // Check if we are in connection mode
            if (this.connectingCardId) {
                return;
            }

            e.stopPropagation();

            // Delay click action to wait for potential double click
            if (clickTimeout) clearTimeout(clickTimeout);

            clickTimeout = setTimeout(() => {
                clickTimeout = null;
                const event = new CustomEvent('jump-to-source', {
                    detail: {
                        sourceId: cardData.sourceId,
                        highlightId: cardData.highlightId
                    }
                });
                window.dispatchEvent(event);
            }, 250);
        });

        // Delete button
        const deleteBtn = cardEl.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this card?')) {
                cardSystem.removeCard(cardData.id);
            }
        });

        // Connect handle
        const connectHandle = cardEl.querySelector('.connect-handle');
        connectHandle.style.width = '12px';
        connectHandle.style.height = '12px';
        connectHandle.style.backgroundColor = 'var(--primary)';
        connectHandle.style.borderRadius = '50%';
        connectHandle.style.position = 'absolute';
        connectHandle.style.bottom = '-6px';
        connectHandle.style.right = '-6px';
        connectHandle.style.cursor = 'crosshair';

        connectHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startConnection(cardData.id, e);
        });

        // Allow dropping connection
        cardEl.addEventListener('mouseup', (e) => {
            if (this.connectingCardId && this.connectingCardId !== cardData.id) {
                cardSystem.addConnection(this.connectingCardId, cardData.id);
                this.stopConnection();
                e.stopPropagation();
            }
        });

        this.container.appendChild(cardEl);
        this.cards.set(cardData.id, cardEl);

        const placeholder = this.container.querySelector('.mindmap-placeholder');
        if (placeholder) placeholder.style.display = 'none';
    }

    removeCardElement(id) {
        const cardEl = this.cards.get(id);
        if (cardEl) {
            cardEl.remove();
            this.cards.delete(id);
        }
    }

    startConnection(sourceId, e) {
        this.connectingCardId = sourceId;

        // Create temp line
        this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this.tempLine.setAttribute('stroke', '#999');
        this.tempLine.setAttribute('stroke-width', '2');
        this.tempLine.setAttribute('stroke-dasharray', '5,5');
        this.svgLayer.appendChild(this.tempLine);

        const sourceCard = this.cards.get(sourceId);
        const rect = sourceCard.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();

        const startX = rect.left + rect.width / 2 - containerRect.left;
        const startY = rect.top + rect.height / 2 - containerRect.top;

        this.tempLine.setAttribute('x1', startX);
        this.tempLine.setAttribute('y1', startY);
        this.tempLine.setAttribute('x2', startX);
        this.tempLine.setAttribute('y2', startY);
    }

    stopConnection() {
        if (this.tempLine) {
            this.tempLine.remove();
            this.tempLine = null;
        }
        this.connectingCardId = null;
    }

    onMouseMove(e) {
        const containerRect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;

        // Dragging Card
        if (this.draggedCardId) {
            const cardEl = this.cards.get(this.draggedCardId);
            if (cardEl) {
                const x = mouseX - this.offset.x;
                const y = mouseY - this.offset.y;

                // Check if actually moved
                if (Math.abs(parseInt(cardEl.style.left) - x) > 2 || Math.abs(parseInt(cardEl.style.top) - y) > 2) {
                    this.isDragging = true;
                }

                cardEl.style.left = `${x}px`;
                cardEl.style.top = `${y}px`;

                cardSystem.updateCardPosition(this.draggedCardId, x, y);
                this.renderConnections(); // Update lines
            }
        }

        // Dragging Connection
        if (this.connectingCardId && this.tempLine) {
            this.tempLine.setAttribute('x2', mouseX);
            this.tempLine.setAttribute('y2', mouseY);
        }
    }

    onMouseUp() {
        if (this.draggedCardId) {
            const cardEl = this.cards.get(this.draggedCardId);
            if (cardEl) {
                cardEl.style.cursor = 'grab';
            }
        }
        this.draggedCardId = null;
        this.stopConnection();
    }

    autoLayout() {
        const cards = cardSystem.getCards();
        if (cards.length === 0) return;

        // Simple grid layout
        const cols = Math.ceil(Math.sqrt(cards.length));
        const spacing = 250;
        const startX = 50;
        const startY = 50;

        cards.forEach((card, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const x = startX + col * spacing;
            const y = startY + row * spacing;

            cardSystem.updateCardPosition(card.id, x, y);

            const cardEl = this.cards.get(card.id);
            if (cardEl) {
                cardEl.style.left = `${x}px`;
                cardEl.style.top = `${y}px`;
            }
        });

        this.renderConnections();
    }

    renderConnections() {
        // Clear existing lines (except tempLine)
        Array.from(this.svgLayer.children).forEach(child => {
            if (child !== this.tempLine) child.remove();
        });

        const connections = cardSystem.getConnections();
        connections.forEach(conn => {
            const sourceCard = this.cards.get(conn.sourceId);
            const targetCard = this.cards.get(conn.targetId);

            if (sourceCard && targetCard) {
                const sourceRect = sourceCard.getBoundingClientRect();
                const targetRect = targetCard.getBoundingClientRect();
                const containerRect = this.container.getBoundingClientRect();

                const x1 = sourceRect.left + sourceRect.width / 2 - containerRect.left;
                const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top;
                const x2 = targetRect.left + targetRect.width / 2 - containerRect.left;
                const y2 = targetRect.top + targetRect.height / 2 - containerRect.top;

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', x1);
                line.setAttribute('y1', y1);
                line.setAttribute('x2', x2);
                line.setAttribute('y2', y2);
                line.setAttribute('stroke', '#666');
                line.setAttribute('stroke-width', '2');
                line.style.pointerEvents = 'visibleStroke';
                line.style.cursor = 'pointer';

                // Delete connection on click
                line.addEventListener('click', (e) => {
                    if (confirm('Delete connection?')) {
                        cardSystem.removeConnection(conn.id);
                    }
                });

                this.svgLayer.appendChild(line);
            }
        });
    }
}
