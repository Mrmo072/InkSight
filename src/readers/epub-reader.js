import ePub from 'epubjs';
import { highlightManager } from '../core/highlight-manager.js';
import { cardSystem } from '../core/card-system.js';
import { PDFHighlightToolbar } from './pdf-highlight-toolbar.jsx';

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

        this.toolbar = new PDFHighlightToolbar(container, {
            onDeleteHighlight: (highlightId, cardId) => {
                this.deleteHighlight(highlightId, cardId);
            },
            onUpdateColor: (highlightId, color) => {
                this.updateHighlightColor(highlightId, color);
            }
        });

        this.handleMindmapNodeUpdated = (e) => {
            const { highlightId, color } = e.detail;

            this.updateHighlightColor(highlightId, color);
        };

        this.handleCardDeleted = (e) => {
            const { id: cardId, highlightId, deleted } = e.detail;


            if (deleted) {
                if (highlightId) {
                    if (this.isDeleting) {

                        return;
                    }

                    this.removeVisualHighlight(highlightId);
                }
            } else {
                // Card restored
                if (highlightId) {

                    this.deletedHighlightIds.delete(highlightId);
                }
            }
        };

        // Keydown handler for the main window (if focus is somehow here)
        this.handleKeyDown = (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedHighlightId) {
                e.preventDefault(); // Prevent browser back/navigation

                // Find card ID for the selected highlight
                const card = Array.from(cardSystem.cards.values()).find(c => c.highlightId === this.selectedHighlightId);
                this.deleteHighlight(this.selectedHighlightId, card ? card.id : null);
                this.selectedHighlightId = null;
                this.toolbar.hide();
            }
        };

        window.addEventListener('mindmap-node-updated', this.handleMindmapNodeUpdated);
        window.addEventListener('card-soft-deleted', this.handleCardDeleted);
        document.addEventListener('keydown', this.handleKeyDown);
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
                const win = contents.window;

                doc.addEventListener('wheel', (e) => {
                    // Prevent default scrolling if needed, or just trigger nav
                    if (e.deltaY > 0) {
                        this.onNextPage();
                    } else if (e.deltaY < 0) {
                        this.onPrevPage();
                    }
                }, { passive: true });

                // Keydown listener for DEL inside iframe
                doc.addEventListener('keydown', (e) => {
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        if (this.selectedHighlightId) {
                            e.preventDefault(); // Prevent browser back/navigation

                            // Find card ID
                            const card = Array.from(cardSystem.cards.values()).find(c => c.highlightId === this.selectedHighlightId);
                            this.deleteHighlight(this.selectedHighlightId, card ? card.id : null);
                            this.selectedHighlightId = null;
                            this.toolbar.hide();
                        }
                    }
                });

                // Click listener to clear selection if clicking elsewhere
                doc.addEventListener('click', (e) => {

                    // Only clear if we didn't just click a highlight (which stops propagation, but just in case)
                    if (this.selectedHighlightId) {

                        this.selectedHighlightId = null;
                        this.toolbar.hide();
                    }
                });
            });



            await this.rendition.display();


            // Setup hooks
            this.rendition.on('relocated', (location) => {
                this.cfi = location.start.cfi;
                this.onPageChange?.(location);
            });

            // Selection handling
            this.rendition.on('selected', (cfiRange, contents) => {


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

                    const highlight = highlightManager.createHighlight(text, {
                        cfi: cfiRange
                    }, this.fileId, 'epub', this.defaultColor);

                    this.addAnnotation(highlight.id, cfiRange, highlight.color);

                    // Clear selection
                    contents.window.getSelection().removeAllRanges();
                });
            });


            await this.book.locations.generate(1000);

            this.onPageCountChange?.(this.book.locations.length());

            // Trigger initial page update
            const currentLocation = this.rendition.currentLocation();
            if (currentLocation && currentLocation.start) {
                this.onPageChange?.(currentLocation);
            }

            // Restore existing highlights
            this.restoreHighlights();

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
                this.addAnnotation(h.id, h.location.cfi, h.color);
            }
        });
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

            this.selectedHighlightId = highlightId;

            // Find card
            const card = Array.from(cardSystem.cards.values()).find(c => c.highlightId === highlightId);


            // Show toolbar
            this.toolbar.handleHighlightClick(e, highlightId, card ? card.id : null);

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
            if (highlightManager) {
                const highlight = highlightManager.getHighlight(highlightId);
                if (highlight) {
                    highlight.color = color;

                    // Dispatch update event if needed for Mind Map sync
                    window.dispatchEvent(new CustomEvent('highlight-updated', {
                        detail: { id: highlightId, color }
                    }));
                }
            }
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

        if (this.selectedHighlightId === highlightId) {
            this.selectedHighlightId = null;
            this.toolbar.hide();
        }

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

        if (cardId && cardSystem) {

            cardSystem.removeCard(cardId);
        } else if (highlightManager) {

            highlightManager.removeHighlight(highlightId);
        }
    }

    async scrollToHighlight(highlightId) {

        const highlight = highlightManager.getHighlight(highlightId);
        if (highlight && highlight.location && highlight.location.cfi) {

            await this.rendition.display(highlight.location.cfi);

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
            setTimeout(() => {
                this.rendition.annotations.remove(highlight.location.cfi, 'highlight');
                this.addAnnotation(highlightId, highlight.location.cfi, originalColor);
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

    setPageCountCallback(callback) {
        this.onPageCountChange = callback;
    }

    setPageChangeCallback(callback) {
        this.onPageChange = callback;
    }

    setSelectionMode(mode) {
        this.selectionMode = mode;


        // Similar to TextReader, we primarily support text selection for now.
        if (mode === 'text') {
            // Enable text selection in epubjs iframe if possible
            // this.rendition.getContents().forEach(c => c.content.style.userSelect = 'text');
        } else {
            // Disable or warn
        }
    }

    destroy() {
        window.removeEventListener('mindmap-node-updated', this.handleMindmapNodeUpdated);
        window.removeEventListener('card-soft-deleted', this.handleCardDeleted);
        document.removeEventListener('keydown', this.handleKeyDown);
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
        this.rendition = null;
        this.container.innerHTML = '';
        this.annotations.clear();
        this.deletedHighlightIds.clear();
        this.deletedCFIs.clear();
    }
}
