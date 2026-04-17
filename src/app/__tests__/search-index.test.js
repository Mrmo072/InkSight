import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspaceSearchIndex, queryWorkspaceSearch } from '../search-index.js';

describe('search-index', () => {
    beforeEach(async () => {
        vi.resetModules();
        const { initAppContext } = await import('../app-context.js');
        initAppContext();
        window.inksight.documentManager = {
            getAllDocuments: vi.fn(() => [])
        };
        window.inksight.cardSystem = {
            cards: new Map([
                ['card-1', { id: 'card-1', content: 'Alpha insight', note: 'Summary note', sourceId: 'doc-1', highlightId: 'hl-1', sourceName: 'Alpha.pdf' }]
            ])
        };
        window.inksight.highlightManager = {
            highlights: [
                { id: 'hl-1', text: 'Alpha highlighted passage', sourceId: 'doc-1', sourceName: 'Alpha.pdf' }
            ]
        };
    });

    it('builds document, card, and highlight search entries', () => {
        const index = buildWorkspaceSearchIndex(window.inksight, [
            { id: 'doc-1', name: 'Alpha.pdf', type: 'application/pdf' }
        ]);

        expect(index.map((entry) => entry.type)).toEqual(['document', 'card', 'highlight']);
    });

    it('returns mixed typed results ordered by relevance', () => {
        const index = buildWorkspaceSearchIndex(window.inksight, [
            { id: 'doc-1', name: 'Alpha.pdf', type: 'application/pdf' }
        ]);

        const results = queryWorkspaceSearch(index, 'alpha');

        expect(results).toHaveLength(3);
        expect(results[0]).toEqual(expect.objectContaining({ type: 'document', title: 'Alpha.pdf' }));
        expect(results[1].type).toBe('card');
        expect(results[2].type).toBe('highlight');
    });

    it('returns no results for empty queries', () => {
        expect(queryWorkspaceSearch([], '')).toEqual([]);
        expect(queryWorkspaceSearch([], '   ')).toEqual([]);
    });
});
