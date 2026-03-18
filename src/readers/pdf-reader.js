import * as pdfjsLib from 'pdfjs-dist';
import { highlightManager } from '../core/highlight-manager.js';
import { PDFHighlightToolbar } from './pdf-highlight-toolbar.jsx';
import { PDFAreaSelector } from './pdf-area-selector.js';
import { PDFHighlightRenderer } from './pdf-highlight-renderer.js';
import { PDFHighlighterTool } from './pdf-highlighter-tool.js';
import { getAppContext, setAppService, updateCurrentBook } from '../app/app-context.js';
import {
    registerPdfReaderGlobalListeners,
    setupPdfPanHandling,
    setupPdfZoomHandling
} from './pdf-reader-events.js';
import {
    applyHighlightColorToElements,
    collectSelectionRects,
    createPageWrapper,
    findHighlightById,
    getNearestPageNumber,
    resolveDestinationPageNumber,
    syncDefaultHighlightColor
} from './pdf-reader-utils.js';

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
    static currentSelectionMode = 'pan';

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
        this.cleanupCallbacks = [];
        this.boundDetectCurrentPage = this.detectCurrentPage.bind(this);
        this.handleScrollTick = () => {
            if (!this.scrollTicking) {
                window.requestAnimationFrame(() => {
                    this.detectCurrentPage();
                    this.scrollTicking = false;
                });
                this.scrollTicking = true;
            }
        };

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
        this.initEventHandlers();

        this.cleanupCallbacks.push(registerPdfReaderGlobalListeners(this));

        // Initialize selection mode and colors
        this.setSelectionMode(this.selectionMode);

        this.cleanupCallbacks.push(setupPdfZoomHandling(
            this.container,
            () => this.scale,
            (newScale) => this.setScale(newScale)
        ));
        this.cleanupCallbacks.push(setupPdfPanHandling(
            this.container,
            () => this.selectionMode
        ));
    }

    initEventHandlers() {
        this.handleCardSoftDeleted = (e) => {
            const { highlightId } = e.detail;
            if (highlightId) {
                this.removeHighlightOverlays(highlightId);
            }
        };

        this.handleCardRestored = (e) => {
            const { highlightId } = e.detail;
            const highlight = findHighlightById(getAppContext().highlightManager?.highlights, highlightId);
            if (!highlight) return;

            const pageInfo = this.pages[highlight.location.page - 1];
            if (pageInfo?.rendered) {
                this.removeHighlightOverlays(highlightId);
                this.renderHighlightsForPage(highlight.location.page, getAppContext().highlightManager.highlights);
            }
        };

        this.handleHighlightsRestored = (e) => {
            const highlights = e.detail.highlights;
            this.pages.forEach((pageInfo) => {
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
            this.highlightRenderer.removeHighlightOverlays(highlightId);
        };

        this.handleKeyDown = (e) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;

            const selectedHighlightId = this.toolbar.getSelectedHighlightId();
            if (!selectedHighlightId) return;

            const activeTag = document.activeElement.tagName;
            const isContentEditable = document.activeElement.isContentEditable;
            if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && !isContentEditable) {
                e.preventDefault();
                this.deleteHighlight(selectedHighlightId, this.toolbar.getSelectedCardId());
                this.hideToolbar();
            }
        };
    }

    async setScale(newScale) {
        if (Math.abs(this.scale - newScale) < 0.01) return;

        // Calculate current center relative position to maintain scroll
        const scrollTop = this.container.scrollTop;
        const scrollHeight = this.container.scrollHeight;
        const ratio = scrollHeight > 0 ? scrollTop / scrollHeight : 0;

        this.scale = newScale;

        // Reload pages with new scale
        await this.initPages();

        // Restore scroll position
        if (ratio > 0) {
            this.container.scrollTop = this.container.scrollHeight * ratio;
        }
    }

    initObserver() {
        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            {
                root: this.container,
                threshold: [0.01, 0.5], // Check small and large intersections
                rootMargin: '200px' // Preload margin
            }
        );
        this.cleanupCallbacks.push(() => {
            if (this.observer) {
                this.observer.disconnect();
            }
        });

        // Add scroll listener for smoother page updates
        this.container.addEventListener('scroll', this.handleScrollTick, { passive: true });
        this.cleanupCallbacks.push(() => {
            this.container.removeEventListener('scroll', this.handleScrollTick);
        });
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
            this.container.style.cursor = 'text';
            this.container.style.touchAction = 'pan-x pan-y pinch-zoom';
        } else if (mode === 'pan') {
            this.container.classList.add('disable-selection');
            this.container.style.cursor = 'grab';
            this.container.style.touchAction = 'none';
        } else {
            this.container.classList.add('disable-selection');
            this.container.style.cursor = 'default';
            this.container.style.touchAction = 'none';
        }
    }

    handleSelection(pageNum) {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        // Normalize whitespace to avoid issues with PDF text extraction
        const text = selection.toString().trim().replace(/\s+/g, ' ');
        if (!text) return;

        // NEW LOGIC: Support cross-page selection
        // Instead of assuming everything is on `pageNum`, we check which page each rect belongs to.

        const { highlightRects, overlayDescriptors } = collectSelectionRects(range, this.pages);
        const highlightOverlays = overlayDescriptors.map((descriptor) => {
            const highlightDiv = document.createElement('div');
            highlightDiv.className = 'highlight-overlay';
            highlightDiv.style.position = 'absolute';
            highlightDiv.style.top = `${descriptor.topPx}px`;
            highlightDiv.style.left = `${descriptor.leftPx}px`;
            highlightDiv.style.width = `${descriptor.width}px`;
            highlightDiv.style.height = `${descriptor.height}px`;
            highlightDiv.style.backgroundColor = PDFReader.defaultColors.text;
            if (PDFReader.defaultColors.text.startsWith('#')) {
                highlightDiv.style.opacity = '0.4';
            }
            highlightDiv.style.pointerEvents = 'none';
            highlightDiv.style.zIndex = '100';

            descriptor.pageWrapper.appendChild(highlightDiv);
            return highlightDiv;
        });

        if (highlightRects.length === 0) return;

        // Use the page of the first rect as the primary "location" page, 
        // but individual rects now carry their own page info.
        const primaryPage = highlightRects[0].page;

        // Create highlight data
        const highlight = highlightManager.createHighlight(text, {
            page: primaryPage, // Primary anchor page (for sorting/jumping)
            rects: highlightRects // Contains { page, top, ... }
        }, this.fileId, 'text', PDFReader.defaultColors.text, this.fileName);

        // Convert temporary overlays to clickable highlights
        highlightOverlays.forEach(div => {
            div.dataset.highlightId = highlight.id;
            div.style.pointerEvents = 'auto';
            div.style.cursor = 'pointer';

            // Wait for card creation
            setTimeout(() => {
                let cardId = null;
                if (getAppContext().cardSystem) {
                    const card = Array.from(getAppContext().cardSystem.cards.values()).find(c => c.highlightId === highlight.id);
                    if (card) {
                        cardId = card.id;
                        div.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.handleHighlightClick(e, highlight.id, cardId);
                        });
                    }
                }
            }, 100);
        });

        selection.removeAllRanges();
    }

    async load(fileData, initialPage = 1) {
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
            if (getAppContext().documentManager) {
                getAppContext().documentManager.markDocumentLoaded(fileData.id, true);
            }

            const arrayBuffer = await fileData.fileObj.arrayBuffer();

            // Calculate MD5
            try {
                const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                updateCurrentBook({
                    md5: hashHex,
                    name: fileData.name,
                    id: this.fileId
                });

                // Check if we have a pending restore for this book
                if (getAppContext().pendingRestore && getAppContext().pendingRestore.md5 === hashHex) {
                    const oldId = getAppContext().pendingRestore.id;
                    if (oldId) {
                        if (getAppContext().highlightManager) {
                            getAppContext().highlightManager.remapSourceIds(this.fileId, oldId);
                        }
                        if (getAppContext().cardSystem) {
                            getAppContext().cardSystem.remapSourceIds(this.fileId, oldId);
                        }
                    } else {
                        console.warn('[PDFReader] Pending restore found but no old ID. Skipping remapping to be safe.');
                    }

                    // Clear pending restore
                    setAppService('pendingRestore', null);
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
            if (initialPage > 1) { // Removed numPages check as this.pdfDoc might not be fully populated? No, it is awaited above.
                console.log('[PDFReader] Jumping to initial page:', initialPage);
                // Use a short delay to ensure layout
                setTimeout(() => {
                    this.scrollToPage(initialPage);
                }, 100);
            } else {
                this.initialScrollTimeout = setTimeout(() => {
                    requestAnimationFrame(() => {
                        this.container.scrollTop = 0;
                        this.container.scrollLeft = 0;
                        this.onPageChange?.(1);
                        this.initialScrollTimeout = null;
                    });
                }, 500);
            }

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
            const page = await this.pdfDoc.getPage(num);
            const viewport = page.getViewport({ scale: this.scale });
            const wrapper = createPageWrapper(num, viewport);

            this.container.appendChild(wrapper);

            this.pages.push({
                num,
                wrapper,
                viewport,
                rendered: false
            });

            this.observer.observe(wrapper);
        }
        this.container.addEventListener('scroll', this.boundDetectCurrentPage);
        this.cleanupCallbacks.push(() => {
            this.container.removeEventListener('scroll', this.boundDetectCurrentPage);
        });
    }

    handleIntersection(entries) {
        let needsUpdate = false;

        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const wrapper = entry.target;
                const pageNum = parseInt(wrapper.dataset.pageNum);
                const pageInfo = this.pages[pageNum - 1];

                if (pageInfo && !pageInfo.rendered) {
                    this.renderPage(pageInfo);
                }

                // Optimization: Unload pages that are far away
                this.cleanupPages(pageNum);

                needsUpdate = true;
            }
        });

        if (needsUpdate) {
            this.detectCurrentPage();
        }
    }

    detectCurrentPage() {
        if (!this.pages.length) return;

        const container = this.container;
        const viewTop = container.scrollTop;
        const viewHeight = container.clientHeight;
        const viewMiddle = viewTop + (viewHeight / 3); // Bias towards top third for "current" page

        let bestPage = this.currentPage || 1;

        // Find page covering the "middle" (top third) line
        for (const page of this.pages) {
            if (!page.wrapper) continue;
            const pageTop = page.wrapper.offsetTop;
            const pageBottom = pageTop + page.wrapper.offsetHeight;

            if (pageTop <= viewMiddle && pageBottom >= viewMiddle) {
                bestPage = page.num;
                break;
            }
        }

        if (this._lastReportedPage !== bestPage) {
            this._lastReportedPage = bestPage;
            this.onPageChange?.(bestPage);
        }
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

        const viewport = pageInfo.viewport;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Output scaling
        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = viewport.width * devicePixelRatio;
        canvas.height = viewport.height * devicePixelRatio;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const renderContext = {
            canvasContext: context,
            viewport: viewport,
            transform: [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0]
        };

        pageInfo.wrapper.appendChild(canvas);

        // Setup tool listeners on wrapper
        if (this.areaSelector) {
            this.areaSelector.setupListeners(pageInfo.wrapper, pageInfo.num);
        }
        if (this.highlighterTool) {
            this.highlighterTool.setupListeners(pageInfo.wrapper, pageInfo.num);
        }

        pageInfo.renderTask = this.pdfDoc.getPage(pageInfo.num).then(page => {
            return page.render(renderContext).promise;
        });

        pageInfo.renderTask.then(() => {
            // Render Text Layer
            this.renderTextLayer(pageInfo);
            // Render highlights for this page
            setTimeout(() => {
                if (this.highlightRenderer && getAppContext().highlightManager) {
                    const highlights = getAppContext().highlightManager.highlights;
                    this.highlightRenderer.renderHighlightsForPage(pageInfo.num, highlights);
                }
            }, 0);
        }).catch(err => {
            if (err.name !== 'RenderingCancelledException') {
                console.error('Render error:', err);
            }
        });
    }

    renderTextLayer(pageInfo) {
        this.pdfDoc.getPage(pageInfo.num).then(page => {
            page.getTextContent().then(textContent => {
                const textLayerDiv = document.createElement('div');
                textLayerDiv.className = 'textLayer';

                // Set explicit dimensions matching viewport
                textLayerDiv.style.width = `${pageInfo.viewport.width}px`;
                textLayerDiv.style.height = `${pageInfo.viewport.height}px`;

                // IMPORTANT: Set scale factor for correct text sizing
                textLayerDiv.style.setProperty('--scale-factor', pageInfo.viewport.scale);

                pageInfo.wrapper.appendChild(textLayerDiv);

                const textLayer = new pdfjsLib.TextLayer({
                    textContentSource: textContent,
                    container: textLayerDiv,
                    viewport: pageInfo.viewport,
                    textDivs: []
                });

                textLayer.render().then(() => {
                    textLayerDiv.addEventListener('mouseup', () => {
                        if (this.selectionMode === 'text') {
                            this.handleSelection(pageInfo.num);
                        }
                    });
                    textLayerDiv.addEventListener('touchend', () => {
                        if (this.selectionMode === 'text') {
                            setTimeout(() => {
                                this.handleSelection(pageInfo.num);
                            }, 120);
                        }
                    }, { passive: true });
                });
            });
        });
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
        const highlight = findHighlightById(getAppContext().highlightManager?.highlights, highlightId);

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

        // Dispatch global event for sync (Mindmap, Annotation List)
        window.dispatchEvent(new CustomEvent('highlight-clicked', {
            detail: { highlightId, cardId }
        }));
    }

    hideToolbar() {
        this.toolbar.hide();
    }

    deleteHighlight(highlightId, cardId) {
        // Removed confirmation dialog as requested

        if (cardId && getAppContext().cardSystem) {
            // Remove from card system. 
            // CardSystem will dispatch 'card-removed', which it listens to itself to then call highlightManager.removeHighlight.
            // This avoids double deletion and "unknown ID" errors.

            getAppContext().cardSystem.removeCard(cardId);
        } else if (getAppContext().highlightManager) {
            // If no card associated (orphan highlight), remove highlight directly

            getAppContext().highlightManager.removeHighlight(highlightId);
        }
    }

    removeHighlightOverlays(highlightId) {
        if (!highlightId) return;

        // Remove standard overlays (text highlights) and area borders (image highlights)
        const overlays = this.container.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
        overlays.forEach(el => el.remove());

        // Also remove from SVG layer if present
        const svgs = this.container.querySelectorAll(`[data-highlight-svg-id="${highlightId}"]`);
        svgs.forEach(el => el.remove());

        // Ensure HighlightRenderer also cleans up
        if (this.highlightRenderer) {
            this.highlightRenderer.removeHighlightOverlays(highlightId);
        }
    }

    updateHighlightColor(highlightId, color) {
        applyHighlightColorToElements(this.container, highlightId, color);

        // Update model
        if (getAppContext().highlightManager) {
            const highlight = findHighlightById(getAppContext().highlightManager.highlights, highlightId);
            if (highlight) {
                highlight.color = color;

                syncDefaultHighlightColor(PDFReader.defaultColors, highlight.type, color);

                if (highlight.type === 'highlighter') {
                    // If currently using highlighter, update tool immediately
                    if (this.selectionMode === 'highlighter') {
                        this.highlighterTool.setColor(color);
                    }
                } else if (highlight.type === 'rect' || highlight.type === 'rectangle') {
                    if (this.selectionMode === 'rect' || this.selectionMode === 'rectangle') {
                        this.areaSelector.setColor(color);
                    }
                } else if (highlight.type === 'ellipse') {
                    if (this.selectionMode === 'ellipse') {
                        this.areaSelector.setColor(color);
                    }
                }

                // Dispatch update event if needed for Mind Map sync
                window.dispatchEvent(new CustomEvent('highlight-updated', {
                    detail: { id: highlightId, color }
                }));
            }
        }
    }

    async getOutline() {
        if (!this.pdfDoc) return null;
        return await this.pdfDoc.getOutline();
    }

    async navigateToDest(dest) {
        if (!this.pdfDoc) return;

        try {
            const pageNum = await resolveDestinationPageNumber(this.pdfDoc, dest);
            if (!pageNum) {
                console.warn('[PDFReader] Destination is null');
                return;
            }

            this.scrollToPage(pageNum);
        } catch (e) {
            console.error('[PDFReader] Navigation error:', e);
        }
    }

    scrollToPage(pageNum) {
        console.log('[PDFReader] scrollToPage requested:', pageNum);

        // Cancel initial scroll reset if it's pending (Fix for auto-restore race condition)
        if (this.initialScrollTimeout) {
            clearTimeout(this.initialScrollTimeout);
            this.initialScrollTimeout = null;
        }

        pageNum = Math.max(1, Math.min(pageNum, this.pdfDoc.numPages));
        const pageInfo = this.pages[pageNum - 1];

        if (pageInfo && pageInfo.wrapper) {
            console.log('[PDFReader] Rolling to wrapper for page:', pageNum, 'Top:', pageInfo.wrapper.offsetTop);

            // Use 'auto' instead of 'smooth' to prevent race conditions during heavy render
            pageInfo.wrapper.scrollIntoView({ behavior: 'auto', block: 'start' });

            // Force immediate update
            // Verify if scroll actually happened before detecting?
            // setTimeout to allow layout to settle
            setTimeout(() => {
                this.detectCurrentPage();
            }, 50);
        } else {
            console.warn('[PDFReader] Page wrapper not found for:', pageNum);
        }
    }

    onPrevPage() {
        // Find first visible page or use current logic
        // Simply scrolling up by one page height? No, page-based.
        // We'll estimate current page from scroll position if needed, or track it.
        // For now, let's look at the first page that intersects or close to top.
        // A heuristic: find page closest to top of container.
        const bestPage = getNearestPageNumber(this.pages, this.container.scrollTop);

        if (bestPage > 1) {
            this.scrollToPage(bestPage - 1);
        }
    }

    onNextPage() {
        const bestPage = getNearestPageNumber(this.pages, this.container.scrollTop);

        if (bestPage < this.pdfDoc.numPages) {
            this.scrollToPage(bestPage + 1);
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

        this.cleanupCallbacks.forEach((cleanup) => cleanup());
        this.cleanupCallbacks = [];

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
