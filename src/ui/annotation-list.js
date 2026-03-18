import { getAppContext } from '../app/app-context.js';
import { registerEventListeners } from '../app/event-listeners.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('AnnotationList');

export class AnnotationList {
    constructor(containerId, cardSystem) {
        this.container = document.getElementById(containerId);
        this.cardSystem = cardSystem;
        this.activeCardId = null;
        this.cleanupListeners = null;

        this.init();
    }

    init() {
        if (!this.container) return;

        this.handleHighlightClicked = (e) => this.handleHighlightSelection(e.detail.highlightId);
        this.handleRefreshRequested = () => this.refresh();
        this.handleCardSelected = (e) => {
            const cardId = e.detail;
            this.highlightItem(cardId);
        };

        this.cleanupListeners = registerEventListeners([
            { target: window, event: 'highlight-clicked', handler: this.handleHighlightClicked },
            { target: window, event: 'highlight-updated', handler: (e) => this.handleHighlightUpdate(e.detail) },
            { target: window, event: 'highlight-removed', handler: (e) => this.removeCard(e.detail) },
            { target: window, event: 'card-added', handler: this.handleRefreshRequested },
            { target: window, event: 'card-updated', handler: this.handleRefreshRequested },
            { target: window, event: 'card-removed', handler: this.handleRefreshRequested },
            { target: window, event: 'card-soft-deleted', handler: this.handleRefreshRequested },
            { target: window, event: 'cards-restored', handler: this.handleRefreshRequested },
            { target: window, event: 'card-selected', handler: this.handleCardSelected }
        ]);
    }

    load(fileId) {
        this.currentFileId = fileId;
        this.refresh();
    }

    refresh() {
        if (!this.currentFileId || !this.cardSystem) {
            logger.warn('Missing fileId or cardSystem', { fileId: this.currentFileId, system: !!this.cardSystem });
            return;
        }

        // Get cards for this file
        // CardSystem uses Map, so we must access values iterator
        const allCards = (this.cardSystem.cards instanceof Map)
            ? Array.from(this.cardSystem.cards.values())
            : Object.values(this.cardSystem.cards || {});

        // Valid cards are those with sourceId matching current file AND not deleted
        const cards = allCards.filter(c => c.sourceId === this.currentFileId && !c.deleted);

        logger.debug('Refreshing annotation list', {
            fileId: this.currentFileId,
            totalCards: allCards.length,
            matchedCards: cards.length
        });

        // Sort by page (we need highlight info for this)
        // We'll trust that card order or card.highlightId can help lookup location
        // Best effort: Join with highlights if possible, or assume card.position is mindmap pos (not useful for page sort)
        // Actually, cardSystem doesn't store page info directly usually, but HighlightManager does.

        const highlightMap = this.getHighlightMap();
        const highlightedCards = cards.map(card => {
            const highlight = highlightMap.get(card.highlightId) ?? null;
            return {
                card,
                highlight,
                pageNum: highlight?.location?.page || 9999, // Sort end if unknown
                y: highlight?.location?.rects?.[0]?.top || 0
            };
        });

        // Sort: Page ASC, then Top Y ASC
        highlightedCards.sort((a, b) => {
            if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
            return a.y - b.y;
        });

        this.render(highlightedCards);
    }

