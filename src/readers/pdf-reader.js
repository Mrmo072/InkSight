import * as pdfjsLib from 'pdfjs-dist';
import { highlightManager } from '../core/highlight-manager.js';
import { cardSystem } from '../core/card-system.js';
import { PDFHighlightToolbar } from './pdf-highlight-toolbar.jsx';
import { PDFAreaSelector } from './pdf-area-selector.js';
import { PDFHighlightRenderer } from './pdf-highlight-renderer.js';
import { PDFHighlighterTool } from './pdf-highlighter-tool.js';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
).toString();

export class PDFReader {
    // Static default colors - persists across instances (file switches)
    static defaultColors = {
        text: '#FFE234',
        highlighter: 'rgba(255, 226, 52, 0.6)',
        rect: '#FF6B6B',
        ellipse: '#FF6B6B'
    };

    // Static selection mode - persists across instances
    static currentSelectionMode = 'text';

    constructor(container) {
        this.container = container;
        // Make container focusable to receive keyboard events
        this.container.setAttribute('tabindex', '0');
        this.container.style.outline = 'none'; // Remove default focus outline
        this.pdfDoc = null;
        this.scale = 1.5;
        this.pages = []; // { num, wrapper, viewport, rendered }
        this.observer = null;
        this.selectionMode = PDFReader.currentSelectionMode; // Initialize from static state
        this.fileId = null;
        this.initialScrollTimeout = null;

        // Initialize modules
        this.highlightRenderer = new PDFHighlightRenderer(container, this.pages, this.fileId);
        this.highlightRenderer.setOnHighlightClick((e, highlightId, cardId) => {
            this.handleHighlightClick(e, highlightId, cardId);
        });

        this.areaSelector = new PDFAreaSelector({
            onHighlightClick: (e, highlightId, cardId) => {
                this.handleHighlightClick(e, highlightId, cardId);
            }
        });

        this.highlighterTool = new PDFHighlighterTool({
            container: container,
            pages: this.pages,
            onHighlightClick: (e, highlightId, cardId) => {
                this.handleHighlightClick(e, highlightId, cardId);
            }
        });

        this.toolbar = new PDFHighlightToolbar(container, {
            onDeleteHighlight: (highlightId, cardId) => {
                this.deleteHighlight(highlightId, cardId);
            },
            onUpdateColor: (highlightId, color) => {
                this.updateHighlightColor(highlightId, color);
            }
        });

        this.initObserver();

        // Bind handlers for cleanup
        this.handleCardSoftDeleted = (e) => {
            const { highlightId } = e.detail;

            if (highlightId) {
                this.removeHighlightOverlays(highlightId);
            }
        };

        this.handleCardRestored = (e) => {
            const { highlightId } = e.detail;

            if (highlightId && window.inksight && window.inksight.highlightManager) {
                const highlight = window.inksight.highlightManager.highlights.find(h => h.id === highlightId);
                if (highlight) {
                    const pageInfo = this.pages[highlight.location.page - 1];
                    if (pageInfo && pageInfo.rendered) {
                        // Remove existing overlays first (defensive)
                        this.removeHighlightOverlays(highlightId);
                        // Re-render highlights for this page
                        this.renderHighlightsForPage(highlight.location.page, window.inksight.highlightManager.highlights);
                    }
                }
            }
        };

        this.handleHighlightsRestored = (e) => {
            const highlights = e.detail.highlights;


            // Re-render highlights for all rendered pages
            this.pages.forEach(pageInfo => {
                if (pageInfo.rendered) {
                    this.renderHighlightsForPage(pageInfo.num, highlights);
                }
            });
        };

        this.handleMindmapNodeUpdated = (e) => {
            const { highlightId, color } = e.detail;

            this.updateHighlightColor(highlightId, color);
        };

        this.handleHighlightRemoved = (e) => {
            const highlightId = e.detail;
            if (this.highlighterTool) {
                this.highlighterTool.removeHighlight(highlightId);
            }
            // Also remove from renderer if needed (though renderer usually re-renders on page change)
            this.highlightRenderer.removeHighlightOverlays(highlightId);
        };

        this.handleKeyDown = (e) => {
            // console.log('[PDFReader] Keydown:', e.key); // Reduced logging

            if ((e.key === 'Delete' || e.key === 'Backspace')) {
                const selectedHighlightId = this.toolbar.getSelectedHighlightId();
                if (selectedHighlightId) {
                    // Check if we are not in an input field
                    const activeTag = document.activeElement.tagName;
                    const isContentEditable = document.activeElement.isContentEditable;

                    if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && !isContentEditable) {
                        // console.log('[PDFReader] Deleting highlight via key:', selectedHighlightId);
                        e.preventDefault(); // Prevent browser back navigation or other default actions
                        this.deleteHighlight(selectedHighlightId, this.toolbar.getSelectedCardId());
                        this.hideToolbar();
                    }
                }
            }
        };

