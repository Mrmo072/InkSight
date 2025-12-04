/**
 * PDFHighlightRenderer - Manages rendering of highlights on PDF pages
 * Handles both text highlights and area selection borders
 */
export class PDFHighlightRenderer {
    constructor(container, pages, fileId) {
        this.container = container;
        this.pages = pages;
        this.fileId = fileId;

        // Callback for highlight clicks
        this.onHighlightClick = null;
    }

    setFileId(fileId) {
        this.fileId = fileId;
    }

    setOnHighlightClick(callback) {
        this.onHighlightClick = callback;
    }

    renderHighlightsForPage(pageNum, highlights) {
        const pageInfo = this.pages[pageNum - 1];
        if (!pageInfo || !pageInfo.wrapper) return;

        // console.log(`[PDFHighlightRenderer] Rendering highlights for page ${pageNum}. FileID: ${this.fileId}`);

        // Filter highlights for this page and current file
        const pageHighlights = highlights.filter(h => {
            const matchFile = h.sourceId === this.fileId;
            const matchPage = h.location && h.location.page === pageNum;
            // console.log(`[PDFHighlightRenderer] Checking highlight ${h.id}: Page ${h.location?.page} vs ${pageNum}, Source ${h.sourceId} vs ${this.fileId}`);
            return matchFile && matchPage;
        });

        if (pageHighlights.length > 0) {

        }

        pageHighlights.forEach(highlight => {
            // Check if already rendered
            if (pageInfo.wrapper.querySelector(`[data-highlight-id="${highlight.id}"]`)) {
                // console.log(`[PDFHighlightRenderer] Highlight ${highlight.id} already rendered`);
                return;
            }

            // Find associated card to enable interaction AND check if card is deleted
            let cardId = null;
            let isCardDeleted = false;
            if (window.inksight && window.inksight.cardSystem) {
                const card = Array.from(window.inksight.cardSystem.cards.values()).find(c => c.highlightId === highlight.id);
                if (card) {
                    cardId = card.id;
                    isCardDeleted = card.deleted === true;
                }
            }

            // Skip rendering if card is marked as deleted
            if (isCardDeleted) {

                return;
            }



            if (highlight.type === 'text' && highlight.location.rects) {
                this.renderTextHighlight(pageInfo, highlight, cardId);
            } else if (highlight.location.type === 'highlighter') {
                this.renderHighlighterHighlight(pageInfo, highlight, cardId);
            } else if (highlight.text === '[Image Selection]' && highlight.location) {
                this.renderAreaHighlight(pageInfo, highlight, cardId);
            }
        });
    }

    renderTextHighlight(pageInfo, highlight, cardId) {
        highlight.location.rects.forEach((rect, index) => {


            if (rect.width === 0 || rect.height === 0) {
                console.warn('[PDFHighlightRenderer] Skipping zero-size rect:', rect);
                return;
            }

            const highlightDiv = document.createElement('div');
            highlightDiv.className = 'highlight-overlay';
            highlightDiv.style.position = 'absolute';
            highlightDiv.style.top = `${rect.top}px`;
            highlightDiv.style.left = `${rect.left}px`;
            highlightDiv.style.width = `${rect.width}px`;
            highlightDiv.style.height = `${rect.height}px`;

            // Handle color
            let bgColor = 'rgba(255, 226, 52, 0.4)'; // Default
            if (highlight.color) {
                if (highlight.color.startsWith('#')) {
                    // Hex to RGBA
                    const r = parseInt(highlight.color.slice(1, 3), 16);
                    const g = parseInt(highlight.color.slice(3, 5), 16);
                    const b = parseInt(highlight.color.slice(5, 7), 16);
                    bgColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
                } else if (highlight.color.startsWith('rgb')) {
                    bgColor = highlight.color.replace('rgb', 'rgba').replace(')', ', 0.4)');
                } else if (highlight.color.startsWith('var')) {
                    bgColor = 'rgba(255, 226, 52, 0.4)';
                } else {
                    bgColor = highlight.color;
                }
            }

            highlightDiv.style.backgroundColor = bgColor;
            highlightDiv.style.zIndex = '100'; // Force high z-index
            highlightDiv.dataset.highlightId = highlight.id;

            if (cardId) {
                highlightDiv.style.cursor = 'pointer';
                highlightDiv.style.pointerEvents = 'auto'; // Enable events
                highlightDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.onHighlightClick) {
                        this.onHighlightClick(e, highlight.id, cardId);
                    }
                });
            } else {
                highlightDiv.style.pointerEvents = 'none';
            }

