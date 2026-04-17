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
        this.filterMode = 'all';
        this.selectedCardIds = new Set();

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
            const location = highlight?.location || card.location || null;
            return {
                card,
                highlight,
                pageNum: location?.page || location?.rects?.[0]?.page || 9999, // Sort end if unknown
                y: location?.rects?.[0]?.top || 0
            };
        });

        // Sort: Page ASC, then Top Y ASC
        highlightedCards.sort((a, b) => {
            if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
            return a.y - b.y;
        });

        this.render(this.applyFilters(highlightedCards));
    }

    getMissingSourceIds() {
        const documents = getAppContext().documentManager?.getMissingDocuments?.() ?? [];
        return new Set(documents.map((document) => document.id));
    }

    applyFilters(items) {
        const missingSourceIds = this.getMissingSourceIds();
        return items.filter(({ card }) => {
            if (this.filterMode === 'all') {
                return true;
            }

            if (this.filterMode === 'needs-map') {
                return card.isOnBoard === false;
            }

            if (this.filterMode === 'on-map') {
                return card.isOnBoard !== false;
            }

            if (this.filterMode === 'missing-links') {
                return missingSourceIds.has(card.sourceId);
            }

            return true;
        });
    }

    render(items) {
        const controls = this.createControlsElement(items);

        if (items.length === 0) {
            this.container.innerHTML = '';
            this.container.appendChild(controls);
            this.container.insertAdjacentHTML('beforeend', `
                <div class="empty-state annotation-empty-state">
                    <span class="material-icons-round">edit_note</span>
                    <p>No annotations yet</p>
                </div>`);
            return;
        }

        this.container.innerHTML = '';
        this.container.appendChild(controls);
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

    createControlsElement(items) {
        const controls = document.createElement('div');
        controls.className = 'annotation-controls';

        const toolbarMain = document.createElement('div');
        toolbarMain.className = 'annotation-toolbar-main';

        const filterGroup = document.createElement('div');
        filterGroup.className = 'annotation-filter-group';
        [
            ['all', 'apps', 'All annotations'],
            ['needs-map', 'playlist_add_check_circle', 'Need mapping'],
            ['on-map', 'account_tree', 'On map'],
            ['missing-links', 'link_off', 'Missing links']
        ].forEach(([value, icon, label]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'annotation-filter-btn';
            button.dataset.filter = value;
            button.title = label;
            button.setAttribute('aria-label', label);
            button.setAttribute('aria-pressed', String(value === this.filterMode));
            if (value === this.filterMode) {
                button.classList.add('active');
            }
            button.innerHTML = `<span class="material-icons-round">${icon}</span>`;
            button.addEventListener('click', () => {
                this.filterMode = value;
                this.refresh();
            });
            filterGroup.appendChild(button);
        });
        toolbarMain.appendChild(filterGroup);

        const basketMeta = document.createElement('div');
        basketMeta.className = 'annotation-basket-meta';
        basketMeta.innerHTML = `
            <span class="material-icons-round">done_all</span>
            <span>${this.selectedCardIds.size} selected</span>
        `;

        const toolbarSide = document.createElement('div');
        toolbarSide.className = 'annotation-toolbar-side';

        const addSelectedBtn = document.createElement('button');
        addSelectedBtn.type = 'button';
        addSelectedBtn.className = 'annotation-basket-btn';
        addSelectedBtn.title = 'Add selected to mind map';
        addSelectedBtn.setAttribute('aria-label', 'Add selected annotations to mind map');
        addSelectedBtn.innerHTML = '<span class="material-icons-round">account_tree</span>';
        addSelectedBtn.disabled = this.selectedCardIds.size === 0;
        addSelectedBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.addSelectedCardsToMindMap();
        });

        const clearSelectedBtn = document.createElement('button');
        clearSelectedBtn.type = 'button';
        clearSelectedBtn.className = 'annotation-basket-btn secondary';
        clearSelectedBtn.title = 'Clear selection basket';
        clearSelectedBtn.setAttribute('aria-label', 'Clear selection basket');
        clearSelectedBtn.innerHTML = '<span class="material-icons-round">clear_all</span>';
        clearSelectedBtn.disabled = this.selectedCardIds.size === 0;
        clearSelectedBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.selectedCardIds.clear();
            this.refresh();
        });

        toolbarSide.appendChild(basketMeta);
        toolbarSide.appendChild(addSelectedBtn);
        toolbarSide.appendChild(clearSelectedBtn);

        controls.appendChild(toolbarMain);
        controls.appendChild(toolbarSide);

        return controls;
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
        this.cardSystem.updateCard(card.id, { isOnBoard: true });
    }

    addSelectedCardsToMindMap() {
        const highlightMap = this.getHighlightMap();
        const cards = (this.cardSystem.cards instanceof Map)
            ? Array.from(this.cardSystem.cards.values())
            : Object.values(this.cardSystem.cards || {});
        const selectedCards = cards.filter((card) => this.selectedCardIds.has(card.id) && !card.deleted);

        selectedCards.forEach((card) => {
            this.addCardToMindMap(card, highlightMap.get(card.highlightId) ?? null);
        });

        this.selectedCardIds.clear();
        this.refresh();
    }

    createItemElement({ card, highlight, pageNum }) {
        const div = document.createElement('div');
        div.className = 'annotation-item';
        div.dataset.cardId = card.id;
        div.dataset.highlightId = card.highlightId;
        div.draggable = true; // Enable Drag
        div.classList.toggle('selected', this.selectedCardIds.has(card.id));

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

        const headerMeta = document.createElement('div');
        headerMeta.className = 'annotation-header-meta';

        const pageSpan = document.createElement('span');
        pageSpan.className = 'page-tag';
        pageSpan.innerHTML = `<span class="material-icons-round">article</span><span>${pageNum === 9999 ? 'Page ?' : `Page ${pageNum}`}</span>`;

        if (highlight?.color) {
            const dot = document.createElement('span');
            dot.className = 'annotation-color-dot';
            dot.style.width = '8px';
            dot.style.height = '8px';
            dot.style.borderRadius = '50%';
            dot.style.backgroundColor = highlight.color;
            dot.style.display = 'inline-block';
            pageSpan.prepend(dot);
        }

        headerMeta.appendChild(pageSpan);

        const statusTag = document.createElement('span');
        statusTag.className = 'annotation-status-tag';
        if (this.getMissingSourceIds().has(card.sourceId)) {
            statusTag.textContent = 'Missing link';
        } else if (card.isOnBoard === false) {
            statusTag.textContent = 'To map';
        } else {
            statusTag.textContent = 'On map';
        }
        headerMeta.appendChild(statusTag);
        header.appendChild(headerMeta);

        const headerActions = document.createElement('div');
        headerActions.className = 'annotation-header-actions';

        const selectBtn = document.createElement('button');
        selectBtn.className = 'action-btn basket-btn annotation-select-btn';
        if (this.selectedCardIds.has(card.id)) {
            selectBtn.classList.add('active');
        }
        selectBtn.innerHTML = '<span class="material-icons-round">check_circle</span>';
        selectBtn.title = 'Select for batch actions';
        selectBtn.setAttribute('aria-label', 'Select annotation for batch actions');
        selectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.selectedCardIds.has(card.id)) {
                this.selectedCardIds.delete(card.id);
            } else {
                this.selectedCardIds.add(card.id);
            }
            this.refresh();
        });
        headerActions.appendChild(selectBtn);
        header.appendChild(headerActions);

        div.appendChild(header);

        const sourceMeta = document.createElement('div');
        sourceMeta.className = 'annotation-source-meta text-two-line';
        sourceMeta.innerHTML = `
            <span class="material-icons-round annotation-source-icon">description</span>
            <span>${card.sourceName || 'Unknown source'}</span>
        `;
        div.appendChild(sourceMeta);

        // Quote (Content)
        const quote = document.createElement('div');
        quote.className = 'annotation-quote text-three-line';
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
        const noteWrap = document.createElement('div');
        noteWrap.className = 'annotation-note-wrap';
        noteWrap.appendChild(input);
        div.appendChild(noteWrap);

        // Actions (Delete)
        const actions = document.createElement('div');
        actions.className = 'item-actions annotation-actions';

        const actionMain = document.createElement('div');
        actionMain.className = 'annotation-actions-main';

        const actionDanger = document.createElement('div');
        actionDanger.className = 'annotation-actions-danger';

        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn danger';
        delBtn.innerHTML = '<span class="material-icons-round">delete</span>';
        delBtn.title = 'Delete';
        delBtn.setAttribute('aria-label', 'Delete annotation');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this annotation?')) {
                this.cardSystem.removeCard(card.id);
            }
        });
        actionDanger.appendChild(delBtn);

        const addToMapBtn = document.createElement('button');
        addToMapBtn.className = 'action-btn add-to-map-btn';
        if (card.isOnBoard !== false) {
            addToMapBtn.classList.add('active');
        }
        addToMapBtn.innerHTML = '<span class="material-icons-round">account_tree</span>';
        addToMapBtn.title = 'Add to mind map';
        addToMapBtn.setAttribute('aria-label', 'Add annotation to mind map');
        addToMapBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.addCardToMindMap(card, highlight);
        });
        actionMain.appendChild(addToMapBtn);

        const jumpBtn = document.createElement('button');
        jumpBtn.className = 'action-btn annotation-jump-btn';
        jumpBtn.innerHTML = '<span class="material-icons-round">north_east</span>';
        jumpBtn.title = 'Open in reader';
        jumpBtn.setAttribute('aria-label', 'Open annotation in reader');
        jumpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleItemClick(card.id, card.highlightId);
        });
        actionMain.appendChild(jumpBtn);

        actions.appendChild(actionMain);
        actions.appendChild(actionDanger);
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
