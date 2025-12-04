import { createRoot } from 'react-dom/client';
import React from 'react';
import { PDFColorPicker } from './pdf-color-picker.jsx';

/**
 * PDFHighlightToolbar - Manages the floating toolbar for highlight interactions
 * Handles color selection and deletion of highlights
 */
export class PDFHighlightToolbar {
    constructor(container, options = {}) {
        this.container = container;
        this.currentToolbar = null;
        this.root = null; // React root
        this.selectedHighlightId = null;
        this.selectedCardId = null;

        // Callbacks
        this.onDeleteHighlight = options.onDeleteHighlight || (() => { });
        this.onUpdateColor = options.onUpdateColor || (() => { });
    }

    handleHighlightClick(e, highlightId, cardId) {
        // Dispatch event to jump to card in mindmap
        console.log('[PDFHighlightToolbar] Highlight clicked:', highlightId, 'Card:', cardId);
        window.dispatchEvent(new CustomEvent('highlight-selected', {
            detail: { cardId }
        }));

        // Track selection
        this.selectedHighlightId = highlightId;
        this.selectedCardId = cardId;

        // Show toolbar
        const rect = e.target.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();

        // Position relative to container, accounting for scroll
        const x = rect.left - containerRect.left + (rect.width / 2) + this.container.scrollLeft;
        const y = rect.top - containerRect.top + this.container.scrollTop;

        this.show(highlightId, cardId, x, y);
    }

    show(highlightId, cardId, x, y) {
        this.hide();

        // Restore selection state (cleared by hide())
        this.selectedHighlightId = highlightId;
        this.selectedCardId = cardId;

        const toolbar = document.createElement('div');
        toolbar.className = 'modern-highlight-toolbar drawnix';
        toolbar.style.position = 'absolute';
        toolbar.style.left = `${x}px`;
        // Position above the highlight:
        // y is the top of the highlight. We want the bottom of the toolbar to be slightly above y.
        // Using translate(-50%, -100%) makes the toolbar's bottom-center the anchor point.
        // So setting top to (y - 12) gives a 12px gap.
        toolbar.style.top = `${y - 12}px`;
        toolbar.style.transform = 'translate(-50%, -100%)';

        // Prevent mousedown from bubbling to document (prevents auto-close)
        toolbar.addEventListener('mousedown', (e) => e.stopPropagation());

        this.container.appendChild(toolbar);
        this.currentToolbar = toolbar;

        // Get current color
        let currentColor = '#ffe234'; // Default
        if (window.inksight && window.inksight.highlightManager) {
            const highlight = window.inksight.highlightManager.highlights.find(h => h.id === highlightId);
            if (highlight) {
                currentColor = highlight.color;
            }
        }

        // Mount React Component
        this.root = createRoot(toolbar);
        this.root.render(
            <PDFColorPicker
                selectedColor={currentColor}
                onColorChange={(color) => {
                    console.log('[PDFHighlightToolbar] Color selected:', color);
                    this.onUpdateColor(highlightId, color);
                    // We don't hide automatically to allow trying different colors
                }}
            />
        );

        // Close toolbar when clicking elsewhere
        const closeHandler = (e) => {
            if (!toolbar.contains(e.target) && e.target.dataset.highlightId !== highlightId) {
                console.log('[PDFHighlightToolbar] Closing toolbar (click outside)');
                this.hide();
                document.removeEventListener('mousedown', closeHandler);
            }
        };
        document.addEventListener('mousedown', closeHandler);
    }

    hide() {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        if (this.currentToolbar) {
            this.currentToolbar.remove();
            this.currentToolbar = null;
        }
        this.selectedHighlightId = null;
        this.selectedCardId = null;
    }

    getSelectedHighlightId() {
        return this.selectedHighlightId;
    }

    getSelectedCardId() {
        return this.selectedCardId;
    }
}
