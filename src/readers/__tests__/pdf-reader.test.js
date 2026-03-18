import { beforeEach, describe, expect, it, vi } from 'vitest';

const toolbarInstances = [];
const rendererInstances = [];
const areaSelectorInstances = [];
const highlighterToolInstances = [];

const pdfMockState = {
    pages: [],
    document: null
};

vi.mock('../pdf-highlight-toolbar.jsx', () => ({
    PDFHighlightToolbar: class MockPDFHighlightToolbar {
        constructor() {
            this.handleHighlightClick = vi.fn();
            this.hide = vi.fn();
            this.getSelectedHighlightId = vi.fn(() => 'highlight-1');
            this.getSelectedCardId = vi.fn(() => 'card-1');
            toolbarInstances.push(this);
        }
    }
}));

vi.mock('../pdf-highlight-renderer.js', () => ({
    PDFHighlightRenderer: class MockPDFHighlightRenderer {
        constructor() {
            this.setOnHighlightClick = vi.fn((callback) => {
                this.onHighlightClick = callback;
            });
            this.setFileId = vi.fn();
            this.renderHighlightsForPage = vi.fn();
            this.clearAllHighlights = vi.fn();
            this.flashHighlight = vi.fn();
            this.removeHighlightOverlays = vi.fn();
            rendererInstances.push(this);
        }
    }
}));

vi.mock('../pdf-area-selector.js', () => ({
    PDFAreaSelector: class MockPDFAreaSelector {
        constructor() {
            this.setSelectionMode = vi.fn();
            this.setFileId = vi.fn();
            this.setFileName = vi.fn();
            this.setColor = vi.fn();
            this.setupListeners = vi.fn();
            this.destroy = vi.fn();
            areaSelectorInstances.push(this);
        }
    }
}));

vi.mock('../pdf-highlighter-tool.js', () => ({
    PDFHighlighterTool: class MockPDFHighlighterTool {
        constructor() {
            this.setFileId = vi.fn();
            this.setColor = vi.fn();
            this.setIsActive = vi.fn();
            this.setupListeners = vi.fn();
            this.removeHighlight = vi.fn();
            highlighterToolInstances.push(this);
        }
    }
}));

vi.mock('pdfjs-dist', () => {
    class MockTextLayer {
        constructor() {}

        render() {
            return Promise.resolve();
        }
    }

    return {
        GlobalWorkerOptions: {},
        TextLayer: MockTextLayer,
        getDocument: vi.fn(() => ({
            promise: Promise.resolve(pdfMockState.document)
        }))
    };
});

