import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBoardOperations } from '../drawnix-board-state.js';

const appContext = {
    highlightManager: {
        getHighlight: vi.fn(),
        upsertHighlight: vi.fn()
    }
};

vi.mock('../../app/app-context.js', () => ({
    getAppContext: () => appContext
}));

describe('drawnix-board-state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('marks cards as off-board when nodes are removed', () => {
        const cardSystem = {
            cards: new Map([
                ['c-1', { id: 'c-1', highlightId: 'h-1', location: { page: 3 } }]
            ]),
            updateCard: vi.fn()
        };

        appContext.highlightManager.getHighlight.mockReturnValue({ id: 'h-1' });

        handleBoardOperations({
            data: {
                operations: [{ type: 'remove_node', node: { data: { cardId: 'c-1' } } }]
            },
            boardRef: { current: null },
            processingCardIds: { current: new Set() },
            cardSystem,
            logger: { warn: vi.fn() }
        });

        expect(cardSystem.updateCard).toHaveBeenCalledWith('c-1', { isOnBoard: false });
        expect(appContext.highlightManager.upsertHighlight).not.toHaveBeenCalled();
    });

    it('restores missing highlights from card metadata before removing a node from the board', () => {
        const cardSystem = {
            cards: new Map([
                ['c-1', {
                    id: 'c-1',
                    highlightId: 'h-1',
                    content: 'Quoted text',
                    sourceId: 'doc-1',
                    sourceName: 'Book.pdf',
                    location: { page: 7, rects: [{ top: 120 }] },
                    highlightType: 'text',
                    createdAt: '2026-04-17T10:00:00.000Z',
                    color: '#ffe234'
                }]
            ]),
            updateCard: vi.fn()
        };

        appContext.highlightManager.getHighlight.mockReturnValue(undefined);

        handleBoardOperations({
            data: {
                operations: [{ type: 'remove_node', node: { data: { cardId: 'c-1' } } }]
            },
            boardRef: { current: null },
            processingCardIds: { current: new Set() },
            cardSystem,
            logger: { warn: vi.fn() }
        });

        expect(appContext.highlightManager.upsertHighlight).toHaveBeenCalledWith({
            id: 'h-1',
            text: 'Quoted text',
            location: { page: 7, rects: [{ top: 120 }] },
            sourceId: 'doc-1',
            sourceName: 'Book.pdf',
            type: 'text',
            createdAt: '2026-04-17T10:00:00.000Z',
            color: '#ffe234'
        });
        expect(cardSystem.updateCard).toHaveBeenCalledWith('c-1', { isOnBoard: false });
    });
});
