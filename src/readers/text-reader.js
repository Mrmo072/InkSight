import { parse } from 'marked';
import { highlightManager } from '../core/highlight-manager.js';
import { PDFHighlightToolbar } from './pdf-highlight-toolbar.jsx';

export class TextReader {
    constructor(container) {
        this.container = container;
        this.fileId = null;
        this.content = null;
        this.defaultColor = '#FFE234'; // Default yellow
        this.selectedHighlightId = null;

        // Bind handlers
        this.handleMindmapNodeUpdated = (e) => {
            const { highlightId, color } = e.detail;

            this.updateHighlightColor(highlightId, color);
        };

        this.handleCardDeleted = (e) => {
            const { id: cardId, highlightId, deleted } = e.detail;

            if (deleted && highlightId) {
                this.removeVisualHighlight(highlightId);
            }
        };

        this.handleKeyDown = (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedHighlightId) {

                // Find card ID
                let cardId = null;
                if (window.inksight && window.inksight.cardSystem) {
                    const card = Array.from(window.inksight.cardSystem.cards.values()).find(c => c.highlightId === this.selectedHighlightId);
                    if (card) cardId = card.id;
                }
                this.deleteHighlight(this.selectedHighlightId, cardId);
                this.selectedHighlightId = null;
                this.toolbar.hide();
            }
        };

        window.addEventListener('mindmap-node-updated', this.handleMindmapNodeUpdated);
        window.addEventListener('card-soft-deleted', this.handleCardDeleted);
        document.addEventListener('keydown', this.handleKeyDown);

