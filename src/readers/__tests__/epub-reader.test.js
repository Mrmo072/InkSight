import { beforeEach, describe, expect, it, vi } from 'vitest';

const toolbarInstances = [];
const epubMockState = {
    book: null,
    rendition: null,
    contents: [],
    renditionHandlers: {},
    annotationClickHandlers: new Map(),
    locationFromCfiValue: 0
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
            resize: vi.fn(),
            getContents: vi.fn(() => contents),
            currentLocation: vi.fn(() => ({
                start: { cfi: 'epubcfi(/6/2)', location: 0, percentage: 0 }
            })),
            prev: vi.fn(),
            next: vi.fn()
        };

        const book = {
            ready: Promise.resolve(),
            renderTo: vi.fn(() => rendition),
            locations: {
                generate: vi.fn(async () => {}),
                length: vi.fn(() => 12),
                locationFromCfi: vi.fn(() => epubMockState.locationFromCfiValue),
                percentageFromCfi: vi.fn(() => 0),
                percentageFromLocation: vi.fn(() => 0)
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
    let activeHighlightManager;

    beforeEach(async () => {
        vi.resetModules();
        toolbarInstances.length = 0;
        epubMockState.locationFromCfiValue = 0;
        window.inksight = {
            currentBook: { md5: null, name: null, id: null },
            cardSystem: null
        };

        ({ EpubReader } = await import('../epub-reader.js'));
        ({ highlightManager: activeHighlightManager } = await import('../../core/highlight-manager.js'));
        ({ cardSystem: activeCardSystem } = await import('../../core/card-system.js'));
        activeHighlightManager.clearAll();
        activeCardSystem.clearAll();
        vi.spyOn(activeCardSystem, 'deleteCard').mockImplementation(() => {});
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
            start: expect.objectContaining({ cfi: 'epubcfi(/6/2)', location: 1 })
        }));
    });

    it('routes annotation clicks through the toolbar with the resolved card id', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new EpubReader(container);
        const clickEvents = [];
        window.addEventListener('highlight-clicked', (event) => {
            clickEvents.push(event.detail);
        });

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
        expect(clickEvents).toEqual([{ highlightId: 'highlight-1', cardId: 'card-1' }]);
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
        expect(activeCardSystem.deleteCard).toHaveBeenCalledWith('card-1');
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

    it('keeps a valid page number after layout changes even when epubjs omits start.location', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        Object.defineProperty(container, 'clientWidth', { configurable: true, value: 960 });
        Object.defineProperty(container, 'clientHeight', { configurable: true, value: 720 });

        const reader = new EpubReader(container);
        const onPageChange = vi.fn();
        const onPageCountChange = vi.fn();
        reader.setPageChangeCallback(onPageChange);
        reader.setPageCountCallback(onPageCountChange);

        await reader.load({
            id: 'book-1',
            name: 'sample.epub',
            fileObj: {
                arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer)
            }
        });

        epubMockState.locationFromCfiValue = 4;
        epubMockState.rendition.currentLocation.mockReturnValue({
            start: { cfi: 'epubcfi(/6/14)', percentage: 0.33 }
        });

        await reader.onLayoutChange();

        expect(epubMockState.rendition.resize).toHaveBeenCalledWith(960, 720, 'epubcfi(/6/14)');
        expect(onPageChange).toHaveBeenLastCalledWith(expect.objectContaining({
            start: expect.objectContaining({ cfi: 'epubcfi(/6/14)', location: 5 })
        }));
        expect(onPageCountChange).toHaveBeenLastCalledWith(12);
    });

    it('exposes the current epub location for history restore', async () => {
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

        expect(reader.getCurrentLocation()).toEqual(expect.objectContaining({
            cfi: 'epubcfi(/6/2)',
            location: 1
        }));
    });

    it('stores a resolved page number when committing an epub highlight selection', async () => {
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

        epubMockState.locationFromCfiValue = 6;
        const contents = epubMockState.contents[0];
        reader.commitSelection('epubcfi(/6/18)', contents);
        await Promise.resolve();

        await Promise.resolve();

        const createdHighlight = activeHighlightManager.highlights.at(-1);
        expect(createdHighlight.location).toEqual(expect.objectContaining({
            cfi: 'epubcfi(/6/18)',
            page: 7
        }));
    });

    it('backfills missing page info when restoring epub highlights and uses flash restore flow', async () => {
        vi.useFakeTimers();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new EpubReader(container);

        activeHighlightManager.upsertHighlight({
            id: 'highlight-restore',
            text: 'Restored text',
            sourceId: 'book-1',
            location: { cfi: 'epubcfi(/6/22)' },
            color: '#FFE234'
        });

        epubMockState.locationFromCfiValue = 2;

        await reader.load({
            id: 'book-1',
            name: 'sample.epub',
            fileObj: {
                arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer)
            }
        });

        expect(activeHighlightManager.getHighlight('highlight-restore').location.page).toBe(3);

        await reader.scrollToHighlight('highlight-restore');

        expect(epubMockState.rendition.annotations.remove).toHaveBeenCalledWith('epubcfi(/6/22)', 'highlight');
        expect(epubMockState.rendition.annotations.add).toHaveBeenCalledWith(
            'highlight',
            'epubcfi(/6/22)',
            {},
            null,
            'epub-highlight-flash',
            expect.any(Object)
        );

        vi.runAllTimers();
        expect(reader.selectedHighlightId).toBe('highlight-restore');

        vi.useRealTimers();
    });

    it('does not crash if the reader is destroyed before flash restoration runs', async () => {
        vi.useFakeTimers();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const reader = new EpubReader(container);

        activeHighlightManager.upsertHighlight({
            id: 'highlight-1',
            text: 'Selected text',
            sourceId: 'book-1',
            location: { cfi: 'epubcfi(/6/10)' },
            color: '#FFE234'
        });

        await reader.load({
            id: 'book-1',
            name: 'sample.epub',
            fileObj: {
                arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer)
            }
        });

        await reader.scrollToHighlight('highlight-1');
        reader.destroy();

        expect(() => {
            vi.runAllTimers();
        }).not.toThrow();

        vi.useRealTimers();
    });
});
