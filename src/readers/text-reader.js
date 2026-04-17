import { parse } from 'marked';
import { highlightManager } from '../core/highlight-manager.js';
import { getAppContext } from '../app/app-context.js';
import {
    applyReaderSelectionMode,
    clearSelectedHighlightState,
    createTouchSelectionScheduler,
    createReaderHighlightToolbar,
    handleReaderHighlightClick,
    findCardIdByHighlightId,
    removeHighlightFromStores,
    registerBasicReaderListeners,
    updateHighlightModelColor
} from './reader-shared.js';

export class TextReader {
    constructor(container) {
        this.container = container;
        this.fileId = null;
        this.content = null;
        this.defaultColor = '#FFE234'; // Default yellow
        this.selectedHighlightId = null;
        this.cleanupListeners = null;
        this.touchSelectionScheduler = createTouchSelectionScheduler(
            () => this.handleSelection(),
            {
                readSelection: () => window.getSelection(),
                getSignature: (selection) => {
                    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                        return '';
                    }

                    return selection.toString().trim();
                }
            }
        );

        registerBasicReaderListeners(this, {
            onCardDeleted: (highlightId) => {
                this.removeVisualHighlight(highlightId);
            }
        });

        // Initialize Toolbar
        this.toolbar = createReaderHighlightToolbar(container, {
            onDeleteHighlight: (highlightId, cardId) => {
                this.deleteHighlight(highlightId, cardId);
            },
            onUpdateColor: (highlightId, color) => {
                this.updateHighlightColor(highlightId, color);
                updateHighlightModelColor(highlightId, color);
            }
        });
    }

    getCardSystem() {
        return getAppContext().cardSystem;
    }

    findRangeByOffsets(startIndex, length) {
        if (!this.content || !Number.isFinite(startIndex) || !Number.isFinite(length) || length <= 0) {
            return null;
        }

        const walker = document.createTreeWalker(this.content, NodeFilter.SHOW_TEXT, null, false);
        let consumed = 0;
        let startNode = null;
        let endNode = null;
        let startOffset = 0;
        let endOffset = 0;
        let node;

        while (node = walker.nextNode()) {
            const textLength = node.textContent.length;

            if (!startNode && startIndex <= consumed + textLength) {
                startNode = node;
                startOffset = Math.max(0, startIndex - consumed);
            }

            if (startNode && startIndex + length <= consumed + textLength) {
                endNode = node;
                endOffset = Math.max(0, startIndex + length - consumed);
                break;
            }

            consumed += textLength;
        }

        if (!startNode || !endNode) {
            return null;
        }

        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return range;
    }

    buildTextLocation(startIndex, length) {
        const location = {
            index: startIndex,
            length
        };

        if (!this.content || !Number.isFinite(startIndex) || !Number.isFinite(length) || length <= 0) {
            return location;
        }

        const textContent = this.content.textContent || '';
        const safeStart = Math.max(0, Math.min(startIndex, textContent.length));
        const safeEnd = Math.max(safeStart, Math.min(startIndex + length, textContent.length));
        const beforeSelection = textContent.slice(0, safeStart);
        const selectedText = textContent.slice(safeStart, safeEnd);
        const lineStart = beforeSelection.split('\n').length;
        const lineBreakCount = (selectedText.match(/\n/g) || []).length;

        location.lineStart = lineStart;
        location.lineEnd = lineStart + lineBreakCount;
        return location;
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
            this.content.addEventListener('touchend', (e) => {
                this.touchSelectionScheduler.schedule(e);
            }, { passive: true });
            this.container.addEventListener('scroll', () => {
                this.onScrollChange?.(this.container.scrollTop);
            }, { passive: true });

            // Global click to hide toolbar
            this.content.addEventListener('mousedown', (e) => {
                if (!e.target.closest('.modern-highlight-toolbar') && !e.target.classList.contains('highlight')) {
                    clearSelectedHighlightState(this);
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
        if (!this.content) return;

        const textToFind = highlight.text;
        if (!textToFind) return;

        let range = this.findRangeByOffsets(highlight.location?.index, highlight.location?.length || textToFind.length);
        let restoredWithFallback = false;

        if (!range) {
            restoredWithFallback = true;
            const walker = document.createTreeWalker(this.content, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.includes(textToFind)) {
                    if (node.parentElement.classList.contains('highlight')) continue;

                    const index = node.textContent.indexOf(textToFind);
                    range = document.createRange();
                    range.setStart(node, index);
                    range.setEnd(node, index + textToFind.length);
                    break;
                }
            }
        }

        if (!range) {
            return;
        }

        highlight.needsValidation = restoredWithFallback;
        if ((!Number.isFinite(highlight.location?.lineStart) || !Number.isFinite(highlight.location?.lineEnd))
            && Number.isFinite(highlight.location?.index)) {
            highlight.location = {
                ...highlight.location,
                ...this.buildTextLocation(
                    highlight.location.index,
                    highlight.location.length || textToFind.length
                )
            };
        }

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

                const highlight = highlightManager.createHighlight(
                    text,
                    this.buildTextLocation(start, text.length),
                    this.fileId,
                    'text',
                    this.defaultColor
                );

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
                highlightManager.createHighlight(
                    text,
                    this.buildTextLocation(start, text.length),
                    this.fileId,
                    'text',
                    this.defaultColor
                );
            }
        }
    }

    handleHighlightClick(e, highlightId) {
        const cardId = findCardIdByHighlightId(this.getCardSystem(), highlightId);
        handleReaderHighlightClick(this, e, highlightId, cardId);
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
        clearSelectedHighlightState(this, highlightId);
    }

    deleteHighlight(highlightId, cardId) {

        this.removeVisualHighlight(highlightId);

        removeHighlightFromStores(this.getCardSystem(), highlightId, cardId);
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
        this.container.scrollTop = Number.isFinite(location?.scrollTop) ? location.scrollTop : 0;
    }

    setPageCountCallback(callback) {
        this.onPageCountChange = callback;
    }

    setPageChangeCallback(callback) {
        this.onPageChange = callback;
    }

    setScrollChangeCallback(callback) {
        this.onScrollChange = callback;
    }

    getCurrentLocation() {
        return {
            scrollTop: this.container?.scrollTop || 0
        };
    }

    setSelectionMode(mode) {
        this.selectionMode = mode;
        applyReaderSelectionMode({
            container: this.container,
            mode,
            targetElements: [this.content],
            textCursor: 'text',
            nonTextCursor: 'grab',
            disableSelectionClass: true,
            nonTextTouchAction: 'auto'
        });
    }

    centerContentHorizontally() {
        const overflowX = this.container.scrollWidth - this.container.clientWidth;
        this.container.scrollLeft = overflowX > 0 ? overflowX / 2 : 0;
    }

    onLayoutChange() {
        if (this.content) {
            this.content.style.marginLeft = 'auto';
            this.content.style.marginRight = 'auto';
        }
        window.requestAnimationFrame(() => this.centerContentHorizontally());
    }

    destroy() {
        this.touchSelectionScheduler?.cancel?.();
        this.cleanupListeners?.();
        this.cleanupListeners = null;
        if (this.toolbar) this.toolbar.hide();
        this.container.innerHTML = '';
        this.onPageChange = null;
        this.onPageCountChange = null;
        this.content = null;
    }
}