        // Initialize Toolbar
        this.toolbar = new PDFHighlightToolbar(container, {
            onDeleteHighlight: (highlightId, cardId) => {
                this.deleteHighlight(highlightId, cardId);
            },
            onUpdateColor: (highlightId, color) => {
                this.updateHighlightColor(highlightId, color);
                // Also update model
                const highlight = highlightManager.getHighlight(highlightId);
                if (highlight) {
                    highlight.color = color;
                    // Dispatch update for Mind Map
                    window.dispatchEvent(new CustomEvent('highlight-updated', {
                        detail: { id: highlightId, color }
                    }));
                }
            }
        });
    }

    async load(fileData) {
        try {
            this.fileId = fileData.id;
            const text = await fileData.fileObj.text();
            const isMarkdown = fileData.name.toLowerCase().endsWith('.md') ||
                fileData.type === 'text/markdown';

            this.content = document.createElement('div');
            this.content.className = 'text-content';
            this.content.style.maxWidth = '800px';
            this.content.style.margin = '0 auto';
            this.content.style.padding = '40px';
            this.content.style.backgroundColor = 'white';
            this.content.style.minHeight = '100%';
            this.content.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
            this.content.style.lineHeight = '1.6';
            this.content.style.fontSize = '16px';
            this.content.style.color = '#333';

            if (isMarkdown) {
                this.content.innerHTML = parse(text);
            } else {
                this.content.style.whiteSpace = 'pre-wrap';
                this.content.style.fontFamily = 'monospace';
                this.content.textContent = text;
            }

            this.container.innerHTML = '';
            this.container.appendChild(this.content);

            // Selection listener
            this.content.addEventListener('mouseup', (e) => this.handleSelection(e));

            // Global click to hide toolbar
            this.content.addEventListener('mousedown', (e) => {
                if (!e.target.closest('.modern-highlight-toolbar') && !e.target.classList.contains('highlight')) {
                    this.toolbar.hide();
                    this.selectedHighlightId = null;
                }
            });

            this.onPageCountChange?.(1);
            this.onPageChange?.(1);

            // Restore existing highlights
            this.restoreHighlights();

        } catch (error) {
            console.error('Error loading text:', error);
            throw error;
        }
    }

    restoreHighlights() {
        if (!highlightManager || !this.fileId) return;

        const highlights = highlightManager.getHighlightsBySource(this.fileId);
        highlights.forEach(h => {
            // For text, we need to find the text and wrap it
            // This is tricky because we don't have exact ranges stored easily for restoration if DOM changed
            // But we stored index/length or just text.
            // Let's try to find by text content if index is not reliable or if we just want to be simple.
            // Actually, createHighlight stored { index, length } for text files.
            // We can try to use that if the text content hasn't changed.
            this.restoreHighlightVisual(h);
        });
    }

    restoreHighlightVisual(highlight) {
        // Simple text search restoration for now
        if (!this.content) return;

        const textToFind = highlight.text;
        if (!textToFind) return;

        // This is a simplified restoration that finds the FIRST occurrence. 
        // For robust restoration, we'd need to use the stored index.
        // But since we are just fixing the deletion sync, this is better than nothing.
        // TODO: Use highlight.location.index for precise restoration

        const walker = document.createTreeWalker(this.content, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes(textToFind)) {
                // Check if already highlighted to avoid duplicates (simple check)
                if (node.parentElement.classList.contains('highlight')) continue;

                const range = document.createRange();
                const index = node.textContent.indexOf(textToFind);
                range.setStart(node, index);
                range.setEnd(node, index + textToFind.length);

                try {
                    const span = document.createElement('span');
                    span.className = 'highlight';
                    this.applyHighlightStyle(span, highlight.color || this.defaultColor);
                    span.dataset.highlightId = highlight.id;

                    range.surroundContents(span);

                    span.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.handleHighlightClick(e, highlight.id);
                    });
                } catch (e) {
                    console.warn('[TextReader] Could not restore highlight:', e);
                }
                break; // Only restore first occurrence for now
            }
        }
    }

    handleSelection(e) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const text = selection.toString().trim();

        // Ensure selection is within our content
        if (!this.content.contains(range.commonAncestorContainer)) return;

        if (text && text.length > 0) {
            // Calculate index relative to content
            const preSelectionRange = range.cloneRange();
            preSelectionRange.selectNodeContents(this.content);
            preSelectionRange.setEnd(range.startContainer, range.startOffset);
            const start = preSelectionRange.toString().length;

            // Create visual highlight
            try {
                const span = document.createElement('span');
                span.className = 'highlight';

                this.applyHighlightStyle(span, this.defaultColor);

                range.surroundContents(span);

                selection.removeAllRanges();

                const highlight = highlightManager.createHighlight(text, {
                    index: start,
                    length: text.length
                }, this.fileId, 'text', this.defaultColor);

                span.dataset.highlightId = highlight.id;

                span.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleHighlightClick(e, highlight.id);
                });

                setTimeout(() => {
                    this.handleHighlightClick({ target: span }, highlight.id);
                }, 100);

            } catch (err) {
                console.warn('[TextReader] Could not visually highlight selection:', err);
                highlightManager.createHighlight(text, {
                    index: start,
                    length: text.length
                }, this.fileId, 'text', this.defaultColor);
            }
        }
    }

    handleHighlightClick(e, highlightId) {
        this.selectedHighlightId = highlightId;
        let cardId = null;
        if (window.inksight && window.inksight.cardSystem) {
            const card = Array.from(window.inksight.cardSystem.cards.values()).find(c => c.highlightId === highlightId);
            if (card) cardId = card.id;
        }


        this.toolbar.handleHighlightClick(e, highlightId, cardId);
    }

    removeVisualHighlight(highlightId) {

        if (this.content) {
            const spans = this.content.querySelectorAll(`span[data-highlight-id="${highlightId}"]`);
            spans.forEach(span => {
                const text = span.textContent;
                const textNode = document.createTextNode(text);
                span.parentNode.replaceChild(textNode, span);
            });
            this.content.normalize();
        }
        if (this.selectedHighlightId === highlightId) {
            this.selectedHighlightId = null;
            this.toolbar.hide();
        }
    }

    deleteHighlight(highlightId, cardId) {

        this.removeVisualHighlight(highlightId);

        if (cardId && window.inksight && window.inksight.cardSystem) {
            window.inksight.cardSystem.removeCard(cardId);
        } else {
            highlightManager.removeHighlight(highlightId);
        }
    }

    updateHighlightColor(highlightId, color) {
        if (!this.content) return;
        const spans = this.content.querySelectorAll(`span[data-highlight-id="${highlightId}"]`);
        spans.forEach(span => {
            this.applyHighlightStyle(span, color);
        });
        this.defaultColor = color;
    }

    applyHighlightStyle(span, color) {
        // Convert hex/rgb to rgba with 0.4 opacity for background
        let backgroundColor = color;

        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            if (hex.length === 3) {
                const r = parseInt(hex[0] + hex[0], 16);
                const g = parseInt(hex[1] + hex[1], 16);
                const b = parseInt(hex[2] + hex[2], 16);
                backgroundColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
            } else if (hex.length === 6) {
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                backgroundColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
            }
        } else if (color.startsWith('rgb(')) {
            backgroundColor = color.replace('rgb', 'rgba').replace(')', ', 0.4)');
        }

        span.style.backgroundColor = backgroundColor;
        span.style.opacity = '1';
        span.style.cursor = 'pointer';
    }

    async scrollToHighlight(highlightId) {

        const highlight = highlightManager.getHighlight(highlightId);

        if (!highlight) {
            console.warn('[TextReader] Highlight not found:', highlightId);
            return;
        }

        let foundNode = this.content.querySelector(`span[data-highlight-id="${highlightId}"]`);

        if (!foundNode) {
            // Try to restore it if not found (lazy restore)
            this.restoreHighlightVisual(highlight);
            foundNode = this.content.querySelector(`span[data-highlight-id="${highlightId}"]`);
        }

        if (foundNode) {
            foundNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
            foundNode.classList.add('active');
            setTimeout(() => {
                foundNode.classList.remove('active');
            }, 2000);
        }
    }

    onPrevPage() {
        this.container.scrollTop -= window.innerHeight * 0.8;
    }

    onNextPage() {
        this.container.scrollTop += window.innerHeight * 0.8;
    }

    goToLocation(location) {
        this.container.scrollTop = 0;
    }

    setPageCountCallback(callback) {
        this.onPageCountChange = callback;
    }

    setPageChangeCallback(callback) {
        this.onPageChange = callback;
    }

    setSelectionMode(mode) {
        this.selectionMode = mode;


        if (mode === 'text') {
            this.container.style.cursor = 'text';
            this.container.classList.remove('disable-selection');
        } else {
            this.container.style.cursor = 'default';
        }
    }

    destroy() {
        window.removeEventListener('mindmap-node-updated', this.handleMindmapNodeUpdated);
        window.removeEventListener('card-soft-deleted', this.handleCardDeleted);
        document.removeEventListener('keydown', this.handleKeyDown);
        if (this.toolbar) this.toolbar.hide();
        this.container.innerHTML = '';
        this.onPageChange = null;
        this.onPageCountChange = null;
        this.content = null;
    }
}
