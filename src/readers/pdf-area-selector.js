import { cardSystem } from '../core/card-system.js';

/**
 * PDFAreaSelector - Manages rectangle and ellipse area selection on PDF pages
 * Handles mouse interaction, canvas capture, and border creation
 */
export class PDFAreaSelector {
    constructor(options = {}) {
        this.selectionMode = 'text'; // 'text', 'rectangle', 'ellipse'
        this.isDrawing = false;
        this.startPoint = null;
        this.currentOverlay = null;
        this.currentPageWrapper = null;
        this.currentPageNum = null;
        this.boundMouseMove = null;
        this.boundMouseUp = null;
        this.attachedWrappers = new WeakSet(); // Track wrappers with listeners

        // Callbacks
        this.onHighlightClick = options.onHighlightClick || (() => { });
        this.fileId = null;
        this.fileName = null; // Store file name
        this.color = '#FF6B6B'; // Default color
    }

    destroy() {
        // Clean up any active selection
        if (this.isDrawing) {
            document.removeEventListener('mousemove', this.boundMouseMove);
            document.removeEventListener('mouseup', this.boundMouseUp);
        }
        this.attachedWrappers = null;
    }

    setColor(color) {
        this.color = color;
    }

    setFileId(fileId) {
        this.fileId = fileId;
    }

    setFileName(fileName) {
        this.fileName = fileName;
    }

    setSelectionMode(mode) {
        this.selectionMode = mode;
    }

    setupListeners(wrapper, pageNum) {
        if (this.attachedWrappers.has(wrapper)) return; // Prevent duplicate listeners

        wrapper.addEventListener('mousedown', (e) => this.onSelectionStart(e, wrapper, pageNum));
        this.attachedWrappers.add(wrapper);
    }

    onSelectionStart(e, wrapper, pageNum) {
        if (this.selectionMode === 'text' || this.selectionMode === 'highlighter') return;
        if (this.isDrawing) return; // Prevent re-entry if already drawing

        e.preventDefault(); // Prevent default selection

        this.isDrawing = true;
        this.currentPageWrapper = wrapper;
        this.currentPageNum = pageNum;

        const rect = wrapper.getBoundingClientRect();
        this.startPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        this.currentOverlay = document.createElement('div');
        this.currentOverlay.className = 'selection-overlay';
        wrapper.appendChild(this.currentOverlay);

        // Bind global listeners
        this.boundMouseMove = (e) => this.onSelectionMove(e);
        this.boundMouseUp = (e) => this.onSelectionEnd(e);

        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
    }

    onSelectionMove(e) {
        if (!this.isDrawing || !this.currentOverlay || !this.currentPageWrapper) return;

        const wrapper = this.currentPageWrapper;
        const rect = wrapper.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const width = Math.abs(currentX - this.startPoint.x);
        const height = Math.abs(currentY - this.startPoint.y);
        const left = Math.min(currentX, this.startPoint.x);
        const top = Math.min(currentY, this.startPoint.y);

        this.currentOverlay.style.width = `${width}px`;
        this.currentOverlay.style.height = `${height}px`;
        this.currentOverlay.style.left = `${left}px`;
        this.currentOverlay.style.top = `${top}px`;

        if (this.selectionMode === 'ellipse') {
            this.currentOverlay.style.borderRadius = '50%';
        } else {
            this.currentOverlay.style.borderRadius = '0';
        }
    }

    onSelectionEnd(e) {
        if (!this.isDrawing) return;

        // Remove global listeners
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);

        this.isDrawing = false;

        if (!this.currentOverlay || !this.currentPageWrapper) return;

        const wrapper = this.currentPageWrapper;
        const pageNum = this.currentPageNum;

        const width = parseFloat(this.currentOverlay.style.width);
        const height = parseFloat(this.currentOverlay.style.height);
        const left = parseFloat(this.currentOverlay.style.left);
        const top = parseFloat(this.currentOverlay.style.top);

        // IMPORTANT: Remove the temporary selection overlay from DOM
        this.currentOverlay.remove();
        this.currentOverlay = null;

        // Calculate drag distance
        const dragDistance = Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2));

        // Ignore clicks or tiny drags (must be at least 20px in each dimension AND 30px euclidean distance)
        if (isNaN(width) || isNaN(height) || width < 20 || height < 20 || dragDistance < 30) {
            return;
        }

        // Capture image
        const canvas = wrapper.querySelector('canvas');
        if (!canvas) return;

        try {
            const scale = canvas.width / wrapper.clientWidth;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width * scale;
            tempCanvas.height = height * scale;
            const ctx = tempCanvas.getContext('2d');

            // Handle ellipse clipping
            if (this.selectionMode === 'ellipse') {
                ctx.beginPath();
                ctx.ellipse(
                    tempCanvas.width / 2, tempCanvas.height / 2,
                    tempCanvas.width / 2, tempCanvas.height / 2,
                    0, 0, 2 * Math.PI
                );
                ctx.clip();
            }

            ctx.drawImage(
                canvas,
                left * scale, top * scale,
                width * scale, height * scale,
                0, 0,
                tempCanvas.width, tempCanvas.height
            );

            const imageData = tempCanvas.toDataURL('image/png');

            // Create card and get highlight
            const area = { left, top, width, height };
            // Pass selectionMode ('rect' or 'ellipse') as the type
            const card = cardSystem.createCardFromImage(imageData, { page: pageNum, area }, this.fileId, this.color, this.selectionMode, this.fileName);

            // Create persistent border for the selected area
            if (card && card.highlightId) {
                const borderDiv = document.createElement('div');
                borderDiv.className = 'area-highlight-border';
                borderDiv.style.position = 'absolute';
                borderDiv.style.left = `${left}px`;
                borderDiv.style.top = `${top}px`;
                borderDiv.style.width = `${width}px`;
                borderDiv.style.height = `${height}px`;
                borderDiv.style.border = `2px dashed ${this.color}`;
                borderDiv.style.backgroundColor = this.color.startsWith('#') ? this.color + '1A' : this.color.replace(')', ', 0.1)').replace('rgb', 'rgba');
                borderDiv.style.pointerEvents = 'auto'; // Enable interactions
                borderDiv.style.cursor = 'pointer';
                borderDiv.style.zIndex = '5';
                borderDiv.style.borderRadius = this.selectionMode === 'ellipse' ? '50%' : '4px';
                borderDiv.dataset.highlightId = card.highlightId;

                // Add click listener for interaction
                borderDiv.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent document click from closing toolbar immediately
                    this.onHighlightClick(e, card.highlightId, card.id);
                });

                wrapper.appendChild(borderDiv);
            }
        } catch (e) {
            console.error('Error creating image card:', e);
        }
    }
}
