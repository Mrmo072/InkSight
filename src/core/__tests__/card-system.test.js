import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cardSystem } from '../card-system.js';
import { highlightManager } from '../highlight-manager.js';

describe('CardSystem', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        cardSystem.cards.clear();
        cardSystem.connections = [];
        highlightManager.clearAll();
        window.inksight = { highlightManager };
    });

    it('creates cards from text highlights via the global event bridge', () => {
        const addedListener = vi.fn();
        window.addEventListener('card-added', addedListener);

        window.dispatchEvent(new CustomEvent('highlight-created', {
            detail: {
                id: 'h-1',
                text: 'Important passage',
                sourceId: 'doc-1',
                sourceName: 'Book.pdf',
                color: '#ffe234'
            }
        }));

        const cards = Array.from(cardSystem.cards.values());
        expect(cards).toHaveLength(1);
        expect(cards[0]).toEqual(expect.objectContaining({
            highlightId: 'h-1',
            content: 'Important passage',
            sourceId: 'doc-1',
            sourceName: 'Book.pdf'
        }));
        expect(addedListener).toHaveBeenCalled();

        window.removeEventListener('card-added', addedListener);
    });

    it('ignores synthetic image-selection highlights to avoid duplicate cards', () => {
        window.dispatchEvent(new CustomEvent('highlight-created', {
            detail: {
                id: 'h-1',
                text: '[Image Selection]',
                sourceId: 'doc-1'
            }
        }));

        expect(cardSystem.cards.size).toBe(0);
    });

    it('creates image cards together with their backing highlights', () => {
        const card = cardSystem.createCardFromImage('data:image/png;base64,AAA', { page: 2 }, 'doc-1', '#ff0000', 'ellipse', 'Book.pdf');

        expect(card.type).toBe('image');
        expect(card.highlightId).toBeTruthy();
        expect(highlightManager.getHighlight(card.highlightId)).toEqual(expect.objectContaining({
            sourceId: 'doc-1',
            type: 'ellipse',
            color: '#ff0000'
        }));
    });

    it('soft deletes cards and requests a save', () => {
        const saveListener = vi.fn();
        const deletedListener = vi.fn();
        window.addEventListener('request-save', saveListener);
        window.addEventListener('card-soft-deleted', deletedListener);

        cardSystem.addCard({ id: 'c-1', highlightId: 'h-1', sourceId: 'doc-1' });
        cardSystem.removeCard('c-1');

        expect(cardSystem.cards.get('c-1').deleted).toBe(true);
        expect(saveListener).toHaveBeenCalled();
        expect(deletedListener).toHaveBeenCalledWith(expect.objectContaining({
            detail: { id: 'c-1', highlightId: 'h-1', deleted: true }
        }));

        window.removeEventListener('request-save', saveListener);
        window.removeEventListener('card-soft-deleted', deletedListener);
    });

    it('cleans up deleted cards, orphan connections, and linked highlights before persisting', () => {
        highlightManager.highlights = [{ id: 'h-deleted', sourceId: 'doc-1' }];
        cardSystem.cards.set('c-1', { id: 'c-1', highlightId: 'h-1', sourceId: 'doc-1' });
        cardSystem.cards.set('c-2', { id: 'c-2', highlightId: 'h-deleted', sourceId: 'doc-1', deleted: true });
        cardSystem.connections = [
            { id: 'link-ok', sourceId: 'c-1', targetId: 'c-1' },
            { id: 'link-stale', sourceId: 'c-1', targetId: 'c-2' }
        ];

        const payload = cardSystem.getPersistenceData();

        expect(payload.cards).toEqual([['c-1', expect.any(Object)]]);
        expect(payload.connections).toEqual([{ id: 'link-ok', sourceId: 'c-1', targetId: 'c-1' }]);
        expect(highlightManager.getHighlight('h-deleted')).toBeUndefined();
    });

    it('restores cards from persisted arrays and can remap their source ids', () => {
        const restoredListener = vi.fn();
        window.addEventListener('cards-restored', restoredListener);

        cardSystem.restorePersistenceData({
            cards: [
                ['c-1', { id: 'c-1', sourceId: 'old-doc' }],
                ['c-2', { id: 'c-2', sourceId: 'old-doc' }]
            ],
            connections: [
                { id: 'link-ok', sourceId: 'c-1', targetId: 'c-2' },
                { id: 'link-stale', sourceId: 'c-1', targetId: 'missing' }
            ]
        }, 'new-doc');

        expect(cardSystem.cards.get('c-1').sourceId).toBe('new-doc');
        expect(cardSystem.cards.get('c-2').sourceId).toBe('new-doc');
        expect(cardSystem.connections).toEqual([
            { id: 'link-ok', sourceId: 'c-1', targetId: 'c-2' }
        ]);
        expect(restoredListener).toHaveBeenCalled();

        window.removeEventListener('cards-restored', restoredListener);
    });

    it('updates missing source names and emits save requests only when data changes', () => {
        const saveListener = vi.fn();
        window.addEventListener('request-save', saveListener);

        cardSystem.cards.set('c-1', { id: 'c-1', sourceId: 'doc-1', sourceName: null });
        cardSystem.cards.set('c-2', { id: 'c-2', sourceId: 'doc-1', sourceName: 'Preset.pdf' });

        cardSystem.updateSourceNames('doc-1', 'Book.pdf');
        cardSystem.updateSourceNames('missing-doc', 'Noop.pdf');

        expect(cardSystem.cards.get('c-1').sourceName).toBe('Book.pdf');
        expect(cardSystem.cards.get('c-2').sourceName).toBe('Preset.pdf');
        expect(saveListener).toHaveBeenCalledTimes(1);

        window.removeEventListener('request-save', saveListener);
    });
});
