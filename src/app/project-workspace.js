import { emitAppNotification } from '../ui/app-notifications.js';
import { createLogger } from '../core/logger.js';
import { getAppContext, setAppService } from './app-context.js';
import {
    formatAutosaveTime,
    loadProjectSnapshotMeta,
    loadProjectAutosavePrefs,
    PROJECT_AUTOSAVE_SNAPSHOT_KEY,
    saveProjectAutosavePrefs
} from './project-status-helpers.js';
import {
    ensureRuntimeProjectId,
    ensureRuntimeSessionId,
    ensureRuntimeUserId,
    setRuntimeProjectId
} from './runtime-project-identity.js';
import { saveCurrentProject } from '../inksight-file/inksight-project-actions.js';
import { restoreInksightPersistence } from '../inksight-file/inksight-file-restore.js';
import { loadRuntimeProjectSnapshot, saveRuntimeProjectSnapshot } from '../inksight-file/inksight-runtime-project-io.js';

const logger = createLogger('ProjectWorkspace');

export function createProjectWorkspaceController({
    localStorage,
    sessionStorage,
    saveStatusIndicator,
    renderFileList
}) {
    let projectAutosaveIntervalId = null;
    let isProjectAutosaveRunning = false;
    let saveStatusHideTimeout = null;

    const projectStatusState = {
        ...loadProjectAutosavePrefs(localStorage),
        lastSavedAt: loadProjectSnapshotMeta(localStorage).savedAt,
        lastMode: 'Server workspace'
    };

    function ensureProjectIdentity() {
        const userId = ensureRuntimeUserId(localStorage);
        const sessionId = ensureRuntimeSessionId(sessionStorage);
        const projectId = ensureRuntimeProjectId(localStorage);

        setAppService('runtimeUserId', userId);
        setAppService('runtimeSessionId', sessionId);
        setAppService('currentProjectId', projectId);

        return { userId, sessionId, projectId };
    }

    function getProjectStatus(files = []) {
        const appContext = getAppContext();
        const linkedToDirectory = Boolean(appContext.currentProjectDirectoryHandle);
        const documentCount = files.length;
        const projectDirectoryName = appContext.currentProjectDirectoryHandle?.name || null;
        const runtimeRoot = appContext.runtimeStorageInfo?.rootPath || null;

        return {
            linkedToDirectory,
            title: linkedToDirectory ? 'Project Folder Linked' : 'Workspace Not Saved As A Project Yet',
            description: linkedToDirectory
                ? 'This workspace is linked to a project folder. Saving will update the board state, bundled source documents, and extracted assets in that folder.'
                : 'Autosave writes to the server workspace under runtime-data. Use Save Project Folder only when you want to export a full local copy.',
            summary: `${documentCount} loaded ${documentCount === 1 ? 'document' : 'documents'}`,
            projectDirectoryName,
            runtimeRoot
        };
    }

    function showSaveStatus(state, message, duration = 1800) {
        if (!saveStatusIndicator) {
            return;
        }

        if (saveStatusHideTimeout) {
            clearTimeout(saveStatusHideTimeout);
            saveStatusHideTimeout = null;
        }

        saveStatusIndicator.textContent = message;
        saveStatusIndicator.className = `save-status-indicator visible ${state}`.trim();

        if (duration > 0) {
            saveStatusHideTimeout = setTimeout(() => {
                saveStatusIndicator.classList.remove('visible', 'success', 'error', 'saving');
            }, duration);
        }
    }

    function restartProjectAutosave() {
        if (projectAutosaveIntervalId) {
            clearInterval(projectAutosaveIntervalId);
            projectAutosaveIntervalId = null;
        }

        if (!projectStatusState.enabled) {
            return;
        }

        projectAutosaveIntervalId = setInterval(() => {
            void performProjectAutosave({ notify: false });
        }, Math.max(1, projectStatusState.intervalMinutes) * 60 * 1000);
    }

    async function persistRuntimeProjectSnapshot() {
        const appContext = getAppContext();
        const board = appContext.board;
        if (!board) {
            return false;
        }

        const runtimeIdentity = ensureProjectIdentity();
        const result = await saveRuntimeProjectSnapshot({
            board,
            appContext,
            projectFiles: appContext.getProjectFiles?.() ?? [],
            runtimeIdentity,
            projectName: appContext.currentBook?.name || 'workspace'
        });

        if (!result?.success) {
            return false;
        }

        localStorage.setItem(PROJECT_AUTOSAVE_SNAPSHOT_KEY, JSON.stringify({
            savedAt: Date.now()
        }));
        setAppService('runtimeStorageInfo', {
            ...(appContext.runtimeStorageInfo || {}),
            rootPath: result.projectDir || appContext.runtimeStorageInfo?.rootPath || null
        });
        return true;
    }

    async function restoreRuntimeWorkspace() {
        const appContext = getAppContext();
        const runtimeIdentity = ensureProjectIdentity();
        const result = await loadRuntimeProjectSnapshot({
            runtimeIdentity
        }).catch(() => null);

        if (!result?.payload) {
            return false;
        }

        appContext.currentProjectCleanup?.();
        setAppService('currentProjectCleanup', result.cleanup || null);
        setAppService('currentProjectDirectoryHandle', null);
        setAppService('currentProjectId', result.projectId || runtimeIdentity.projectId);

        window.dispatchEvent(new CustomEvent('restore-board-state', {
            detail: {
                elements: result.payload.elements,
                viewport: result.payload.viewport,
                theme: result.payload.theme
            }
        }));

        restoreInksightPersistence(result.payload, appContext, {
            onBookMismatch: ({ bookName }) => {
                emitAppNotification({
                    title: 'Book Mismatch',
                    message: `This mind map was saved for a different book (${bookName}). Nodes might not link correctly until the original source files are relinked.`,
                    level: 'warning'
                });
            }
        });

        if (result.projectFiles?.length) {
            await appContext.hydrateProjectFiles?.(result.projectFiles, {
                openCurrentBookId: result.payload.bookId || null
            });
        } else {
            renderFileList();
        }

        projectStatusState.lastSavedAt = result.savedAt ? Date.parse(result.savedAt) : projectStatusState.lastSavedAt;
        projectStatusState.lastMode = 'Server workspace';
        showSaveStatus('success', `Recovered server workspace${result.projectName ? `: ${result.projectName}` : ''}.`, 2200);
        return true;
    }

    async function performProjectAutosave({ notify = false, forceExport = false } = {}) {
        if (isProjectAutosaveRunning) {
            return false;
        }

        isProjectAutosaveRunning = true;

        try {
            const appContext = getAppContext();
            const board = appContext.board;
            if (!board) {
                return false;
            }

            if (forceExport) {
                showSaveStatus('saving', 'Exporting project to local folder...', 0);
                let payload = null;
                try {
                    payload = await saveCurrentProject(board, {
                        notify,
                        forcePrompt: forceExport
                    });
                } catch {
                    showSaveStatus('error', 'Project export was cancelled.', 1800);
                    return false;
                }
                if (!payload) {
                    showSaveStatus('error', 'Project export was cancelled.', 1800);
                    return false;
                }

                projectStatusState.lastSavedAt = Date.now();
                projectStatusState.lastMode = 'Local project export';
                showSaveStatus('success', 'Project exported to local folder.');
                return true;
            }

            showSaveStatus('saving', 'Saving workspace to server...', 0);
            const saved = await persistRuntimeProjectSnapshot();
            if (saved) {
                projectStatusState.lastSavedAt = Date.now();
                projectStatusState.lastMode = 'Server workspace';
                showSaveStatus('success', `Saved to server workspace at ${formatAutosaveTime(projectStatusState.lastSavedAt)}.`);

                if (notify) {
                    emitAppNotification({
                        title: 'Server Workspace Saved',
                        message: 'Saved the current workspace state into the server runtime-data area. Use Save Project Folder when you want a local export for the terminal user.',
                        level: 'success'
                    });
                }
            }

            return saved;
        } finally {
            isProjectAutosaveRunning = false;
        }
    }

    function applyProjectAutosavePrefs(partialPrefs) {
        Object.assign(projectStatusState, partialPrefs);
        saveProjectAutosavePrefs(projectStatusState, localStorage);
        restartProjectAutosave();
    }

    async function promptOpenProject() {
        const openProject = getAppContext().openProjectFile;
        if (typeof openProject === 'function') {
            try {
                await openProject();
                const projectId = getAppContext().currentProjectId || ensureRuntimeProjectId(localStorage);
                setAppService('currentProjectId', projectId);
                setRuntimeProjectId(projectId, localStorage);
                projectStatusState.lastMode = 'Server workspace';
                void performProjectAutosave({ notify: false });
            } catch (error) {
                logger.warn('Open project folder failed', error);
            }
            return;
        }

        emitAppNotification({
            title: 'Project Folder',
            message: 'Project loading is not ready yet. Please wait for the workspace board to finish initializing.',
            level: 'warning'
        });
    }

    async function promptSaveProject() {
        const board = getAppContext().board;
        if (board) {
            try {
                await saveCurrentProject(board);
                projectStatusState.lastSavedAt = Date.now();
                projectStatusState.lastMode = 'Local project export';
                showSaveStatus('success', 'Project exported to local folder.');
            } catch (error) {
                logger.warn('Save project folder failed', error);
            }
            return;
        }

        emitAppNotification({
            title: 'Project Folder',
            message: 'Project saving is not ready yet. Please wait for the workspace board to finish initializing.',
            level: 'warning'
        });
    }

    function handleProjectSaveCompleted(event) {
        projectStatusState.lastSavedAt = event.detail?.savedAt || Date.now();
        projectStatusState.lastMode = event.detail?.mode || projectStatusState.lastMode;
        if (getAppContext().currentProjectId) {
            setRuntimeProjectId(getAppContext().currentProjectId, localStorage);
        }
        showSaveStatus('success', `Saved at ${formatAutosaveTime(projectStatusState.lastSavedAt)}.`);
    }

    function handleProjectOpened(event) {
        projectStatusState.lastMode = event.detail?.mode || projectStatusState.lastMode;
        if (getAppContext().currentProjectId) {
            setRuntimeProjectId(getAppContext().currentProjectId, localStorage);
        }
        showSaveStatus('success', 'Project opened and synced to the current workspace.', 1800);
    }

    return {
        projectStatusState,
        ensureProjectIdentity,
        getProjectStatus,
        showSaveStatus,
        restartProjectAutosave,
        restoreRuntimeWorkspace,
        performProjectAutosave,
        applyProjectAutosavePrefs,
        promptOpenProject,
        promptSaveProject,
        handleProjectSaveCompleted,
        handleProjectOpened
    };
}
