import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('recovery workbench', () => {
    let buildRecoveryWorkbenchModel;
    let createRecoveryWorkbenchController;
    let relinkRecoveredDocument;
    let emitAppNotification;
    let appContextModule;

    beforeEach(async () => {
        vi.resetModules();
        vi.doMock('../../ui/app-notifications.js', () => ({
            emitAppNotification: vi.fn()
        }));

        appContextModule = await import('../app-context.js');
        appContextModule.initAppContext();
        ({ emitAppNotification } = await import('../../ui/app-notifications.js'));
        ({
            buildRecoveryWorkbenchModel,
            createRecoveryWorkbenchController,
            relinkRecoveredDocument
        } = await import('../recovery-workbench.js'));
    });

    function setRecoveryContext() {
        window.inksight.documentManager = {
            getDocumentInfo: vi.fn((id) => ({
                'missing-1': { id: 'missing-1', name: 'Ghost.pdf', type: 'application/pdf', loaded: false },
                'loaded-1': { id: 'loaded-1', name: 'Ghost.pdf', type: 'application/pdf', loaded: true }
            }[id] ?? null)),
            getAllDocuments: vi.fn(() => [
                { id: 'missing-1', name: 'Ghost.pdf', type: 'application/pdf', loaded: false },
                { id: 'loaded-1', name: 'Ghost.pdf', type: 'application/pdf', loaded: true }
            ]),
            getMissingDocuments: vi.fn(() => [
                { id: 'missing-1', name: 'Ghost.pdf', type: 'application/pdf', loaded: false }
            ]),
            normalizeDocumentName: vi.fn((value) => String(value ?? '').trim().toLowerCase()),
            isTypeCompatible: vi.fn((expected, actual) => expected === actual),
            unregisterDocument: vi.fn()
        };
        window.inksight.cardSystem = {
            cards: new Map([
                ['card-1', { id: 'card-1', sourceId: 'missing-1' }]
            ]),
            remapSourceIds: vi.fn(),
            updateSourceNames: vi.fn()
        };
        window.inksight.highlightManager = {
            highlights: [{ id: 'hl-1', sourceId: 'missing-1' }],
            remapSourceIds: vi.fn(),
            updateSourceNames: vi.fn()
        };
        window.inksight.annotationList = {
            refresh: vi.fn()
        };
    }

    it('builds document-level impact and auto-match candidates', () => {
        setRecoveryContext();

        const workbench = buildRecoveryWorkbenchModel();

        expect(workbench.readyMatches).toBe(1);
        expect(workbench.documents).toEqual([
            expect.objectContaining({
                id: 'missing-1',
                cardCount: 1,
                highlightCount: 1,
                autoMatchReady: true,
                loadedMatch: expect.objectContaining({ id: 'loaded-1' })
            })
        ]);
    });

    it('relinks a recovered document to an already loaded source', () => {
        setRecoveryContext();

        const relinked = relinkRecoveredDocument({
            documentId: 'missing-1',
            loadedDocumentId: 'loaded-1'
        });

        expect(relinked).toBe(true);
        expect(window.inksight.cardSystem.remapSourceIds).toHaveBeenCalledWith('loaded-1', 'missing-1');
        expect(window.inksight.highlightManager.remapSourceIds).toHaveBeenCalledWith('loaded-1', 'missing-1');
        expect(window.inksight.documentManager.unregisterDocument).toHaveBeenCalledWith('missing-1');
    });

    it('notifies after a direct match and refreshes rendered state', () => {
        setRecoveryContext();
        const renderFileList = vi.fn();
        const controller = createRecoveryWorkbenchController({
            renderFileList,
            refreshAnnotations: window.inksight.annotationList.refresh,
            notify: emitAppNotification,
            promptBulkRelink: vi.fn()
        });

        const matched = controller.matchRecoveredDocument('missing-1');

        expect(matched).toBe(true);
        expect(renderFileList).toHaveBeenCalled();
        expect(window.inksight.annotationList.refresh).toHaveBeenCalled();
        expect(emitAppNotification).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Source Relinked',
            level: 'success'
        }));
    });
});
