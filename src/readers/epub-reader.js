import ePub from 'epubjs';
import { highlightManager } from '../core/highlight-manager.js';
import { cardSystem } from '../core/card-system.js';
import { getAppContext } from '../app/app-context.js';
import {
    applyReaderSelectionMode,
    clearSelectedHighlightState,
    createTouchSelectionScheduler,
    createReaderHighlightToolbar,
    deleteSelectedReaderHighlight,
    findCardIdByHighlightId,
    handleReaderHighlightClick,
    removeHighlightFromStores,
    registerBasicReaderListeners,
    updateHighlightModelColor
} from './reader-shared.js';

export class EpubReader {
    constructor(container) {
        this.container = container;
        this.book = null;
        this.rendition = null;
        this.cfi = null;
        this.fileId = null;
        this.annotations = new Map(); // Map highlightId -> cfi
        this.defaultColor = '#FFE234'; // Default highlight color
        this.selectedHighlightId = null;
        this.isDeleting = false; // Flag to suppress selection events during deletion
        this.deletedHighlightIds = new Set(); // Track deleted highlight IDs
        this.deletedCFIs = new Set(); // Track deleted CFIs to prevent re-creation with new IDs
        this.cleanupListeners = null;
        this.pendingSelection = null;
        this.lastKnownPage = 1;
        this.lastKnownPageCount = 0;
        this.locationsGenerated = false;
        this.layoutChangePromise = Promise.resolve();
        this.locationsReadyPromise = null;
        this.flashRestoreTimeout = null;
        this.touchSelectionScheduler = createTouchSelectionScheduler(
            () => {
                if (!this.pendingSelection) {
                    return;
                }

                const { cfiRange, contents } = this.pendingSelection;
                this.commitSelection(cfiRange, contents);
            },
            {
                readSelection: () => this.pendingSelection,
                getSignature: (selection) => selection?.cfiRange || ''
            }
        );

        this.toolbar = createReaderHighlightToolbar(container, {
            onDeleteHighlight: (highlightId, cardId) => {
                this.deleteHighlight(highlightId, cardId);
            },
            onUpdateColor: (highlightId, color) => {
                this.updateHighlightColor(highlightId, color);
            }
        });

        this.beforeDeleteSelectedHighlight = (e) => {
            e.preventDefault(); // Prevent browser back/navigation
        };
        this.handleCardRestoredHighlight = (highlightId) => {
            this.deletedHighlightIds.delete(highlightId);
        };
        registerBasicReaderListeners(this, {
            onCardDeleted: (highlightId) => {
                if (this.isDeleting) {
                    return;
                }

                this.removeVisualHighlight(highlightId);
            }
        });
    }

    getCardSystem() {
        return getAppContext().cardSystem || cardSystem;
    }

