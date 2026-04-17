import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightManager } from '../highlight-manager.js';

describe('HighlightManager', () => {
    beforeEach(() => {
        highlightManager.clearAll();
        vi.restoreAllMocks();
    });

    it('creates trimmed highlights and dispatches creation events', () => {
        const listener = vi.fn();
        window.addEventListener('highlight-created', listener);

        const highlight = highlightManager.createHighlight('  hello world  ', { page: 1 }, 'doc-1', 'text', '#fff000', 'Book.pdf');

        expect(highlight.text).toBe('hello world');
        expect(highlight.sourceId).toBe('doc-1');
        expect(highlight.sourceName).toBe('Book.pdf');
        expect(highlightManager.getHighlight(highlight.id)).toEqual(highlight);
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            detail: highlight
        }));

        window.removeEventListener('highlight-created', listener);
    });

    it('restores highlights, remaps source IDs, and emits restore events', () => {
        const listener = vi.fn();
        window.addEventListener('highlights-restored', listener);

        highlightManager.restorePersistenceData({
            highlights: [
                { id: 'h-1', text: 'a', sourceId: 'old-doc' },
                { id: 'h-2', text: 'b', sourceId: 'old-doc' }
            ]
        }, 'new-doc');

        expect(highlightManager.getHighlightsBySource('new-doc')).toHaveLength(2);
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            detail: { highlights: highlightManager.highlights }
        }));

        window.removeEventListener('highlights-restored', listener);
    });

    it('remaps only matching source IDs and warns if old source id is missing', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        highlightManager.highlights = [
            { id: 'h-1', sourceId: 'old-doc' },
            { id: 'h-2', sourceId: 'other-doc' }
        ];

        highlightManager.remapSourceIds('new-doc', 'old-doc');
        highlightManager.remapSourceIds('bad-doc');

        expect(highlightManager.getHighlight('h-1').sourceId).toBe('new-doc');
        expect(highlightManager.getHighlight('h-2').sourceId).toBe('other-doc');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('without oldSourceId. Aborting'));
    });

    it('fills missing source names without overwriting existing ones', () => {
        highlightManager.highlights = [
            { id: 'h-1', sourceId: 'doc-1', sourceName: null },
            { id: 'h-2', sourceId: 'doc-1', sourceName: 'Preset.pdf' }
        ];

        highlightManager.updateSourceNames('doc-1', 'Book.pdf');

        expect(highlightManager.getHighlight('h-1').sourceName).toBe('Book.pdf');
        expect(highlightManager.getHighlight('h-2').sourceName).toBe('Preset.pdf');
    });

    it('can upsert a highlight by its existing id and notify the UI', () => {
        const listener = vi.fn();
        window.addEventListener('highlights-restored', listener);

        highlightManager.upsertHighlight({
            id: 'h-9',
            text: ' Recovered quote ',
            location: { page: 9 },
            sourceId: 'doc-9',
            sourceName: 'Recovered.pdf',
            color: '#ffe234'
        });

        expect(highlightManager.getHighlight('h-9')).toEqual(expect.objectContaining({
            id: 'h-9',
            text: 'Recovered quote',
            location: { page: 9 },
            sourceId: 'doc-9'
        }));
        expect(listener).toHaveBeenCalled();

        window.removeEventListener('highlights-restored', listener);
    });

    it('removes and clears highlights while notifying the UI', () => {
        const removedListener = vi.fn();
        const clearedListener = vi.fn();
        window.addEventListener('highlight-removed', removedListener);
        window.addEventListener('highlights-cleared', clearedListener);

        const highlight = highlightManager.createHighlight('hello', { page: 1 }, 'doc-1');
        highlightManager.removeHighlight(highlight.id);
        highlightManager.clearAll();

        expect(highlightManager.getHighlight(highlight.id)).toBeUndefined();
        expect(removedListener).toHaveBeenCalledWith(expect.objectContaining({ detail: highlight.id }));
        expect(clearedListener).toHaveBeenCalled();

        window.removeEventListener('highlight-removed', removedListener);
        window.removeEventListener('highlights-cleared', clearedListener);
    });
});
