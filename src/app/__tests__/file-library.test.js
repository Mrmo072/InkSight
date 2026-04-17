import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../document-relink.js', () => ({
    findLoadedDocumentMatch: vi.fn(() => null)
}));

vi.mock('../recovery-workbench.js', () => ({
    buildRecoveryWorkbenchModel: vi.fn(() => ({
        documents: [],
        unresolvedCards: [],
        unresolvedHighlights: [],
        totalDocuments: 0,
        readyMatches: 0
    })),
    renderRecoveryWorkbenchMarkup: vi.fn(() => '')
}));

describe('file-library', () => {
    let createFileLibraryRenderer;
    let getVisibleDocuments;
    let getDocumentReferenceDetails;
    let buildRecoveryWorkbenchModel;
    let renderRecoveryWorkbenchMarkup;
    let fileListElement;

    beforeEach(async () => {
        vi.resetModules();
        document.body.innerHTML = `<div id="file-list"></div>`;
        fileListElement = document.getElementById('file-list');

        const appContextModule = await import('../app-context.js');
        appContextModule.initAppContext();
        window.inksight.documentManager = {
            getAllDocuments: vi.fn(() => [])
        };
        window.inksight.cardSystem = {
            cards: new Map()
        };
        window.inksight.highlightManager = {
            highlights: []
        };

        ({ createFileLibraryRenderer, getVisibleDocuments, getDocumentReferenceDetails } = await import('../file-library.js'));
        ({ buildRecoveryWorkbenchModel, renderRecoveryWorkbenchMarkup } = await import('../recovery-workbench.js'));
    });

    it('merges loaded files with registered missing documents', () => {
        const files = [{ id: 'loaded-1', name: 'Loaded.pdf', type: 'application/pdf' }];
        const documentManager = {
            getAllDocuments: vi.fn(() => [
                { id: 'loaded-1', name: 'Loaded.pdf', loaded: false },
                { id: 'missing-1', name: 'Missing.pdf', type: 'application/pdf', loaded: false }
            ])
        };

        const visible = getVisibleDocuments(files, documentManager);

        expect(visible).toEqual([
            {
                id: 'loaded-1',
                name: 'Loaded.pdf',
                type: 'application/pdf',
                loaded: true,
                fileData: files[0]
            },
            {
                id: 'missing-1',
                name: 'Missing.pdf',
                type: 'application/pdf',
                loaded: false,
                fileData: null
            }
        ]);
    });

    it('counts card and highlight references for a document', () => {
        const cardSystem = {
            cards: new Map([
                ['c-1', { id: 'c-1', sourceId: 'doc-1' }],
                ['c-2', { id: 'c-2', sourceId: 'doc-2' }]
            ])
        };
        const highlightManager = {
            highlights: [
                { id: 'h-1', sourceId: 'doc-1' },
                { id: 'h-2', sourceId: 'doc-1' }
            ]
        };

        const details = getDocumentReferenceDetails('doc-1', { cardSystem, highlightManager });

        expect(details).toEqual({
            cardCount: 1,
            highlightCount: 2,
            referenceCount: 3
        });
    });

    it('renders the empty-state project panel when there are no visible documents', () => {
        const renderFileList = createFileLibraryRenderer({
            fileListElement,
            getFiles: () => [],
            getCurrentFileId: () => null,
            getProjectStatus: () => ({
                linkedToDirectory: false,
                title: 'Workspace Not Saved As A Project Yet',
                description: 'Autosave enabled',
                summary: '0 loaded documents',
                projectDirectoryName: null,
                runtimeRoot: null
            })
        });

        renderFileList();

        expect(fileListElement.textContent).toContain('Your library is empty');
        expect(fileListElement.querySelector('[data-project-action="import"]')).not.toBeNull();
    });

    it('renders recovery and disabled document states for missing sources', () => {
        window.inksight.documentManager.getAllDocuments = vi.fn(() => [
            { id: 'missing-1', name: 'Ghost.pdf', type: 'application/pdf', loaded: false }
        ]);
        buildRecoveryWorkbenchModel.mockReturnValueOnce({
            documents: [{
                id: 'missing-1',
                name: 'Ghost.pdf',
                type: 'application/pdf',
                loaded: false,
                cardCount: 1,
                highlightCount: 1,
                statusLabel: 'Ready to auto match',
                loadedMatch: { id: 'loaded-1', name: 'Recovered Ghost.pdf' }
            }],
            unresolvedCards: [{ id: 'c-1' }],
            unresolvedHighlights: [{ id: 'h-1' }],
            totalDocuments: 1,
            readyMatches: 1
        });
        renderRecoveryWorkbenchMarkup.mockReturnValueOnce(`
            <section class="library-recovery-panel">
              <button data-recovery-match-id="missing-1">Match existing</button>
            </section>
        `);

        const renderFileList = createFileLibraryRenderer({
            fileListElement,
            getFiles: () => [],
            getCurrentFileId: () => null,
            getProjectStatus: () => ({
                linkedToDirectory: true,
                title: 'Project Folder Linked',
                description: 'Linked',
                summary: '1 loaded document',
                projectDirectoryName: 'Docs',
                runtimeRoot: 'D:/runtime'
            })
        });

        renderFileList();

        expect(fileListElement.querySelector('.library-recovery-panel')).not.toBeNull();
        expect(fileListElement.querySelector('.file-item.disabled')).not.toBeNull();
        expect(fileListElement.querySelector('[data-recovery-match-id="missing-1"]')).not.toBeNull();
    });
});
