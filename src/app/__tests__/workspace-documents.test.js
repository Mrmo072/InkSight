import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceDocumentsController } from '../workspace-documents.js';

describe('workspace-documents', () => {
    let state;
    let elements;
    let appContext;
    let currentReader;
    let setCurrentReader;
    let renderFileList;
    let projectWorkspace;
    let readerLoader;
    let documentHistoryManager;
    let updateToolbarSummary;
    let updateToolAvailability;
    let setWorkspaceMode;
    let updatePageInfo;
    let getDocumentReferenceDetails;

    beforeEach(async () => {
        vi.resetModules();
        document.body.innerHTML = `
            <div id="viewer"></div>
            <input id="file-input" />
            <div id="doc-title"></div>
            <div id="mobile-doc-summary"></div>
        `;
        localStorage.clear();
        sessionStorage.clear();
        window.confirm = vi.fn(() => true);

        state = {
            files: [],
            currentFile: null,
            currentPage: 1,
            totalPages: 0
        };
        elements = {
            viewer: document.getElementById('viewer'),
            fileInput: document.getElementById('file-input'),
            docTitle: document.getElementById('doc-title'),
            mobileDocSummary: document.getElementById('mobile-doc-summary')
        };
        currentReader = { destroy: vi.fn() };
        setCurrentReader = vi.fn((value) => {
            currentReader = value;
        });
        renderFileList = vi.fn();
        projectWorkspace = {
            ensureProjectIdentity: vi.fn(),
            performProjectAutosave: vi.fn()
        };
        readerLoader = {
            loadReaderForFile: vi.fn(async (file) => ({ id: file.id }))
        };
        documentHistoryManager = {
            stopAutoSave: vi.fn()
        };
        updateToolbarSummary = vi.fn();
        updateToolAvailability = vi.fn();
        setWorkspaceMode = vi.fn();
        updatePageInfo = vi.fn();
        getDocumentReferenceDetails = vi.fn(() => ({
            cardCount: 0,
            highlightCount: 0,
            referenceCount: 0
        }));

        const { initAppContext, setAppService, updateCurrentBook } = await import('../app-context.js');
        initAppContext();
        appContext = window.inksight;
        appContext.documentManager = {
            registerDocument: vi.fn(),
            unregisterDocument: vi.fn(),
            markDocumentLoaded: vi.fn(),
            getDocumentInfo: vi.fn(() => null)
        };
        appContext.cardSystem = {
            updateSourceNames: vi.fn()
        };
        appContext.highlightManager = {
            updateSourceNames: vi.fn()
        };
        appContext.annotationList = {
            load: vi.fn()
        };
        updateCurrentBook({ id: null, md5: null, name: null });
        setAppService('pdfReader', { stale: true });
    });

    function createController() {
        return createWorkspaceDocumentsController({
            logger: { warn: vi.fn() },
            projectWorkspace,
            getDocumentReferenceDetails,
            workspace: {
                state,
                elements
            },
            readers: {
                readerLoader,
                documentHistoryManager,
                getCurrentReader: () => currentReader,
                setCurrentReader
            },
            ui: {
                renderFileList,
                updateToolbarSummary,
                updateToolAvailability,
                setWorkspaceMode,
                updatePageInfo
            }
        });
    }

    it('imports a file and opens it when requested', async () => {
        const controller = createController();
        const file = new File(['hello'], 'Doc.md', { type: 'text/markdown', lastModified: 1 });

        await controller.importFiles([file], { openImportedFile: true });

        expect(state.files).toHaveLength(1);
        expect(projectWorkspace.ensureProjectIdentity).toHaveBeenCalled();
        expect(readerLoader.loadReaderForFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Doc.md' }));
        expect(appContext.annotationList.load).toHaveBeenCalled();
        expect(projectWorkspace.performProjectAutosave).toHaveBeenCalled();
    });

    it('imports a file without opening it when openImportedFile is false', async () => {
        const controller = createController();
        const file = new File(['hello'], 'Doc.md', { type: 'text/markdown', lastModified: 1 });

        await controller.importFiles([file], { openImportedFile: false });

        expect(state.files).toHaveLength(1);
        expect(readerLoader.loadReaderForFile).not.toHaveBeenCalled();
        expect(state.currentFile).toBeNull();
    });

    it('removes the current file and falls back to the next one', async () => {
        const controller = createController();
        state.files = [
            { id: 'a', name: 'A.pdf', type: 'application/pdf' },
            { id: 'b', name: 'B.pdf', type: 'application/pdf' }
        ];
        state.currentFile = state.files[0];
        appContext.currentBook.id = 'a';

        await controller.removeFileFromWorkspace('a');

        expect(state.files.map((file) => file.id)).toEqual(['b']);
        expect(readerLoader.loadReaderForFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
        expect(appContext.documentManager.markDocumentLoaded).toHaveBeenCalledWith('a', false);
    });

    it('does not remove a file when the confirmation is cancelled', async () => {
        window.confirm = vi.fn(() => false);
        const controller = createController();
        state.files = [{ id: 'a', name: 'A.pdf', type: 'application/pdf' }];

        await controller.removeFileFromWorkspace('a');

        expect(state.files).toHaveLength(1);
        expect(appContext.documentManager.unregisterDocument).not.toHaveBeenCalled();
        expect(readerLoader.loadReaderForFile).not.toHaveBeenCalled();
    });

    it('opens a loaded file by id and calls missing callback for unloaded documents', async () => {
        const controller = createController();
        state.files = [{ id: 'a', name: 'A.pdf', type: 'application/pdf' }];
        appContext.documentManager.getDocumentInfo = vi.fn(() => ({
            id: 'missing-1',
            loaded: false
        }));
        const onMissingDocument = vi.fn();

        controller.openFileById('a', { onMissingDocument });
        controller.openFileById('missing-1', { onMissingDocument });

        expect(readerLoader.loadReaderForFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
        expect(onMissingDocument).toHaveBeenCalledWith('missing-1');
    });

    it('clears loaded files and resets reader state', () => {
        const controller = createController();
        state.files = [{ id: 'a', name: 'A.pdf', type: 'application/pdf' }];
        state.currentFile = state.files[0];
        state.currentPage = 5;
        state.totalPages = 10;
        elements.viewer.innerHTML = '<p>loaded</p>';

        controller.clearLoadedFiles();

        expect(state.files).toEqual([]);
        expect(state.currentFile).toBeNull();
        expect(state.currentPage).toBe(1);
        expect(state.totalPages).toBe(0);
        expect(documentHistoryManager.stopAutoSave).toHaveBeenCalled();
        expect(updatePageInfo).toHaveBeenCalled();
        expect(elements.viewer.innerHTML).toBe('');
    });
});
