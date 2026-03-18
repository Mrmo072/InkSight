import { getAppContext, setAppService } from './app-context.js';

export function createReaderLoader({
    elements,
    state,
    getOutlineSidebar,
    documentHistoryManager,
    resetAuxiliaryPanels,
    setToolMode,
    updatePageInfo
}) {
    const resolveOutlineSidebar = () => getOutlineSidebar?.() ?? null;

    const setPageInfo = (page, totalPages = state.totalPages) => {
        state.currentPage = page;
        state.totalPages = totalPages;
        updatePageInfo?.();
    };

    const enablePaging = () => {
        elements.prevBtn.disabled = false;
        elements.nextBtn.disabled = false;
    };

    const readerTypeConfigs = [
        {
            matches: (fileData) => fileData.type === 'application/pdf',
            loadingText: 'Loading PDF...',
            errorLabel: 'PDF',
            loadReaderModule: async () => {
                const { PDFReader } = await import('../readers/pdf-reader.js');
                return PDFReader;
            },
            defaultMode: 'pan',
            beforeLoad: () => {
                resolveOutlineSidebar()?.reset();
            },
            configureReader: (reader) => {
                setAppService('pdfReader', reader);
                reader.setPageCountCallback((count) => {
                    setPageInfo(state.currentPage, count);
                });
                reader.setPageChangeCallback((page) => {
                    setPageInfo(page);
                    if (getAppContext().currentBook?.md5) {
                        documentHistoryManager.updatePage(getAppContext().currentBook.md5, page);
                    }
                });
            },
            load: async (reader, fileData) => {
                const md5 = getAppContext().currentBook.md5;
                const startPage = md5
                    ? documentHistoryManager.getHistory(md5)?.lastPage || 1
                    : 1;

                await reader.load(fileData, startPage);
                enablePaging();
                resolveOutlineSidebar()?.render(reader.getOutline(), reader.pdfDoc);

                if (md5) {
                    documentHistoryManager.restoreState(md5);
                    documentHistoryManager.startAutoSave(md5, fileData.name.replace(/\.[^/.]+$/, ''));
                }
            }
        },
        {
            matches: (fileData) => fileData.type === 'application/epub+zip'
                || fileData.type === 'application/epub'
                || fileData.name.toLowerCase().endsWith('.epub'),
            loadingText: 'Loading EPUB...',
            errorLabel: 'EPUB',
            loadReaderModule: async () => {
                const { EpubReader } = await import('../readers/epub-reader.js');
                return EpubReader;
            },
            defaultMode: 'text',
            beforeLoad: () => {
                resolveOutlineSidebar()?.reset();
                setAppService('pdfReader', null);
            },
            configureReader: (reader) => {
                reader.setPageCountCallback((count) => {
                    setPageInfo(state.currentPage, count);
                });
                reader.setPageChangeCallback((location) => {
                    setPageInfo(location.start.location);
                });
            },
            load: async (reader, fileData) => {
                await reader.load(fileData);
                enablePaging();
            }
        },
        {
            matches: (fileData) => fileData.type === 'text/plain'
                || fileData.type === 'text/markdown'
                || fileData.name.toLowerCase().endsWith('.md')
                || fileData.name.toLowerCase().endsWith('.txt'),
            loadingText: 'Loading Text...',
            errorLabel: 'Text',
            loadReaderModule: async () => {
                const { TextReader } = await import('../readers/text-reader.js');
                return TextReader;
            },
            defaultMode: 'text',
            beforeLoad: () => {
                resolveOutlineSidebar()?.reset();
                setAppService('pdfReader', null);
            },
            configureReader: (reader) => {
                reader.setPageCountCallback((count) => {
                    setPageInfo(state.currentPage, count);
                });
                reader.setPageChangeCallback((page) => {
                    setPageInfo(page);
                });
            },
            load: async (reader, fileData) => {
                await reader.load(fileData);
                enablePaging();
            }
        }
    ];

    const getReaderTypeConfig = (fileData) => readerTypeConfigs.find((config) => config.matches(fileData)) ?? null;

    const loadReaderForFile = async (fileData) => {
        const config = getReaderTypeConfig(fileData);

        if (!config) {
            resetAuxiliaryPanels();
            elements.viewer.innerHTML = `<div class="error">Unsupported file type: ${fileData.type}</div>`;
            setAppService('pdfReader', null);
            return null;
        }

        config.beforeLoad?.();
        resetAuxiliaryPanels();
        elements.viewer.innerHTML = `<div class="loading">${config.loadingText}</div>`;

        const ReaderClass = await config.loadReaderModule();
        const reader = new ReaderClass(elements.viewer);
        config.configureReader?.(reader);

        try {
            await config.load(reader, fileData);
            setToolMode?.(config.defaultMode);
            return reader;
        } catch (e) {
            elements.viewer.innerHTML = `<div class="error">Error loading ${config.errorLabel}: ${e.message}</div>`;
            console.error(e);
            return reader;
        }
    };

    return {
        getReaderTypeConfig,
        loadReaderForFile
    };
}
