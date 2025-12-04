import { v4 as uuidv4 } from 'uuid';

export class HighlightManager {
    constructor() {
        this.highlights = [];
    }

    createHighlight(text, location, sourceId, type = 'text', color = 'var(--highlight-color)', sourceName = null) {
        const highlight = {
            id: uuidv4(),
            text: text.trim(),
            location: location, // { page, cfi, or index }
            sourceId: sourceId,
            sourceName: sourceName, // Store document name
            type: type,
            createdAt: new Date().toISOString(),
            color: color
        };

        this.highlights.push(highlight);

        // Dispatch event for card creation
        const event = new CustomEvent('highlight-created', {
            detail: highlight
        });
        window.dispatchEvent(event);

        return highlight;
    }

    getHighlightsBySource(sourceId) {
        return this.highlights.filter(h => h.sourceId === sourceId);
    }

    getHighlight(id) {
        return this.highlights.find(h => h.id === id);
    }

    removeHighlight(id) {
        this.highlights = this.highlights.filter(h => h.id !== id);

        // Dispatch event so UI can remove visual highlights
        window.dispatchEvent(new CustomEvent('highlight-removed', { detail: id }));
    }

    getPersistenceData() {
        return {
            highlights: this.highlights
        };
    }

    restorePersistenceData(data, newSourceId = null) {


        if (!data || !data.highlights) {
            console.warn('[HighlightManager] No highlights to restore');
            return;
        }

        this.highlights = data.highlights;

        // If a new source ID is provided (because we're loading into a new session where the file ID changed),
        // update all highlights to point to this new ID.
        if (newSourceId) {
            this.highlights.forEach(h => {
                h.sourceId = newSourceId;
            });
        }

        // Notify UI/PDF Reader to re-render highlights
        window.dispatchEvent(new CustomEvent('highlights-restored', {
            detail: { highlights: this.highlights }
        }));
    }

    remapSourceIds(newSourceId, oldSourceId) {
        if (!oldSourceId) {
            console.warn('[HighlightManager] remapSourceIds called without oldSourceId. Aborting to prevent data corruption.');
            return;
        }

        let updated = false;
        this.highlights.forEach(h => {
            if (h.sourceId === oldSourceId) {
                h.sourceId = newSourceId;
                updated = true;
            }
        });

        if (updated) {
            // Notify UI
            window.dispatchEvent(new CustomEvent('highlights-restored', {
                detail: { highlights: this.highlights }
            }));
        }
    }

    updateSourceNames(sourceId, sourceName) {

        let updated = false;
        this.highlights.forEach(h => {
            if (h.sourceId === sourceId && !h.sourceName) {
                h.sourceName = sourceName;
                updated = true;
            }
        });
        if (updated) {

            // Dispatch event if needed, or rely on next save
        }
    }

    /**
     * Clear all highlights
     * Used when clearing the board
     */
    clearAll() {

        this.highlights = [];

        // Dispatch event to notify that all highlights have been cleared
        window.dispatchEvent(new CustomEvent('highlights-cleared'));
    }
}

export const highlightManager = new HighlightManager();

// Expose to global scope for persistence integration
if (window.inksight) {
    window.inksight.highlightManager = highlightManager;
}