describe('PDFReader', () => {
    let PDFReader;
    let activeHighlightManager;

    beforeEach(async () => {
        vi.resetModules();
        toolbarInstances.length = 0;
        rendererInstances.length = 0;
        areaSelectorInstances.length = 0;
        highlighterToolInstances.length = 0;

        ({ highlightManager: activeHighlightManager } = await import('../../core/highlight-manager.js'));
        activeHighlightManager.clearAll();
        window.inksight = {
            currentBook: { md5: null, name: null, id: null },
            cardSystem: {
                cards: new Map(),
                removeCard: vi.fn(),
                remapSourceIds: vi.fn()
            },
            highlightManager: activeHighlightManager,
            documentManager: {
                markDocumentLoaded: vi.fn()
            },
            pendingRestore: null
        };

        globalThis.IntersectionObserver = class {
            observe = vi.fn();
            disconnect = vi.fn();
        };
        globalThis.requestAnimationFrame = vi.fn((callback) => {
            callback();
            return 1;
        });
        vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer);

        const mockPage = {
            getViewport: vi.fn(() => ({ width: 600, height: 800, scale: 1.5 })),
            render: vi.fn(() => ({ promise: Promise.resolve() })),
            getTextContent: vi.fn(async () => ({ items: [] }))
        };

        pdfMockState.pages = [mockPage, mockPage];
        pdfMockState.document = {
            numPages: 2,
            getPage: vi.fn(async (num) => pdfMockState.pages[num - 1]),
            getOutline: vi.fn(async () => []),
            getDestination: vi.fn(async () => [{ num: 0 }]),
            getPageIndex: vi.fn(async () => 0)
        };

        ({ PDFReader } = await import('../pdf-reader.js'));
    });

    it('loads a PDF, updates app context, and reports page count', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new PDFReader(container);
        const onPageCountChange = vi.fn();
        reader.setPageCountCallback(onPageCountChange);

        await reader.load({
            id: 'pdf-1',
            name: 'sample.pdf',
            fileObj: {
                arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)
            }
        });

        expect(window.inksight.documentManager.markDocumentLoaded).toHaveBeenCalledWith('pdf-1', true);
        expect(window.inksight.currentBook).toEqual(expect.objectContaining({
            id: 'pdf-1',
            name: 'sample.pdf'
        }));
        expect(onPageCountChange).toHaveBeenCalledWith(2);
        expect(rendererInstances[0].setFileId).toHaveBeenCalledWith('pdf-1');
        expect(areaSelectorInstances[0].setFileId).toHaveBeenCalledWith('pdf-1');
        expect(highlighterToolInstances[0].setFileId).toHaveBeenCalledWith('pdf-1');
    });

    it('applies selection modes through shared tools', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new PDFReader(container);

        reader.setSelectionMode('highlighter');
        expect(areaSelectorInstances[0].setSelectionMode).toHaveBeenCalledWith('highlighter');
        expect(highlighterToolInstances[0].setIsActive).toHaveBeenLastCalledWith(true);
        expect(highlighterToolInstances[0].setColor).toHaveBeenCalled();
        expect(container.style.cursor).toBe('default');

        reader.setSelectionMode('pan');
        expect(areaSelectorInstances[0].setSelectionMode).toHaveBeenCalledWith('pan');
        expect(highlighterToolInstances[0].setIsActive).toHaveBeenLastCalledWith(false);
        expect(container.style.cursor).toBe('grab');
    });

    it('routes highlight clicks through the toolbar and emits highlight-clicked', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new PDFReader(container);
        const clickEvents = [];
        window.addEventListener('highlight-clicked', (event) => {
            clickEvents.push(event.detail);
        });

        const focusSpy = vi.spyOn(container, 'focus');

        reader.handleHighlightClick({ target: document.createElement('div') }, 'highlight-1', 'card-1');

        expect(focusSpy).toHaveBeenCalled();
        expect(toolbarInstances[0].handleHighlightClick).toHaveBeenCalledWith(
            expect.any(Object),
            'highlight-1',
            'card-1'
        );
        expect(clickEvents).toEqual([{ highlightId: 'highlight-1', cardId: 'card-1' }]);
    });

    it('updates highlight color in the model and delegates deletions to the card system', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const reader = new PDFReader(container);
        const highlight = activeHighlightManager.createHighlight(
            'Marked text',
            { page: 1, rects: [{ page: 1, top: 0.1, left: 0.1, width: 0.2, height: 0.05 }] },
            'pdf-1',
            'text',
            '#FFE234'
        );
        const overlay = document.createElement('div');
        overlay.dataset.highlightId = highlight.id;
        overlay.className = 'highlight-overlay';
        container.appendChild(overlay);

        window.inksight.cardSystem.cards.set('card-1', {
            id: 'card-1',
            highlightId: highlight.id
        });

        reader.updateHighlightColor(highlight.id, '#00AAFF');
        expect(activeHighlightManager.getHighlight(highlight.id).color).toBe('#00AAFF');
        expect(overlay.style.backgroundColor).toBe('rgb(0, 170, 255)');

        reader.deleteHighlight(highlight.id, 'card-1');
        expect(window.inksight.cardSystem.removeCard).toHaveBeenCalledWith('card-1');
    });

    it('re-renders restored highlights for pages that are already rendered', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new PDFReader(container);
        const highlight = activeHighlightManager.createHighlight(
            'Restored text',
            { page: 1, rects: [{ page: 1, top: 0.1, left: 0.1, width: 0.2, height: 0.05 }] },
            'pdf-1',
            'text',
            '#FFE234'
        );

        const pageOne = { num: 1, wrapper: document.createElement('div'), rendered: true };
        const pageTwo = { num: 2, wrapper: document.createElement('div'), rendered: false };
        reader.pages.push(pageOne, pageTwo);

        window.dispatchEvent(new CustomEvent('highlights-restored', {
            detail: { highlights: [highlight] }
        }));

        expect(rendererInstances[0].renderHighlightsForPage).toHaveBeenCalledWith(1, [highlight]);
        expect(rendererInstances[0].renderHighlightsForPage).not.toHaveBeenCalledWith(2, [highlight]);
    });

    it('re-renders the page when a deleted card is restored for an existing highlight', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new PDFReader(container);
        const highlight = activeHighlightManager.createHighlight(
            'Restored card text',
            { page: 1, rects: [{ page: 1, top: 0.2, left: 0.2, width: 0.25, height: 0.05 }] },
            'pdf-1',
            'text',
            '#FFE234'
        );

        reader.pages.push({
            num: 1,
            wrapper: document.createElement('div'),
            rendered: true
        });

        window.dispatchEvent(new CustomEvent('card-restored', {
            detail: { highlightId: highlight.id, deleted: false }
        }));

        expect(rendererInstances[0].removeHighlightOverlays).toHaveBeenCalledWith(highlight.id);
        expect(rendererInstances[0].renderHighlightsForPage).toHaveBeenCalledWith(1, activeHighlightManager.highlights);
    });

    it('cleans up highlight overlays when a card is soft-deleted', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new PDFReader(container);
        const removeSpy = vi.spyOn(reader, 'removeHighlightOverlays');

        window.dispatchEvent(new CustomEvent('card-soft-deleted', {
            detail: { highlightId: 'highlight-restore-1', deleted: true }
        }));

        expect(removeSpy).toHaveBeenCalledWith('highlight-restore-1');
    });
});
