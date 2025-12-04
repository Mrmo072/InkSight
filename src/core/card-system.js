import { v4 as uuidv4 } from 'uuid';
import { highlightManager } from './highlight-manager.js';

export class CardSystem {
    constructor() {
        this.cards = new Map(); // Changed from array to Map
        this.connections = []; // Added connections array

        // Listen for highlights
        window.addEventListener('highlight-created', (e) => {
            // Ignore highlights created for image selections to avoid duplicate cards
            if (e.detail.text === '[Image Selection]') return;
            this.createCardFromHighlight(e.detail);
        });

        // Listen for card removal to sync deletions
        window.addEventListener('card-removed', (e) => {
            const { highlightId } = e.detail;
            if (highlightId) {
                highlightManager.removeHighlight(highlightId);
            }
        });
    }

    createCardFromHighlight(highlight) {
        const card = {
            id: uuidv4(),
            type: 'text',
            highlightId: highlight.id,
            content: highlight.text,
            note: '',
            sourceId: highlight.sourceId,
            sourceName: highlight.sourceName, // Copy sourceName from highlight
            position: { x: 100, y: 100 },
            createdAt: new Date().toISOString(),
            color: highlight.color // Store color from highlight
        };

        this.addCard(card);
    }

    createCardFromImage(imageData, location, sourceId, color = '#FF6B6B', type = 'image', sourceName = null) {
        // Create a highlight for this area first
        const highlight = highlightManager.createHighlight('[Image Selection]', location, sourceId, type, color, sourceName);

        const card = {
            id: uuidv4(),
            type: 'image',
            highlightId: highlight.id, // Store highlightId
            imageData: imageData, // base64 data URL
            content: '',
            note: '',
            sourceId: sourceId,
            sourceName: sourceName, // Store sourceName
            location: location,
            position: { x: 100, y: 100 },
            createdAt: new Date().toISOString(),
            color: color // Store color
        };

        this.addCard(card);
        return card;
    }

    addCard(card) {
        this.cards.set(card.id, card); // Changed to use Map.set

        // Dispatch event for UI update
        const event = new CustomEvent('card-added', {
            detail: card
        });
        window.dispatchEvent(event);
    }

    updateCardPosition(id, x, y) {
        const card = this.cards.get(id); // Changed to use Map.get
        if (card) {
            card.position = { x, y };
            this.save(); // Added save call
        }
    }

    markCardAsDeleted(id, deleted = true) {
        const card = this.cards.get(id);
        if (!card) {
            console.warn('[CardSystem] markCardAsDeleted called with unknown ID:', id);
            return;
        }



        card.deleted = deleted;
        this.save();

        // Dispatch event to update UI visibility
        const eventType = deleted ? 'card-soft-deleted' : 'card-restored';
        const event = new CustomEvent(eventType, {
            detail: { id, highlightId: card.highlightId, deleted }
        });

        window.dispatchEvent(event);
    }

    // Keep the old removeCard for compatibility, but now it just marks as deleted
    removeCard(id) {

        this.markCardAsDeleted(id, true);
    }

    addConnection(sourceId, targetId) {
        const id = crypto.randomUUID();
        const connection = { id, sourceId, targetId };
        this.connections.push(connection);
        this.save();
    }

    cleanupDeletedCards() {

        let deletedCount = 0;

        // Remove cards marked as deleted
        for (const [id, card] of this.cards.entries()) {
            if (card.deleted === true) {

                this.cards.delete(id);

                // Also remove the associated highlight
                if (card.highlightId && window.inksight && window.inksight.highlightManager) {
                    window.inksight.highlightManager.removeHighlight(card.highlightId);
                }

                deletedCount++;
            }
        }

        // Remove connections associated with deleted cards
        this.connections = this.connections.filter(c =>
            this.cards.has(c.sourceId) && this.cards.has(c.targetId)
        );

        if (deletedCount > 0) {

        }
    }

    getPersistenceData() {
        // Clean up deleted cards before saving
        this.cleanupDeletedCards();

        return {
            cards: Array.from(this.cards.entries()), // Serialize Map as array of entries
            connections: this.connections
        };
    }

    restorePersistenceData(data, newSourceId = null) {


        this.cards.clear();
        this.connections = [];

        if (data.cards) {
            // Check if it's array of entries or array of objects
            if (Array.isArray(data.cards)) {
                if (data.cards.length > 0 && Array.isArray(data.cards[0])) {

                    // Map entries [[id, card], ...]
                    data.cards.forEach(([id, card]) => {
                        if (newSourceId) {
                            // console.log(`[CardSystem] Updating card ${id} sourceId from ${card.sourceId} to ${newSourceId}`);
                            card.sourceId = newSourceId;
                        }
                        this.cards.set(id, card);
                    });
                } else {

                    // Array of objects [card, ...]
                    data.cards.forEach(card => {
                        if (newSourceId) card.sourceId = newSourceId;
                        this.cards.set(card.id, card);
                    });
                }
            }
        }


        // Notify UI
        window.dispatchEvent(new CustomEvent('cards-restored', {
            detail: {
                cards: Array.from(this.cards.values()),
                connections: this.connections
            }
        }));
    }

    remapSourceIds(newSourceId, oldSourceId) {
        if (!oldSourceId) {
            console.warn('[CardSystem] remapSourceIds called without oldSourceId. Aborting to prevent data corruption.');
            return;
        }

        let updated = false;
        this.cards.forEach(card => {
            if (card.sourceId === oldSourceId) {
                card.sourceId = newSourceId;
                updated = true;
            }
        });

        if (updated) {
            // Notify UI
            window.dispatchEvent(new CustomEvent('cards-restored', {
                detail: { cards: Array.from(this.cards.values()), connections: this.connections }
            }));
        }
    }

    updateSourceNames(sourceId, sourceName) {

        let updated = false;
        for (const card of this.cards.values()) {
            if (card.sourceId === sourceId && !card.sourceName) {
                card.sourceName = sourceName;
                updated = true;
            }
        }
        if (updated) {

            this.save();
        }
    }

    /**
     * Clear all cards and connections
     * Used when clearing the board
     */
    clearAll() {

        this.cards.clear();
        this.connections = [];

        // Dispatch event to notify that all cards have been cleared
        window.dispatchEvent(new CustomEvent('cards-cleared'));
    }

    save() {

        // Trigger a global save event if needed, or just rely on the external system polling getPersistenceData
        window.dispatchEvent(new CustomEvent('request-save'));
    }
}

export const cardSystem = new CardSystem();

// Expose to global scope for persistence integration
if (window.inksight) {
    window.inksight.cardSystem = cardSystem;
}