        // Listen for card soft deletion to hide highlights
        window.addEventListener('card-soft-deleted', this.handleCardSoftDeleted);

        // Listen for card restoration to show highlights
        window.addEventListener('card-restored', this.handleCardRestored);

        // Listen for highlights restored
        window.addEventListener('highlights-restored', this.handleHighlightsRestored);

        // Listen for Mind Map node updates (color sync)
        window.addEventListener('mindmap-node-updated', this.handleMindmapNodeUpdated);

        // Global keydown listener for delete
        document.addEventListener('keydown', this.handleKeyDown);

        // Initialize selection mode and colors
        this.setSelectionMode(this.selectionMode);
    }

    initObserver() {
        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            {
                root: this.container,
                threshold: 0.1,
                rootMargin: '200px' // Preload margin
            }
        );
        // Listen for highlight removal to sync with Mind Map deletion
        // (Handler is bound in constructor now)
        window.addEventListener('highlight-removed', this.handleHighlightRemoved);
    }

    setPageCountCallback(callback) {
        this.onPageCountChange = callback;
    }

    setPageChangeCallback(callback) {
        this.onPageChange = callback;
    }

    setSelectionMode(mode) {
        this.selectionMode = mode;
        PDFReader.currentSelectionMode = mode; // Update static state
        this.areaSelector.setSelectionMode(mode);

        // Update tool colors based on mode
        if (mode === 'rect' || mode === 'rectangle' || mode === 'ellipse') {
            const colorKey = (mode === 'rect' || mode === 'rectangle') ? 'rect' : 'ellipse';
            this.areaSelector.setColor(PDFReader.defaultColors[colorKey]);
        } else if (mode === 'highlighter') {
            this.highlighterTool.setColor(PDFReader.defaultColors.highlighter);
        }

        // Activate highlighter tool if mode matches
        this.highlighterTool.setIsActive(mode === 'highlighter');


        // Toggle disable-selection class on container
        if (mode === 'text') {
            this.container.classList.remove('disable-selection');
        } else {
            this.container.classList.add('disable-selection');
        }
    }

    removeHighlightOverlays(highlightId) {
        this.highlightRenderer.removeHighlightOverlays(highlightId);
    }

    handleSelection(pageNum) {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        // Normalize whitespace to avoid issues with PDF text extraction
        const text = selection.toString().trim().replace(/\s+/g, ' ');
        if (!text) return;

        // Determine the actual page where the selection starts
        // This fixes issues where the mouse up event happens on a different page
        // or when the provided pageNum is stale.
        let startNode = range.startContainer;
        if (startNode.nodeType === Node.TEXT_NODE) {
            startNode = startNode.parentNode;
        }

        const wrapper = startNode.closest('.pdf-page-wrapper');
        if (!wrapper) {
            // console.warn('[PDFReader] Selection start not inside a page wrapper');
            return;
        }

        const actualPageNum = parseInt(wrapper.dataset.pageNum);
        const pageInfo = this.pages[actualPageNum - 1];

        // console.log(`[PDFReader] Selection on Page ${actualPageNum} (Event Page: ${pageNum})`);

        if (!pageInfo || !pageInfo.wrapper) return;

        const rects = range.getClientRects();

        // Use the wrapper of the actual page where selection started
        const wrapperRect = pageInfo.wrapper.getBoundingClientRect();
        const highlightRects = [];

        // Helper function to check if two rects overlap significantly
        const areRectsOverlapping = (rect1, rect2) => {
            const x1 = Math.max(rect1.left, rect2.left);
            const y1 = Math.max(rect1.top, rect2.top);
            const x2 = Math.min(rect1.left + rect1.width, rect2.left + rect2.width);
            const y2 = Math.min(rect1.top + rect1.height, rect2.top + rect2.height);

            if (x2 <= x1 || y2 <= y1) return false;

            const intersectionArea = (x2 - x1) * (y2 - y1);
            const rect1Area = rect1.width * rect1.height;
            const rect2Area = rect2.width * rect2.height;

            return intersectionArea > 0.5 * Math.min(rect1Area, rect2Area);
        };

        const processedRects = [];
        const highlightOverlays = [];

        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            if (rect.width === 0 || rect.height === 0) continue;

            // Convert to relative coordinates
            const top = rect.top - wrapperRect.top;
            const left = rect.left - wrapperRect.left;

            const currentRect = { top, left, width: rect.width, height: rect.height };

            // Check overlap
            if (processedRects.some(pr => areRectsOverlapping(pr, currentRect))) continue;

            const highlightDiv = document.createElement('div');
            highlightDiv.className = 'highlight-overlay';
            highlightDiv.style.position = 'absolute';
            highlightDiv.style.top = `${top}px`;
            highlightDiv.style.left = `${left}px`;
            highlightDiv.style.width = `${rect.width}px`;
            highlightDiv.style.height = `${rect.height}px`;
            highlightDiv.style.backgroundColor = PDFReader.defaultColors.text;
            if (PDFReader.defaultColors.text.startsWith('#')) {
                highlightDiv.style.opacity = '0.4';
            }
            highlightDiv.style.pointerEvents = 'none'; // Will be enabled after highlight is created
            highlightDiv.style.zIndex = '100'; // Match z-index of permanent highlights

            pageInfo.wrapper.appendChild(highlightDiv);
            highlightOverlays.push(highlightDiv);
            highlightRects.push(currentRect);
            processedRects.push(currentRect);
        }

        // Create highlight data
        const highlight = highlightManager.createHighlight(text, {
            page: actualPageNum,
            rects: highlightRects
        }, this.fileId, 'text', PDFReader.defaultColors.text, this.fileName);

        // Convert temporary overlays to clickable highlights
        highlightOverlays.forEach(div => {
            div.dataset.highlightId = highlight.id;
            div.style.pointerEvents = 'auto'; // Enable clicking
            div.style.cursor = 'pointer';

            // Find associated card ID
            let cardId = null;
            if (window.inksight && window.inksight.cardSystem) {
                // Card will be created by CardSystem listening to 'highlight-created' event
                // We need to wait a bit for the card to be created
                setTimeout(() => {
                    const card = Array.from(window.inksight.cardSystem.cards.values()).find(c => c.highlightId === highlight.id);
                    if (card) {
                        cardId = card.id;
                        // Now bind the click handler
                        div.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.handleHighlightClick(e, highlight.id, cardId);
                        });
                    }
                }, 100);
            }
        });

        selection.removeAllRanges();
    }

    async load(fileData) {
        try {
            // Clear highlights from previous document (visual only, preserve data)
            if (this.highlightRenderer && this.fileId) {

                this.highlightRenderer.clearAllHighlights();
            }

            this.fileId = fileData.id;
            this.fileName = fileData.name; // Store file name
            this.highlightRenderer.setFileId(fileData.id);
            this.areaSelector.setFileId(fileData.id);
            this.areaSelector.setFileName(fileData.name); // Pass file name to area selector
            if (this.highlighterTool) {
                this.highlighterTool.setFileId(fileData.id);
            }

            // Notify DocumentManager that this document is now loaded
            if (window.inksight && window.inksight.documentManager) {
                window.inksight.documentManager.markDocumentLoaded(fileData.id, true);
            }

            const arrayBuffer = await fileData.fileObj.arrayBuffer();

            // Calculate MD5
            try {
                const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                if (window.inksight) {
                    window.inksight.currentBook.md5 = hashHex;
                    window.inksight.currentBook.name = fileData.name;
                    window.inksight.currentBook.id = this.fileId;


                    // Check if we have a pending restore for this book
                    if (window.inksight.pendingRestore && window.inksight.pendingRestore.md5 === hashHex) {


                        const oldId = window.inksight.pendingRestore.id;
                        if (oldId) {
                            if (window.inksight.highlightManager) {
                                window.inksight.highlightManager.remapSourceIds(this.fileId, oldId);
                            }
                            if (window.inksight.cardSystem) {
                                window.inksight.cardSystem.remapSourceIds(this.fileId, oldId);
                            }
                        } else {
                            console.warn('[PDFReader] Pending restore found but no old ID. Skipping remapping to be safe.');
                        }

                        // Clear pending restore
                        window.inksight.pendingRestore = null;
                    }
                }
            } catch (e) {
                console.error('[PDFReader] Error calculating hash:', e);
            }

            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            this.pdfDoc = await loadingTask.promise;

            this.onPageCountChange?.(this.pdfDoc.numPages);

            await this.initPages();

            // Reset scroll position to show first page
            // Store timeout so it can be cancelled if a jump occurs immediately
            this.initialScrollTimeout = setTimeout(() => {
                requestAnimationFrame(() => {
                    this.container.scrollTop = 0;
                    this.container.scrollLeft = 0;
                    this.onPageChange?.(1);
                    this.initialScrollTimeout = null;
                });
            }, 500);

            return this.pdfDoc;
        } catch (error) {
            console.error('Error loading PDF:', error);
            throw error;
        }
    }

    async initPages() {
        this.container.innerHTML = '';
        // Clear array instead of reassigning to maintain reference in highlightRenderer
        this.pages.length = 0;

        for (let num = 1; num <= this.pdfDoc.numPages; num++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'pdf-page-wrapper';
            wrapper.style.position = 'relative';
            wrapper.style.backgroundColor = 'white';
            wrapper.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
            wrapper.style.overflow = 'visible';
            wrapper.style.margin = '20px auto'; // Center the page
            wrapper.dataset.pageNum = num;

            const page = await this.pdfDoc.getPage(num);
            const viewport = page.getViewport({ scale: this.scale });

            wrapper.style.width = `${viewport.width}px`;
            wrapper.style.height = `${viewport.height}px`;

            this.container.appendChild(wrapper);

            this.pages.push({
                num,
                wrapper,
                viewport,
                rendered: false
            });

            this.observer.observe(wrapper);
        }
    }

    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const wrapper = entry.target;
                const pageNum = parseInt(wrapper.dataset.pageNum);
                const pageInfo = this.pages[pageNum - 1];

                if (!pageInfo.rendered) {
                    this.renderPage(pageInfo);
                }

                this.onPageChange?.(pageNum);

                // Optimization: Unload pages that are far away
                this.cleanupPages(pageNum);
            }
        });
    }

    cleanupPages(currentPage) {
        const KEEP_RANGE = 3; // Keep current page +/- 3 pages

        // We can optimize this loop if pages array is large, but for typical PDFs it's fine.
        // For very large PDFs (1000+ pages), we might want to only check pages around the previously rendered range.
        // But iterating 1000 items is fast enough in JS.

        this.pages.forEach(page => {
            if (page.rendered && Math.abs(page.num - currentPage) > KEEP_RANGE) {
                // console.log(`[PDFReader] Unloading page ${page.num}`);
                page.wrapper.innerHTML = ''; // Clear canvas and text layer
                page.rendered = false;
            }
        });
    }

    async renderPage(pageInfo) {
        if (pageInfo.rendered) return;
        pageInfo.rendered = true;

        const { wrapper, num, viewport } = pageInfo;
        const page = await this.pdfDoc.getPage(num);

        // Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.display = 'block';
        wrapper.appendChild(canvas);

        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        // Text Layer
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.position = 'absolute';
        textLayerDiv.style.top = '0';
        textLayerDiv.style.left = '0';
        // Explicitly set dimensions to match viewport - attempting to fix alignment
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        // Set scale factor for PDF.js text layer (Critical for correct text spacing/sizing)
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);

        textLayerDiv.style.overflow = 'hidden';
        textLayerDiv.style.lineHeight = '1.0';
        textLayerDiv.style.color = 'transparent';
        textLayerDiv.style.zIndex = '1';

        wrapper.appendChild(textLayerDiv);

        const textContent = await page.getTextContent();

        const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: []
        });

        await textLayer.render();

        const textSpans = textLayerDiv.querySelectorAll('span');
        textSpans.forEach(span => {
            span.style.pointerEvents = 'auto';
            span.style.cursor = 'text';
            span.style.userSelect = 'text';
        });

        // Setup mouse event for text selection
        textLayerDiv.addEventListener('mouseup', () => {
            if (this.selectionMode === 'text') {
                this.handleSelection(num);
            }
        });

        // Setup area selection listeners
        this.areaSelector.setupListeners(wrapper, num);

        // Setup highlighter tool listeners
        if (this.highlighterTool) {
            this.highlighterTool.setupListeners(wrapper, num);
        }

        // Render existing highlights for this page
        if (window.inksight && window.inksight.highlightManager) {
            const highlights = window.inksight.highlightManager.highlights;
            this.renderHighlightsForPage(num, highlights);
        }
    }

    renderHighlightsForPage(pageNum, highlights) {
        this.highlightRenderer.renderHighlightsForPage(pageNum, highlights);
    }

    flashHighlight(highlightId) {
        this.highlightRenderer.flashHighlight(highlightId);
    }

    async scrollToHighlight(highlightId) {
        // console.log('[PDFReader] scrollToHighlight:', highlightId);

        // Cancel any pending initial scroll reset (race condition fix)
        if (this.initialScrollTimeout) {
            // console.log('[PDFReader] Cancelling initial scroll reset due to jump request');
            clearTimeout(this.initialScrollTimeout);
            this.initialScrollTimeout = null;
        }

        // Find highlight
        let highlight = null;
        if (window.inksight && window.inksight.highlightManager) {
            highlight = window.inksight.highlightManager.highlights.find(h => h.id === highlightId);
        }

        if (!highlight) {
            console.warn('[PDFReader] Highlight not found for scrolling:', highlightId);
            return;
        }

        const pageNum = highlight.location.page;
        const pageInfo = this.pages[pageNum - 1];

        if (!pageInfo || !pageInfo.wrapper) {
            console.warn('[PDFReader] Page wrapper not found for page:', pageNum);
            return;
        }

        // 1. Scroll page into view immediately
        pageInfo.wrapper.scrollIntoView({ behavior: 'auto', block: 'center' });

        // 2. Ensure page is rendered
        if (!pageInfo.rendered) {
            // console.log('[PDFReader] Page not rendered, rendering now:', pageNum);
            await this.renderPage(pageInfo);
        } else {
            // console.log('[PDFReader] Page already rendered:', pageNum);
        }

        // 3. Flash highlight (now that we know it's rendered)
        // Small delay to allow DOM updates if just rendered
        setTimeout(() => {
            this.flashHighlight(highlightId);
        }, 100);
    }

    handleHighlightClick(e, highlightId, cardId) {
        // Focus the container to ensure keyboard events are captured here
        this.container.focus();
        this.toolbar.handleHighlightClick(e, highlightId, cardId);
    }

    hideToolbar() {
        this.toolbar.hide();
    }

    deleteHighlight(highlightId, cardId) {
        // Removed confirmation dialog as requested

        if (cardId && window.inksight && window.inksight.cardSystem) {
            // Remove from card system. 
            // CardSystem will dispatch 'card-removed', which it listens to itself to then call highlightManager.removeHighlight.
            // This avoids double deletion and "unknown ID" errors.

            window.inksight.cardSystem.removeCard(cardId);
        } else if (window.inksight && window.inksight.highlightManager) {
            // If no card associated (orphan highlight), remove highlight directly

            window.inksight.highlightManager.removeHighlight(highlightId);
        }
    }

    updateHighlightColor(highlightId, color) {
        // Update visual
        const overlays = this.container.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
        overlays.forEach(el => {
            if (el.classList.contains('highlight-overlay')) {
                el.style.backgroundColor = color.replace(')', ', 0.4)').replace('rgb', 'rgba');
                if (color.startsWith('#')) {
                    el.style.backgroundColor = color;
                    el.style.opacity = '0.4';
                }
            } else if (el.classList.contains('area-highlight-border')) {
                el.style.borderColor = color;
                el.style.backgroundColor = color + '1A'; // 10% opacity
            }
        });

        // Update SVG highlights (Highlighter Tool)
        const svgs = this.container.querySelectorAll(`[data-highlight-svg-id="${highlightId}"]`);
        svgs.forEach(svg => {
            const rect = svg.querySelector('rect');
            if (rect) {
                rect.setAttribute('fill', color);
                // Ensure opacity is maintained (SVG rect has opacity attribute)
                rect.setAttribute('opacity', '0.4');
            }
        });

        // Update model
        if (window.inksight && window.inksight.highlightManager) {
            const highlight = window.inksight.highlightManager.highlights.find(h => h.id === highlightId);
            if (highlight) {
                highlight.color = color;

                // Update default color memory
                if (highlight.type === 'text') {
                    PDFReader.defaultColors.text = color;
                } else if (highlight.type === 'highlighter') {
                    PDFReader.defaultColors.highlighter = color;
                    // If currently using highlighter, update tool immediately
                    if (this.selectionMode === 'highlighter') {
                        this.highlighterTool.setColor(color);
                    }
                } else if (highlight.type === 'rect' || highlight.type === 'rectangle') {
                    PDFReader.defaultColors.rect = color;
                    if (this.selectionMode === 'rect' || this.selectionMode === 'rectangle') {
                        this.areaSelector.setColor(color);
                    }
                } else if (highlight.type === 'ellipse') {
                    PDFReader.defaultColors.ellipse = color;
                    if (this.selectionMode === 'ellipse') {
                        this.areaSelector.setColor(color);
                    }
                } else if (highlight.type === 'image') {
                    // Fallback for generic images if any
                    PDFReader.defaultColors.rect = color;
                    PDFReader.defaultColors.ellipse = color;
                }

                // Dispatch update event if needed for Mind Map sync
                window.dispatchEvent(new CustomEvent('highlight-updated', {
                    detail: { id: highlightId, color }
                }));
            }
        }
    }

    /**
     * Clean up all event listeners and resources
     */
    destroy() {


        if (this.initialScrollTimeout) {
            clearTimeout(this.initialScrollTimeout);
            this.initialScrollTimeout = null;
        }

        // Disconnect observer
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        // Remove global event listeners
        window.removeEventListener('card-soft-deleted', this.handleCardSoftDeleted);
        window.removeEventListener('card-restored', this.handleCardRestored);
        window.removeEventListener('highlights-restored', this.handleHighlightsRestored);
        window.removeEventListener('mindmap-node-updated', this.handleMindmapNodeUpdated);
        window.removeEventListener('highlight-removed', this.handleHighlightRemoved);
        document.removeEventListener('keydown', this.handleKeyDown);

        // Clean up sub-components
        if (this.areaSelector) {
            this.areaSelector.destroy();
        }
        if (this.highlighterTool) {
            // Assuming highlighterTool might need cleanup too, but for now just null it
            // Ideally add destroy to highlighterTool as well
        }
        if (this.toolbar) {
            this.toolbar.hide();
            // Remove toolbar element if it was appended to body/container
        }

        // Clear container
        this.container.innerHTML = '';
        this.pages = [];
        this.pdfDoc = null;
    }
}