            pageInfo.wrapper.appendChild(highlightDiv);
        });
    }

    renderAreaHighlight(pageInfo, highlight, cardId) {
        // Image/Area selection border
        // Handle both nested area (new format) and flat location (legacy/potential format)
        const area = highlight.location.area || highlight.location;
        const { left, top, width, height } = area;

        // Validate coordinates
        if (left == null || top == null || width == null || height == null) {
            console.warn(`[PDFHighlightRenderer] Skipping invalid area highlight ${highlight.id}:`, area);
            return;
        }

        const borderDiv = document.createElement('div');
        borderDiv.className = 'area-highlight-border';
        borderDiv.style.position = 'absolute';
        borderDiv.style.left = `${left}px`;
        borderDiv.style.top = `${top}px`;
        borderDiv.style.width = `${width}px`;
        borderDiv.style.height = `${height}px`;
        borderDiv.style.border = '2px dashed #FF6B6B';
        borderDiv.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';

        if (highlight.color) {
            // Handle color formats
            let borderColor = highlight.color;
            if (highlight.color.startsWith('var')) {
                borderColor = '#FF6B6B'; // Fallback for var
            }

            borderDiv.style.borderColor = borderColor;
            borderDiv.style.backgroundColor = borderColor.startsWith('#')
                ? borderColor + '1A' // Hex + Alpha
                : borderColor.replace('rgb', 'rgba').replace(')', ', 0.1)');
        }

        borderDiv.style.zIndex = '5';
        borderDiv.dataset.highlightId = highlight.id;

        if (cardId) {
            borderDiv.style.pointerEvents = 'auto';
            borderDiv.style.cursor = 'pointer';
            borderDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onHighlightClick) {
                    this.onHighlightClick(e, highlight.id, cardId);
                }
            });
        } else {
            borderDiv.style.pointerEvents = 'none';
        }

        pageInfo.wrapper.appendChild(borderDiv);
    }

    renderHighlighterHighlight(pageInfo, highlight, cardId) {
        const { path, height, bounds } = highlight.location;
        if (!path || path.length < 2) return;

        // Create SVG container
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '5';
        svg.classList.add('highlighter-svg');
        svg.dataset.highlightSvgId = highlight.id;

        // Create SVG group
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        svg.appendChild(g);

        // Draw rect (assuming straight line for now as per tool implementation)
        const startX = path[0].x;
        const endX = path[path.length - 1].x;
        const y = path[0].y;
        const width = endX - startX;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', width > 0 ? startX : endX);
        rect.setAttribute('y', y - height / 2);
        rect.setAttribute('width', Math.abs(width));
        rect.setAttribute('height', height);

        // Handle color
        let color = 'rgba(255, 226, 52, 0.6)';
        if (highlight.color) {
            color = highlight.color;
        }

        rect.setAttribute('fill', color);
        rect.setAttribute('rx', '2');
        rect.setAttribute('ry', '2');
        rect.setAttribute('opacity', '0.4');

        g.appendChild(rect);
        pageInfo.wrapper.appendChild(svg);

        // Create Hitbox for interaction and flashing
        const hitbox = document.createElement('div');
        hitbox.className = 'highlighter-hitbox';
        hitbox.style.position = 'absolute';
        hitbox.style.left = `${bounds.left}px`;
        hitbox.style.top = `${bounds.top}px`;
        hitbox.style.width = `${bounds.width}px`;
        hitbox.style.height = `${bounds.height}px`;
        hitbox.style.cursor = 'pointer';
        hitbox.style.pointerEvents = 'auto'; // Enable interactions
        hitbox.style.backgroundColor = 'transparent';
        hitbox.style.zIndex = '100';
        hitbox.dataset.highlightId = highlight.id;

        if (cardId) {
            hitbox.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onHighlightClick) {
                    this.onHighlightClick(e, highlight.id, cardId);
                }
            });
        } else {
            hitbox.style.pointerEvents = 'none';
        }

        pageInfo.wrapper.appendChild(hitbox);
    }

    flashHighlight(highlightId) {

        const overlays = this.container.querySelectorAll(`[data-highlight-id="${highlightId}"]`);

        if (overlays.length === 0) {
            // This is normal if the page hasn't been rendered yet due to lazy loading
            // The highlight will be rendered when the page scrolls into view

            return;
        }

        overlays.forEach(el => {
            // Remove class if it exists to restart animation
            el.classList.remove('flash-effect');

            // Force reflow
            void el.offsetWidth;

            // Add class
            el.classList.add('flash-effect');

            // Remove after animation
            setTimeout(() => {
                el.classList.remove('flash-effect');
            }, 1000);
        });
    }

    removeHighlightOverlays(highlightId) {
        const overlays = this.container.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
        overlays.forEach(overlay => overlay.remove());
    }

    /**
     * Clear all highlight overlays from all pages
     * Called when importing a new drawnix file to ensure clean slate
     */
    clearAllHighlights() {


        // Remove all highlight overlay divs
        const highlightOverlays = this.container.querySelectorAll('.highlight-overlay');
        highlightOverlays.forEach(overlay => overlay.remove());

        // Remove all area highlight borders
        const areaHighlights = this.container.querySelectorAll('.area-highlight-border');
        areaHighlights.forEach(border => border.remove());

        // Remove all highlighter SVGs
        const highlighterSvgs = this.container.querySelectorAll('.highlighter-svg');
        highlighterSvgs.forEach(svg => svg.remove());

        // Remove all highlighter hitboxes
        const hitboxes = this.container.querySelectorAll('.highlighter-hitbox');
        hitboxes.forEach(hitbox => hitbox.remove());


    }
}