    render(items) {
        if (items.length === 0) {
            this.container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">edit_note</span>
                    <p>No annotations yet</p>
                </div>`;
            return;
        }

        this.container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        items.forEach(item => {
            const el = this.createItemElement(item);
            fragment.appendChild(el);
        });

        this.container.appendChild(fragment);

        // Restore active selection if still present
        if (this.activeCardId) {
            this.highlightItem(this.activeCardId);
        }
    }

    getHighlightMap() {
        const highlights = getAppContext().highlightManager?.highlights;
        if (!Array.isArray(highlights)) {
            return new Map();
        }

        return new Map(highlights.map((highlight) => [highlight.id, highlight]));
    }

    buildTransferData(card, highlight) {
        const dragData = {
            id: card.id,
            highlightId: card.highlightId,
            text: card.content || highlight?.text || '',
            type: 'text',
            color: highlight?.color || card.color,
            sourceId: card.sourceId,
            sourceName: card.sourceName
        };

        if (card.imageData) {
            dragData.type = 'image';
            dragData.imageData = card.imageData;
        }

        return dragData;
    }

    addCardToMindMap(card, highlight) {
        window.dispatchEvent(new CustomEvent('add-card-to-board', {
            detail: this.buildTransferData(card, highlight)
        }));
    }

    createItemElement({ card, highlight, pageNum }) {
        const div = document.createElement('div');
        div.className = 'annotation-item';
        div.dataset.cardId = card.id;
        div.dataset.highlightId = card.highlightId;
        div.draggable = true; // Enable Drag

        // Drag Start Handler
        div.addEventListener('dragstart', (e) => {
            // Transfer JSON data for MindMap to consume
            const dragData = this.buildTransferData(card, highlight);

            e.dataTransfer.setData('application/json', JSON.stringify(dragData));
            e.dataTransfer.setData('text/plain', dragData.text);
            e.dataTransfer.effectAllowed = 'copy';
            div.classList.add('dragging');
        });

        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
        });

        // Header
        const header = document.createElement('div');
        header.className = 'annotation-header';

        const pageSpan = document.createElement('span');
        pageSpan.className = 'page-tag';
        pageSpan.textContent = `Page ${pageNum === 9999 ? '?' : pageNum}`;

        if (highlight?.color) {
            const dot = document.createElement('span');
            dot.style.width = '8px';
            dot.style.height = '8px';
            dot.style.borderRadius = '50%';
            dot.style.backgroundColor = highlight.color;
            dot.style.marginRight = '6px';
            dot.style.display = 'inline-block';
            header.prepend(dot);
        }

        header.appendChild(pageSpan);
        div.appendChild(header);

        // Quote (Content)
        const quote = document.createElement('div');
        quote.className = 'annotation-quote';
        if (card.imageData) {
            const img = document.createElement('img');
            img.src = card.imageData;
            img.className = 'annotation-image';
            img.style.maxWidth = '100%';
            img.style.borderRadius = '4px';
            img.style.marginTop = '4px';
            quote.appendChild(img);
        } else {
            quote.textContent = card.content || highlight?.text || '(Image)';
        }

        if (highlight?.color) {
            quote.style.borderLeftColor = highlight.color;
        }
        div.appendChild(quote);

        // Note Input
        const input = document.createElement('textarea');
        input.className = 'annotation-note-input';
        input.placeholder = 'Add a note...';
        input.value = card.note || '';
        input.rows = 1;

        // Auto-resize
        const autoResize = () => {
            input.style.height = 'auto';
            input.style.height = input.scrollHeight + 'px';
        };
        // Initial resize
        setTimeout(autoResize, 0);

        // Stop propagation of click to prevent jump when just editing note
        input.addEventListener('click', (e) => e.stopPropagation());

        input.addEventListener('input', autoResize);

        input.addEventListener('change', (e) => {
            this.cardSystem.updateCard(card.id, { note: e.target.value });
        });
        div.appendChild(input);

        // Actions (Delete)
        const actions = document.createElement('div');
        actions.className = 'item-actions';

        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn';
        delBtn.innerHTML = '<span class="material-icons-round">delete</span><span class="action-label">Delete</span>';
        delBtn.title = 'Delete';
        delBtn.setAttribute('aria-label', 'Delete annotation');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this annotation?')) {
                this.cardSystem.removeCard(card.id);
            }
        });
        actions.appendChild(delBtn);

        const addToMapBtn = document.createElement('button');
        addToMapBtn.className = 'action-btn add-to-map-btn';
        addToMapBtn.innerHTML = '<span class="material-icons-round">account_tree</span><span class="action-label">To map</span>';
        addToMapBtn.title = 'Add to mind map';
        addToMapBtn.setAttribute('aria-label', 'Add annotation to mind map');
        addToMapBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.addCardToMindMap(card, highlight);
        });
        actions.appendChild(addToMapBtn);
        div.appendChild(actions);

        // Click to jump
        div.addEventListener('click', () => {
            this.handleItemClick(card.id, card.highlightId);
        });

        return div;
    }

    handleItemClick(cardId, highlightId) {
        this.activeCardId = cardId;
        this.highlightItem(cardId);

        // Dispatch event for sync (handled in main.js)
        window.dispatchEvent(new CustomEvent('annotation-selected', {
            detail: { cardId, highlightId }
        }));
    }

    handleHighlightSelection(highlightId) {
        // Find card for this highlight
        const item = this.container.querySelector(`[data-highlight-id="${highlightId}"]`);
        if (item) {
            const cardId = item.dataset.cardId;
            this.activeCardId = cardId;
            this.highlightItem(cardId);

            // Scroll list to item
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    highlightItem(cardId) {
        const all = this.container.querySelectorAll('.annotation-item');
        all.forEach(el => el.classList.remove('active'));

        const target = this.container.querySelector(`[data-card-id="${cardId}"]`);
        if (target) {
            target.classList.add('active');
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            // Add temporary flash
            target.classList.add('flash-highlight');
            setTimeout(() => target.classList.remove('flash-highlight'), 1500);
        }
    }

    handleHighlightUpdate(detail) {
        // detail: { id, color }
        // We might just refresh, or update specific DOM for perf
        this.refresh();
    }

    removeCard(highlightId) {
        // Called when standard highlight removal event fires
        // Visual removal only? No, wait for card-removed event to refresh data
        // But we can optimistically remove from DOM
        const item = this.container.querySelector(`[data-highlight-id="${highlightId}"]`);
        if (item) item.remove();
    }

    destroy() {
        this.cleanupListeners?.();
        this.cleanupListeners = null;
    }
}
