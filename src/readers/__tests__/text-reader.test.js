import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightManager } from '../../core/highlight-manager.js';

const toolbarInstances = [];

vi.mock('../pdf-highlight-toolbar.jsx', () => ({
    PDFHighlightToolbar: class MockPDFHighlightToolbar {
        constructor() {
            this.handleHighlightClick = vi.fn();
            this.hide = vi.fn();
            toolbarInstances.push(this);
        }
    }
}));

describe('TextReader', () => {
    let TextReader;

    beforeEach(async () => {
        vi.resetModules();
        toolbarInstances.length = 0;
        highlightManager.clearAll();
        window.inksight = {
            currentBook: { md5: null, name: null, id: null },
            cardSystem: {
                cards: new Map(),
                removeCard: vi.fn()
            }
        };

        ({ TextReader } = await import('../text-reader.js'));
    });

    it('loads plain text content and applies selection mode styles', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new TextReader(container);

        await reader.load({
            id: 'doc-1',
            name: 'notes.txt',
            type: 'text/plain',
            fileObj: {
                text: vi.fn().mockResolvedValue('hello world')
            }
        });

        expect(container.textContent).toContain('hello world');

        reader.setSelectionMode('text');
        expect(container.style.cursor).toBe('text');
        expect(container.classList.contains('disable-selection')).toBe(false);

        reader.setSelectionMode('pan');
        expect(container.style.cursor).toBe('grab');
        expect(container.classList.contains('disable-selection')).toBe(true);
    });

    it('routes highlight clicks through the toolbar with the resolved card id', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new TextReader(container);

        await reader.load({
            id: 'doc-1',
            name: 'notes.txt',
            type: 'text/plain',
            fileObj: {
                text: vi.fn().mockResolvedValue('hello world')
            }
        });

        window.inksight.cardSystem.cards.set('card-1', {
            id: 'card-1',
            highlightId: 'highlight-1'
        });

        reader.handleHighlightClick({ target: document.createElement('span') }, 'highlight-1');

        expect(toolbarInstances[0].handleHighlightClick).toHaveBeenCalledWith(
            expect.any(Object),
            'highlight-1',
            'card-1'
        );
    });

    it('deletes highlight visuals and dispatches removal through the card system', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new TextReader(container);

        await reader.load({
            id: 'doc-1',
            name: 'notes.txt',
            type: 'text/plain',
            fileObj: {
                text: vi.fn().mockResolvedValue('hello world')
            }
        });

        const highlight = highlightManager.createHighlight('hello', { index: 0, length: 5 }, 'doc-1', 'text', '#FFE234');
        window.inksight.cardSystem.cards.set('card-1', {
            id: 'card-1',
            highlightId: highlight.id
        });

        reader.restoreHighlightVisual(highlight);
        expect(reader.content.querySelector(`[data-highlight-id="${highlight.id}"]`)).not.toBeNull();

        reader.deleteHighlight(highlight.id, 'card-1');

        expect(reader.content.querySelector(`[data-highlight-id="${highlight.id}"]`)).toBeNull();
        expect(window.inksight.cardSystem.removeCard).toHaveBeenCalledWith('card-1');
    });
});
