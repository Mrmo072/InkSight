import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../ui/app-notifications.js', () => ({
    emitAppNotification: vi.fn()
}));

vi.mock('../../inksight-file/inksight-project-actions.js', () => ({
    saveCurrentProject: vi.fn()
}));

vi.mock('../../inksight-file/inksight-file-restore.js', () => ({
    restoreInksightPersistence: vi.fn()
}));

vi.mock('../../inksight-file/inksight-runtime-project-io.js', () => ({
    loadRuntimeProjectSnapshot: vi.fn(),
    saveRuntimeProjectSnapshot: vi.fn()
}));

describe('project-workspace', () => {
    let createProjectWorkspaceController;
    let saveCurrentProject;
    let loadRuntimeProjectSnapshot;
    let saveRuntimeProjectSnapshot;
    let emitAppNotification;

    beforeEach(async () => {
        vi.resetModules();
        ({ createProjectWorkspaceController } = await import('../project-workspace.js'));
        ({ saveCurrentProject } = await import('../../inksight-file/inksight-project-actions.js'));
        ({ loadRuntimeProjectSnapshot, saveRuntimeProjectSnapshot } = await import('../../inksight-file/inksight-runtime-project-io.js'));
        ({ emitAppNotification } = await import('../../ui/app-notifications.js'));

        document.body.innerHTML = `<div id="save-status"></div>`;
        localStorage.clear();
        sessionStorage.clear();

        const { initAppContext, setAppService } = await import('../app-context.js');
        initAppContext();
        window.inksight.board = { id: 'board-1' };
        window.inksight.currentBook = { name: 'Book.pdf' };
        window.inksight.getProjectFiles = vi.fn(() => [{ id: 'file-1' }]);
        window.inksight.hydrateProjectFiles = vi.fn();
        window.inksight.runtimeStorageInfo = {};
        setAppService('currentProjectId', 'project-1');
    });

    function createController(renderFileList = vi.fn()) {
        return createProjectWorkspaceController({
            localStorage,
            sessionStorage,
            saveStatusIndicator: document.getElementById('save-status'),
            renderFileList
        });
    }

    it('handles project-save-completed by updating the indicator text', () => {
        const controller = createController();

        controller.handleProjectSaveCompleted({
            detail: {
                savedAt: Date.parse('2026-04-16T10:20:00.000Z'),
                mode: 'Server workspace'
            }
        });

        expect(document.getElementById('save-status').textContent).toContain('Saved at');
    });

    it('performs server autosave and updates runtime storage info', async () => {
        saveRuntimeProjectSnapshot.mockResolvedValue({
            success: true,
            projectDir: 'D:/runtime/project'
        });
        const controller = createController();

        const result = await controller.performProjectAutosave({ notify: true });

        expect(result).toBe(true);
        expect(saveRuntimeProjectSnapshot).toHaveBeenCalled();
        expect(window.inksight.runtimeStorageInfo.rootPath).toBe('D:/runtime/project');
        expect(emitAppNotification).toHaveBeenCalled();
    });

    it('restores a runtime workspace and hydrates project files when available', async () => {
        loadRuntimeProjectSnapshot.mockResolvedValue({
            payload: {
                elements: [{ id: 'node-1' }],
                viewport: { x: 1, y: 2, zoom: 1 },
                theme: 'light',
                bookId: 'doc-2'
            },
            projectFiles: [{ id: 'doc-2', name: 'Doc.pdf', type: 'application/pdf' }],
            cleanup: vi.fn(),
            projectId: 'project-2',
            projectName: 'Recovered',
            savedAt: '2026-04-16T10:20:00.000Z'
        });
        const controller = createController();

        const result = await controller.restoreRuntimeWorkspace();

        expect(result).toBe(true);
        expect(window.inksight.hydrateProjectFiles).toHaveBeenCalledWith(
            [{ id: 'doc-2', name: 'Doc.pdf', type: 'application/pdf' }],
            { openCurrentBookId: 'doc-2' }
        );
        expect(document.getElementById('save-status').textContent).toContain('Recovered server workspace');
    });

    it('exports the project folder when promptSaveProject is called with a board', async () => {
        saveCurrentProject.mockResolvedValue({ ok: true });
        const controller = createController();

        await controller.promptSaveProject();

        expect(saveCurrentProject).toHaveBeenCalledWith(window.inksight.board);
        expect(document.getElementById('save-status').textContent).toBe('Project exported to local folder.');
    });
});
