import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotationList } from '../annotation-list.js';

describe('annotation-list', () => {
    let cardSystem;
    let highlightManager;
    let documentManager;

    beforeEach(async () => {
        vi.resetModules();
        document.body.innerHTML = `<div id="annotation-list"></div>`;

        const { initAppContext } = await import('../../app/app-context.js');
        initAppContext();

        cardSystem = {
            cards: new Map([
                ['card-1', { id: 'card-1', content: 'Alpha note', note: '', sourceId: 'doc-1', highlightId: 'hl-1', isOnBoard: false }],
                ['card-2', { id: 'card-2', content: 'Beta note', note: '', sourceId: 'doc-1', highlightId: 'hl-2', isOnBoard: true }],
                ['card-3', { id: 'card-3', content: 'Gamma note', note: '', sourceId: 'doc-2', highlightId: 'hl-3', isOnBoard: false }]
            ]),
            updateCard: vi.fn()
        };
        highlightManager = {
            highlights: [
                { id: 'hl-1', sourceId: 'doc-1', text: 'Alpha', location: { page: 1 } },
                { id: 'hl-2', sourceId: 'doc-1', text: 'Beta', location: { page: 2 } },
                { id: 'hl-3', sourceId: 'doc-2', text: 'Gamma', location: { page: 3 } }
            ]
        };
        documentManager = {
            getMissingDocuments: vi.fn(() => [{ id: 'doc-1' }])
        };

        window.inksight.cardSystem = cardSystem;
        window.inksight.highlightManager = highlightManager;
        window.inksight.documentManager = documentManager;
    });

    it('filters annotations by map state and missing links', () => {
        const list = new AnnotationList('annotation-list', cardSystem);
        list.load('doc-1');

        const filter = document.querySelector('.annotation-filter-select');
        filter.value = 'needs-map';
        filter.dispatchEvent(new Event('change', { bubbles: true }));

        expect(document.querySelectorAll('.annotation-item')).toHaveLength(1);
        expect(document.querySelector('.annotation-item').dataset.cardId).toBe('card-1');

        filter.value = 'missing-links';
        filter.dispatchEvent(new Event('change', { bubbles: true }));

        expect(document.querySelectorAll('.annotation-item')).toHaveLength(2);
    });

    it('adds selected annotations to the basket and dispatches batch map events', () => {
        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        const list = new AnnotationList('annotation-list', cardSystem);
        list.load('doc-1');

        const basketButtons = document.querySelectorAll('.basket-btn');
        basketButtons[0].click();
        basketButtons[1].click();

        document.querySelector('.annotation-basket-btn').click();

        const addEvents = dispatchSpy.mock.calls
            .map(([event]) => event)
            .filter((event) => event.type === 'add-card-to-board');

        expect(addEvents).toHaveLength(2);
        expect(cardSystem.updateCard).toHaveBeenCalledWith('card-1', { isOnBoard: true });
        expect(cardSystem.updateCard).toHaveBeenCalledWith('card-2', { isOnBoard: true });
    });
});