    async load(fileData) {

        try {
            this.fileId = fileData.id;

            // Debug: Check file signature

            const buffer = await fileData.fileObj.arrayBuffer();
            const view = new Uint8Array(buffer);
            const signature = Array.from(view.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ');


            if (signature !== '50 4b 03 04') {
                console.warn('[EpubReader] Warning: File does not start with standard Zip Local File Header signature (50 4b 03 04). It might be corrupted or empty.');
            }

            // Initialize book with File object directly

            this.book = ePub(fileData.fileObj);



            await this.book.ready;


            // Clear loading message
            this.container.innerHTML = '';

            this.rendition = this.book.renderTo(this.container, {
                width: '100%',
                height: '100%',
                flow: 'paginated',
                manager: 'default',
                allowScriptedContent: true
            });

            // Mouse wheel support & Keydown support inside iframe
            this.rendition.hooks.content.register((contents) => {
                const doc = contents.document;

                doc.addEventListener('wheel', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        if (e.cancelable) e.preventDefault();
                        return;
                    }

                    // Prevent default scrolling if needed, or just trigger nav
                    if (e.deltaY > 0) {
                        this.onNextPage();
                    } else if (e.deltaY < 0) {
                        this.onPrevPage();
                    }
                }, { passive: false });

                // Keydown listener for DEL inside iframe
                doc.addEventListener('keydown', (e) => {
                    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
                        e.preventDefault();
                        return;
                    }

                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        if (this.selectedHighlightId) {
                            e.preventDefault(); // Prevent browser back/navigation

                            deleteSelectedReaderHighlight(this);
                        }
                    }
                });

                // Click listener to clear selection if clicking elsewhere
                doc.addEventListener('click', (e) => {

                    // Only clear if we didn't just click a highlight (which stops propagation, but just in case)
                    if (this.selectedHighlightId) {
                        clearSelectedHighlightState(this);
                    }
                });
            });



            await this.rendition.display();


            // Setup hooks
            this.rendition.on('relocated', (location) => {
                this.cfi = location.start.cfi;
                this.emitPageChange(location);
            });

            // Selection handling
            this.rendition.on('selected', (cfiRange, contents) => {
                this.pendingSelection = { cfiRange, contents };
                this.touchSelectionScheduler.schedule();
            });


            // Trigger initial page update
            const currentLocation = this.rendition.currentLocation();
            if (currentLocation && currentLocation.start) {
                this.emitPageChange(currentLocation);
            }

            // Restore existing highlights
            this.restoreHighlights();

            this.locationsGenerated = false;
            this.locationsReadyPromise = this.book.locations.generate(1000)
                .then(() => {
                    this.locationsGenerated = true;
                    this.lastKnownPageCount = this.getPageCount();
                    this.onPageCountChange?.(this.lastKnownPageCount);

                    const latestLocation = this.rendition?.currentLocation?.();
                    if (latestLocation?.start) {
                        this.emitPageChange(latestLocation);
                    }

                    const highlights = highlightManager.getHighlightsBySource(this.fileId);
                    highlights.forEach((highlight) => {
                        if (highlight?.location?.cfi && !Number.isFinite(highlight.location.page)) {
                            const page = this.resolvePageFromCfi(highlight.location.cfi);
                            if (page) {
                                highlight.location.page = page;
                            }
                        }
                    });
                    getAppContext().annotationList?.refresh?.();
                })
                .catch((error) => {
                    console.warn('[EpubReader] Failed to generate EPUB locations:', error);
                });

            return this.book;
        } catch (error) {
            console.error('Error loading EPUB:', error);
            if (error.message && error.message.includes('No RootFile Found')) {
                this.container.innerHTML = '<div class="error">Error: Invalid EPUB structure. Missing META-INF/container.xml.</div>';
            } else {
                this.container.innerHTML = `<div class="error">Error loading EPUB: ${error.message}</div>`;
            }
            throw error;
        }
    }

    restoreHighlights() {
        if (!highlightManager || !this.fileId) return;

        const highlights = highlightManager.getHighlightsBySource(this.fileId);

        highlights.forEach(h => {
            if (h.location && h.location.cfi) {
                const page = this.resolvePageFromCfi(h.location.cfi);
                if (page && h.location.page !== page) {
                    h.location.page = page;
                }
                this.addAnnotation(h.id, h.location.cfi, h.color);
            }
        });
    }

    resolvePageFromCfi(cfi) {
        if (!cfi || !this.locationsGenerated) {
            return null;
        }

        const rawLocation = this.book?.locations?.locationFromCfi?.(cfi);
        if (!Number.isFinite(rawLocation)) {
            return null;
        }

        const totalPages = this.getPageCount() || this.lastKnownPageCount;
        const resolved = rawLocation + 1;
        return totalPages > 0
            ? Math.min(totalPages, Math.max(1, resolved))
            : Math.max(1, resolved);
    }

    addAnnotation(highlightId, cfiRange, color = '#FFE234') {
        if (this.deletedHighlightIds.has(highlightId)) {
            console.warn('[EpubReader] Blocked re-addition of deleted highlight ID:', highlightId);
            return;
        }
        if (this.deletedCFIs.has(cfiRange)) {
            console.warn('[EpubReader] Blocked re-addition of deleted highlight CFI:', cfiRange);
            return;
        }

        // Store mapping

        this.annotations.set(highlightId, cfiRange);

        this.rendition.annotations.add('highlight', cfiRange, { id: highlightId }, (e) => {
            if (e.stopPropagation) e.stopPropagation();

            const cardId = findCardIdByHighlightId(this.getCardSystem(), highlightId);
            handleReaderHighlightClick(this, e, highlightId, cardId, () => {
                window.dispatchEvent(new CustomEvent('highlight-clicked', {
                    detail: { highlightId, cardId }
                }));
            });
        }, 'epub-highlight', { 'fill': color, 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply' });
    }

    updateHighlightColor(highlightId, color) {

        const cfiRange = this.annotations.get(highlightId);
        if (cfiRange) {
            // Update default color for future highlights
            this.defaultColor = color;

            // Remove existing
            this.rendition.annotations.remove(cfiRange, 'highlight');
            // Re-add with new color
            this.addAnnotation(highlightId, cfiRange, color);

            // Update model
            updateHighlightModelColor(highlightId, color);
        }
    }

    removeVisualHighlight(highlightId) {

        this.isDeleting = true; // Set flag to prevent re-selection
        this.deletedHighlightIds.add(highlightId); // Mark as deleted

        // Explicitly clear selection in all contents
        if (this.rendition) {
            this.rendition.getContents().forEach(content => {
                if (content.window && content.window.getSelection) {

                    content.window.getSelection().removeAllRanges();
                }
            });
        }

        let cfiRange = this.annotations.get(highlightId);

        // Fallback: Try to get CFI from HighlightManager if missing in local map
        if (!cfiRange && highlightManager) {
            console.warn('[EpubReader] CFI not found in local map, trying HighlightManager...');
            const highlight = highlightManager.getHighlight(highlightId);
            if (highlight && highlight.location && highlight.location.cfi) {
                cfiRange = highlight.location.cfi;

            }
        }

        if (cfiRange) {

            this.deletedCFIs.add(cfiRange); // Mark CFI as deleted

            try {
                this.rendition.annotations.remove(cfiRange, 'highlight');

            } catch (err) {
                console.error('[EpubReader] Error removing annotation:', err);
            }
            this.annotations.delete(highlightId);
        } else {
            console.error('[EpubReader] FAILED to find CFI for highlightId:', highlightId);

        }

        clearSelectedHighlightState(this, highlightId);

        // Reset flag after a longer delay
        setTimeout(() => {
            this.isDeleting = false;
            if (cfiRange) {
                this.deletedCFIs.delete(cfiRange);
            }

        }, 1000);
    }

    deleteHighlight(highlightId, cardId) {

        this.removeVisualHighlight(highlightId);

        removeHighlightFromStores(this.getCardSystem(), highlightId, cardId);
    }

    async scrollToHighlight(highlightId) {

        const highlight = highlightManager.getHighlight(highlightId);
        if (highlight && highlight.location && highlight.location.cfi) {
            const page = this.resolvePageFromCfi(highlight.location.cfi);
            if (page && highlight.location.page !== page) {
                highlight.location.page = page;
            }

            if (!this.annotations.has(highlightId)) {
                this.addAnnotation(highlightId, highlight.location.cfi, highlight.color || this.defaultColor);
            }

            if (!this.rendition) {
                return;
            }

            await this.rendition.display(highlight.location.cfi);

            if (!this.rendition?.annotations) {
                return;
            }

            // Flash effect
            const originalColor = highlight.color || '#FFE234';
            // Remove temporarily
            this.rendition.annotations.remove(highlight.location.cfi, 'highlight');

            // Add flash version
            this.rendition.annotations.add('highlight', highlight.location.cfi, {}, null, 'epub-highlight-flash', {
                'fill': '#ff0000',
                'fill-opacity': '0.5',
                'mix-blend-mode': 'multiply'
            });

            // Restore after delay
            if (this.flashRestoreTimeout) {
                clearTimeout(this.flashRestoreTimeout);
            }

            this.flashRestoreTimeout = setTimeout(() => {
                if (!this.rendition?.annotations) {
                    this.flashRestoreTimeout = null;
                    return;
                }

                this.rendition.annotations.remove(highlight.location.cfi, 'highlight');
                this.addAnnotation(highlightId, highlight.location.cfi, originalColor);
                this.selectedHighlightId = highlightId;
                this.flashRestoreTimeout = null;
            }, 800);
        } else {
            console.warn('[EpubReader] Highlight not found or missing CFI:', highlightId);
        }
    }

    onPrevPage() {
        this.rendition?.prev();
    }

    onNextPage() {
        this.rendition?.next();
    }

    goToLocation(location) {
        if (location.cfi) {
            this.rendition?.display(location.cfi);
        }
    }

    getCurrentLocation() {
        const currentLocation = this.rendition?.currentLocation?.()?.start || {};
        return {
            cfi: currentLocation.cfi || this.cfi || null,
            location: Number.isFinite(currentLocation.location) ? currentLocation.location + 1 : this.lastKnownPage,
            percentage: currentLocation.percentage
        };
    }

    setPageCountCallback(callback) {
        this.onPageCountChange = callback;
    }

    setPageChangeCallback(callback) {
        this.onPageChange = callback;
    }

    setSelectionMode(mode) {
        this.selectionMode = mode;
        applyReaderSelectionMode({
            container: this.container,
            mode,
            targetElements: this.rendition?.getContents().map((content) => content?.document?.body) ?? [],
            textTouchAction: 'pan-x pan-y pinch-zoom',
            nonTextTouchAction: 'auto',
            disableSelectionClass: false
        });
    }

    centerContentHorizontally() {
        const overflowX = this.container.scrollWidth - this.container.clientWidth;
        this.container.scrollLeft = overflowX > 0 ? overflowX / 2 : 0;
    }

    getPageCount() {
        const pageCount = this.book?.locations?.length?.();
        return Number.isFinite(pageCount) && pageCount > 0 ? pageCount : 0;
    }

    resolveLocationPage(location) {
        if (!this.locationsGenerated) {
            return null;
        }

        const totalPages = this.getPageCount() || this.lastKnownPageCount;
        const rawLocation = location?.start?.location;
        if (Number.isFinite(rawLocation)) {
            const resolved = rawLocation + 1;
            return totalPages > 0
                ? Math.min(totalPages, Math.max(1, resolved))
                : Math.max(1, resolved);
        }

        const cfi = location?.start?.cfi || this.cfi;
        const fromCfi = cfi && this.book?.locations?.locationFromCfi?.(cfi);
        if (Number.isFinite(fromCfi)) {
            const resolved = fromCfi + 1;
            return totalPages > 0
                ? Math.min(totalPages, Math.max(1, resolved))
                : Math.max(1, resolved);
        }

        const percentage = location?.start?.percentage;
        if (Number.isFinite(percentage) && totalPages > 0) {
            return Math.min(totalPages, Math.max(1, Math.floor(percentage * totalPages) + 1));
        }

        return this.lastKnownPage || null;
    }

    emitPageChange(location) {
        const page = this.resolveLocationPage(location);
        if (Number.isFinite(page)) {
            this.lastKnownPage = page;
        }
        this.onPageChange?.({
            ...location,
            start: {
                ...location?.start,
                location: page
            }
        });
    }

    onLayoutChange() {
        this.layoutChangePromise = this.layoutChangePromise
            .catch(() => {})
            .then(async () => {
                if (!this.rendition) {
                    return;
                }

                const currentCfi = this.rendition.currentLocation?.()?.start?.cfi || this.cfi;
                const width = this.container.clientWidth;
                const height = this.container.clientHeight;

                if (width < 32 || height < 32) {
                    return;
                }

                if (typeof this.rendition.resize === 'function') {
                    this.rendition.resize(width, height, currentCfi);
                } else if (currentCfi) {
                    await this.rendition.display(currentCfi);
                }

                const currentLocation = this.rendition.currentLocation?.();
                if (currentLocation?.start) {
                    this.emitPageChange(currentLocation);
                }

                this.lastKnownPageCount = this.getPageCount() || this.lastKnownPageCount;
                this.onPageCountChange?.(this.lastKnownPageCount);

                window.requestAnimationFrame(() => this.centerContentHorizontally());
            });

        return this.layoutChangePromise;
    }

    commitSelection(cfiRange, contents) {
        if (this.isDeleting) {
            contents.window.getSelection().removeAllRanges();
            return;
        }

        if (this.deletedCFIs.has(cfiRange)) {
            console.warn('[EpubReader] Ignoring selection for recently deleted CFI:', cfiRange);
            contents.window.getSelection().removeAllRanges();
            return;
        }

        this.book.getRange(cfiRange).then(range => {
            const text = range.toString();
            const page = this.resolvePageFromCfi(cfiRange);

            const highlight = highlightManager.createHighlight(text, {
                cfi: cfiRange,
                ...(page ? { page } : {})
            }, this.fileId, 'epub', this.defaultColor);

            this.addAnnotation(highlight.id, cfiRange, highlight.color);
            contents.window.getSelection().removeAllRanges();
            this.pendingSelection = null;
        });
    }

    destroy() {
        this.touchSelectionScheduler?.cancel?.();
        this.pendingSelection = null;
        if (this.flashRestoreTimeout) {
            clearTimeout(this.flashRestoreTimeout);
            this.flashRestoreTimeout = null;
        }
        this.cleanupListeners?.();
        this.cleanupListeners = null;
        if (this.toolbar) {
            this.toolbar.hide();
        }
        if (this.book) {
            this.book.destroy();
            this.book = null;
        }
        if (this.bookUrl) {
            URL.revokeObjectURL(this.bookUrl);
            this.bookUrl = null;
        }
        this.locationsGenerated = false;
        this.locationsReadyPromise = null;
        this.rendition = null;
        this.container.innerHTML = '';
        this.annotations.clear();
        this.deletedHighlightIds.clear();
        this.deletedCFIs.clear();
    }
}
