// Simple global tooltip manager for document names
export class TooltipManager {
    constructor() {
        this.tooltip = document.getElementById('document-tooltip');
        this.currentDocumentName = null;
        this.isVisible = false;
    }

    show(documentName, x, y) {
        if (!this.tooltip) return;

        this.tooltip.textContent = `📄 ${documentName}`;
        this.tooltip.style.left = (x + 15) + '  px';
        this.tooltip.style.top = (y + 15) + 'px';
        this.tooltip.classList.add('visible');
        this.isVisible = true;
    }

    hide() {
        if (!this.tooltip) return;

        this.tooltip.classList.remove('visible');
        this.isVisible = false;
    }

    update(x, y) {
        if (!this.tooltip || !this.isVisible) return;

        this.tooltip.style.left = (x + 15) + 'px';
        this.tooltip.style.top = (y + 15) + 'px';
    }
}

export const tooltipManager = new TooltipManager();

// Expose globally
if (window.inksight) {
    window.inksight.tooltipManager = tooltipManager;
}
