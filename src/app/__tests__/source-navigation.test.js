import { describe, expect, it, vi } from 'vitest';
import { navigateToLinkedSource } from '../source-navigation.js';

describe('source navigation', () => {
    it('opens the linked file and scrolls to the highlight when available', async () => {
        const openFile = vi.fn().mockResolvedValue(undefined);
        const scrollToHighlight = vi.fn().mockResolvedValue(undefined);

        const result = await navigateToLinkedSource({
            sourceId: 'doc-1',
            highlightId: 'hl-1',
            findHighlightById: () => ({ id: 'hl-1', sourceId: 'doc-2', location: { page: 1 } }),
            findFileById: (id) => id === 'doc-2' ? { id: 'doc-2', name: 'Book.pdf' } : null,
            openFile,
            getCurrentFile: () => ({ id: 'doc-1' }),
            getCurrentReader: () => ({ scrollToHighlight })
        });

        expect(openFile).toHaveBeenCalledWith({ id: 'doc-2', name: 'Book.pdf' });
        expect(scrollToHighlight).toHaveBeenCalledWith('hl-1');
        expect(result.status).toBe('scrolled-highlight');
    });

    it('reports missing source files through notifications', async () => {
        const notify = vi.fn();

        const result = await navigateToLinkedSource({
            sourceId: 'doc-missing',
            highlightId: 'hl-1',
            findHighlightById: () => ({ id: 'hl-1', sourceId: 'doc-missing', location: { page: 1 } }),
            findFileById: () => null,
            openFile: vi.fn(),
            getCurrentFile: () => null,
            getCurrentReader: () => null,
            notify
        });

        expect(notify).toHaveBeenCalledWith(expect.objectContaining({
            level: 'warning'
        }));
        expect(result.status).toBe('missing-file');
    });
});
