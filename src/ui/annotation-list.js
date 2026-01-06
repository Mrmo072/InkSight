export class AnnotationList {
    constructor(containerId, cardSystem) {
        this.container = document.getElementById(containerId);
        this.cardSystem = cardSystem;
        this.activeCardId = null;

        this.init();
    }

    init() {
        if (!this.container) return;

        // Global Event Listeners for Sync
        window.addEventListener('highlight-clicked', (e) => this.handleHighlightSelection(e.detail.highlightId));
        window.addEventListener('highlight-updated', (e) => this.handleHighlightUpdate(e.detail));
        window.addEventListener('highlight-removed', (e) => this.removeCard(e.detail)); // Highlight ID
        window.addEventListener('card-added', () => this.refresh());
        window.addEventListener('card-updated', () => this.refresh()); // Or granular update
        window.addEventListener('card-removed', () => this.refresh());
        window.addEventListener('card-soft-deleted', () => this.refresh()); // Sync with Mindmap deletions

        // Listen for internal active card changes (from CardSystem or Drawnix)
        window.addEventListener('card-selected', (e) => {
            const cardId = e.detail;
            // Find highlight ID from card? Hard without map, but we can match by ID if same or look up
            // For now, refresh selection visual
            this.highlightItem(cardId);
        });
    }

    load(fileId) {
        this.currentFileId = fileId;
        this.refresh();
    }

    refresh() {
        if (!this.currentFileId || !this.cardSystem) {
            console.warn('[AnnotationList] Missing fileId or cardSystem', { fileId: this.currentFileId, system: !!this.cardSystem });
            return;
        }

        // Get cards for this file
        // CardSystem uses Map, so we must access values iterator
        const allCards = (this.cardSystem.cards instanceof Map)
            ? Array.from(this.cardSystem.cards.values())
            : Object.values(this.cardSystem.cards || {});

        // Valid cards are those with sourceId matching current file AND not deleted
        const cards = allCards.filter(c => c.sourceId === this.currentFileId && !c.deleted);

        console.log('[AnnotationList] Refreshing. FileId:', this.currentFileId, 'TotalCards:', allCards.length, 'Matched:', cards.length);

        // Sort by page (we need highlight info for this)
        // We'll trust that card order or card.highlightId can help lookup location
        // Best effort: Join with highlights if possible, or assume card.position is mindmap pos (not useful for page sort)
        // Actually, cardSystem doesn't store page info directly usually, but HighlightManager does.

        const highlightedCards = cards.map(card => {
            let highlight = null;
            if (window.inksight.highlightManager) {
                highlight = window.inksight.highlightManager.highlights.find(h => h.id === card.highlightId);
            }
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

        items.forEach(item => {
            const el = this.createItemElement(item);
            this.container.appendChild(el);
        });

        // Restore active selection if still present
        if (this.activeCardId) {
            this.highlightItem(this.activeCardId);
        }
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
            const dragData = {
                id: card.id,
                highlightId: card.highlightId,
                text: card.content || highlight?.text || '',
                type: 'text', // Assuming text for now, could be image if card has imageData
                color: highlight?.color || card.color,
                sourceId: card.sourceId,
                sourceName: card.sourceName
            };

            if (card.imageData) {
                dragData.type = 'image';
                dragData.imageData = card.imageData;
            }

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
        delBtn.innerHTML = '<span class="material-icons-round" style="font-size: 16px;">delete</span>';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this annotation?')) {
                this.cardSystem.removeCard(card.id);
            }
        });
        actions.appendChild(delBtn);
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
}
