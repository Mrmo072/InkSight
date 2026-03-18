import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightManager } from '../../core/highlight-manager.js';

const toolbarInstances = [];
const epubMockState = {
    book: null,
    rendition: null,
    contents: [],
    renditionHandlers: {},
    annotationClickHandlers: new Map()
};

vi.mock('../pdf-highlight-toolbar.jsx', () => ({
    PDFHighlightToolbar: class MockPDFHighlightToolbar {
        constructor() {
            this.handleHighlightClick = vi.fn();
            this.hide = vi.fn();
            toolbarInstances.push(this);
        }
    }
}));

vi.mock('epubjs', () => ({
    default: vi.fn(() => {
        epubMockState.renditionHandlers = {};
        epubMockState.annotationClickHandlers = new Map();

        const selection = { removeAllRanges: vi.fn() };
        const doc = {
            body: document.createElement('div'),
            addEventListener: vi.fn()
        };
        const contents = [{
            document: doc,
            window: {
                getSelection: vi.fn(() => selection)
            }
        }];

        const rendition = {
            hooks: {
                content: {
                    register: vi.fn((handler) => {
                        handler(contents[0]);
                    })
                }
            },
            annotations: {
                add: vi.fn((type, cfiRange, data, onClick) => {
                    epubMockState.annotationClickHandlers.set(data.id, onClick);
                }),
                remove: vi.fn()
            },
            on: vi.fn((event, handler) => {
                epubMockState.renditionHandlers[event] = handler;
            }),
            display: vi.fn(async () => {}),
            getContents: vi.fn(() => contents),
            currentLocation: vi.fn(() => ({
                start: { cfi: 'epubcfi(/6/2)' }
            })),
            prev: vi.fn(),
            next: vi.fn()
        };

        const book = {
            ready: Promise.resolve(),
            renderTo: vi.fn(() => rendition),
            locations: {
                generate: vi.fn(async () => {}),
                length: vi.fn(() => 12)
            },
            getRange: vi.fn(async () => ({
                toString: () => 'Selected text'
            })),
            destroy: vi.fn()
        };

        epubMockState.book = book;
        epubMockState.rendition = rendition;
        epubMockState.contents = contents;

        return book;
    })
}));

describe('EpubReader', () => {
    let EpubReader;
    let activeCardSystem;

    beforeEach(async () => {
        vi.resetModules();
        toolbarInstances.length = 0;
        highlightManager.clearAll();
        window.inksight = {
            currentBook: { md5: null, name: null, id: null },
            cardSystem: null
        };

        ({ EpubReader } = await import('../epub-reader.js'));
        ({ cardSystem: activeCardSystem } = await import('../../core/card-system.js'));
        activeCardSystem.clearAll();
        vi.spyOn(activeCardSystem, 'removeCard').mockImplementation(() => {});
        window.inksight.cardSystem = activeCardSystem;
    });

    it('loads the book, wires the rendition, and reports initial pagination state', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new EpubReader(container);
        const onPageCountChange = vi.fn();
        const onPageChange = vi.fn();
        reader.setPageCountCallback(onPageCountChange);
        reader.setPageChangeCallback(onPageChange);

        await reader.load({
            id: 'book-1',
            name: 'sample.epub',
            fileObj: {
                arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer)
            }
        });

        expect(epubMockState.book.renderTo).toHaveBeenCalledWith(container, expect.objectContaining({
            flow: 'paginated'
        }));
        expect(epubMockState.rendition.display).toHaveBeenCalled();
        expect(onPageCountChange).toHaveBeenCalledWith(12);
        expect(onPageChange).toHaveBeenCalledWith(expect.objectContaining({
            start: { cfi: 'epubcfi(/6/2)' }
        }));
    });

    it('routes annotation clicks through the toolbar with the resolved card id', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new EpubReader(container);

        await reader.load({
            id: 'book-1',
            name: 'sample.epub',
            fileObj: {
                arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer)
            }
        });

        activeCardSystem.cards.set('card-1', {
            id: 'card-1',
            highlightId: 'highlight-1'
        });

        reader.addAnnotation('highlight-1', 'epubcfi(/6/10)', '#FFE234');
        const onClick = epubMockState.annotationClickHandlers.get('highlight-1');

        onClick({ stopPropagation: vi.fn() });

        expect(toolbarInstances[0].handleHighlightClick).toHaveBeenCalledWith(
            expect.any(Object),
            'highlight-1',
            'card-1'
        );
        expect(reader.selectedHighlightId).toBe('highlight-1');
    });

    it('removes annotation visuals and dispatches card removal when deleting a highlight', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new EpubReader(container);

        await reader.load({
            id: 'book-1',
            name: 'sample.epub',
            fileObj: {
                arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer)
            }
        });

        reader.selectedHighlightId = 'highlight-1';
        activeCardSystem.cards.set('card-1', {
            id: 'card-1',
            highlightId: 'highlight-1'
        });
        reader.annotations.set('highlight-1', 'epubcfi(/6/10)');

        reader.deleteHighlight('highlight-1', 'card-1');

        expect(epubMockState.rendition.annotations.remove).toHaveBeenCalledWith('epubcfi(/6/10)', 'highlight');
        expect(activeCardSystem.removeCard).toHaveBeenCalledWith('card-1');
        expect(reader.annotations.has('highlight-1')).toBe(false);
        expect(reader.selectedHighlightId).toBeNull();
        expect(toolbarInstances[0].hide).toHaveBeenCalled();
    });

    it('applies selection mode styles to the rendition document body', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new EpubReader(container);

        await reader.load({
            id: 'book-1',
            name: 'sample.epub',
            fileObj: {
                arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer)
            }
        });

        const contentBody = epubMockState.contents[0].document.body;

        reader.setSelectionMode('text');
        expect(container.style.cursor).toBe('text');
        expect(container.style.touchAction).toBe('pan-x pan-y pinch-zoom');
        expect(contentBody.style.userSelect).toBe('text');

        reader.setSelectionMode('pan');
        expect(container.style.cursor).toBe('grab');
        expect(container.style.touchAction).toBe('auto');
        expect(contentBody.style.userSelect).toBe('none');
    });
});
