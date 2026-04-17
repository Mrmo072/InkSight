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
    listProjectSnapshots,
    recordProjectSnapshot,
    restoreProjectSnapshot
} from './project-history.js';
import {
    ensureRuntimeProjectId,
    ensureRuntimeSessionId,
    ensureRuntimeUserId,
    setRuntimeProjectId
} from './runtime-project-identity.js';
import { saveCurrentProject } from '../inksight-file/inksight-project-actions.js';
import { restoreInksightPersistence } from '../inksight-file/inksight-file-restore.js';
import { loadRuntimeProjectSnapshot, saveRuntimeProjectSnapshot } from '../inksight-file/inksight-runtime-project-io.js';
import { listRecentProjects, recordRecentProject } from './recent-projects.js';
import { exportWorkspaceArtifact } from './workspace-export.js';

const logger = createLogger('ProjectWorkspace');

export function createProjectWorkspaceController({
    localStorage,
    sessionStorage,
    saveStatusIndicator,
    renderFileList,
    renderProjectHome = null
}) {
    let projectAutosaveIntervalId = null;
    let isProjectAutosaveRunning = false;
    let saveStatusHideTimeout = null;

    const projectStatusState = {
        ...loadProjectAutosavePrefs(localStorage),
        lastSavedAt: loadProjectSnapshotMeta(localStorage).savedAt,
        lastMode: 'Server workspace',
        snapshotHistory: [],
        recentProjects: listRecentProjects(localStorage)
    };

    function refreshRecentProjects() {
        projectStatusState.recentProjects = listRecentProjects(localStorage);
        return projectStatusState.recentProjects;
    }

    function recordRecentProjectEntry(entry = {}) {
        projectStatusState.recentProjects = recordRecentProject({
            snapshotCount: projectStatusState.snapshotHistory.length,
            ...entry
        }, localStorage);
        renderFileList?.();
        renderProjectHome?.();
        return projectStatusState.recentProjects;
    }

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
            runtimeRoot,
            snapshotHistory: projectStatusState.snapshotHistory,
            recentProjects: projectStatusState.recentProjects,
            lastSavedAt: projectStatusState.lastSavedAt,
            lastMode: projectStatusState.lastMode
        };
    }

    async function refreshProjectSnapshotHistory() {
        const runtimeIdentity = ensureProjectIdentity();
        projectStatusState.snapshotHistory = await listProjectSnapshots(runtimeIdentity);
        refreshRecentProjects();
        renderFileList?.();
        renderProjectHome?.();
        return projectStatusState.snapshotHistory;
    }

    async function restoreWorkspacePayload(result, {
        modeLabel = 'Server workspace',
        successMessage
    } = {}) {
        if (!result?.payload) {
            return false;
        }

        const appContext = getAppContext();
        appContext.currentProjectCleanup?.();
        setAppService('currentProjectCleanup', result.cleanup || null);
        setAppService('currentProjectDirectoryHandle', null);
        setAppService('currentProjectId', result.projectId || appContext.currentProjectId);

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
        projectStatusState.lastMode = modeLabel;
        recordRecentProjectEntry({
            projectId: result.projectId || appContext.currentProjectId || runtimeIdentityOrProjectId(appContext, localStorage),
            projectName: result.projectName || appContext.currentBook?.name || 'workspace',
            directoryName: appContext.currentProjectDirectoryHandle?.name || null,
            savedAt: projectStatusState.lastSavedAt,
            lastOpenedAt: Date.now(),
            source: modeLabel === 'Local project export' ? 'project-folder' : 'runtime-workspace'
        });
        showSaveStatus('success', successMessage || `Recovered ${modeLabel.toLowerCase()}.`, 2200);
        return true;
    }

    function runtimeIdentityOrProjectId(appContext, storage) {
        return appContext.currentProjectId || ensureRuntimeProjectId(storage);
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
        await recordProjectSnapshot({
            snapshotId: result.snapshotId,
            savedAt: result.savedAt,
            projectName: appContext.currentBook?.name || 'workspace',
            ...result.summary
        });
        setAppService('runtimeStorageInfo', {
            ...(appContext.runtimeStorageInfo || {}),
            rootPath: result.projectDir || appContext.runtimeStorageInfo?.rootPath || null
        });
        await refreshProjectSnapshotHistory();
        recordRecentProjectEntry({
            projectId: runtimeIdentity.projectId,
            projectName: appContext.currentBook?.name || 'workspace',
            directoryName: null,
            savedAt: Date.parse(result.savedAt || Date.now()),
            lastOpenedAt: Date.now(),
            source: 'runtime-workspace'
        });
        return true;
    }

    async function restoreRuntimeWorkspace() {
        const runtimeIdentity = ensureProjectIdentity();
        const result = await loadRuntimeProjectSnapshot({
            runtimeIdentity
        }).catch(() => null);

        if (!result?.payload) {
            return false;
        }
        await refreshProjectSnapshotHistory();
        return restoreWorkspacePayload(result, {
            modeLabel: 'Server workspace',
            successMessage: `Recovered server workspace${result.projectName ? `: ${result.projectName}` : ''}.`
        });
    }

    async function promptProjectHistory() {
        const snapshots = await refreshProjectSnapshotHistory();
        if (!snapshots.length) {
            emitAppNotification({
                title: 'Project History',
                message: 'No saved workspace snapshots are available yet.',
                level: 'warning'
            });
            return [];
        }

        emitAppNotification({
            title: 'Project History Ready',
            message: `Loaded ${snapshots.length} recent workspace snapshot ${snapshots.length === 1 ? 'entry' : 'entries'} in the library panel.`,
            level: 'success'
        });
        return snapshots;
    }

    async function continueLatestWorkspace() {
        const restored = await restoreRuntimeWorkspace();
        if (!restored) {
            emitAppNotification({
                title: 'Workspace Continue',
                message: 'No saved runtime workspace is available yet.',
                level: 'warning'
            });
        }
        return restored;
    }

    async function openRecentProject(projectId) {
        const recentProject = projectStatusState.recentProjects.find((entry) => entry.projectId === projectId);
        if (!recentProject) {
            return false;
        }

        if (recentProject.source === 'runtime-workspace') {
            setRuntimeProjectId(recentProject.projectId, localStorage);
            setAppService('currentProjectId', recentProject.projectId);
            return continueLatestWorkspace();
        }

        await promptOpenProject();
        return true;
    }

    function promptExportArtifact(type) {
        return exportWorkspaceArtifact({ type });
    }

    async function restoreProjectHistorySnapshot(snapshotId) {
        const runtimeIdentity = ensureProjectIdentity();
        const snapshot = projectStatusState.snapshotHistory.find((entry) => entry.snapshotId === snapshotId);
        const confirmed = window.confirm(`Restore snapshot from ${formatAutosaveTime(Date.parse(snapshot?.savedAt || Date.now()))}?`);
        if (!confirmed) {
            return false;
        }

        const result = await restoreProjectSnapshot({
            runtimeIdentity,
            snapshotId
        }).catch(() => null);
        if (!result?.payload) {
            emitAppNotification({
                title: 'Project History',
                message: 'The selected snapshot could not be restored.',
                level: 'error'
            });
            return false;
        }

        await refreshProjectSnapshotHistory();
        return restoreWorkspacePayload(result, {
            modeLabel: 'Snapshot history',
            successMessage: `Restored snapshot${snapshot?.projectName ? `: ${snapshot.projectName}` : ''}.`
        });
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
                recordRecentProjectEntry({
                    projectId: appContext.currentProjectId || ensureRuntimeProjectId(localStorage),
                    projectName: appContext.currentBook?.name || 'workspace',
                    directoryName: appContext.currentProjectDirectoryHandle?.name || null,
                    savedAt: projectStatusState.lastSavedAt,
                    lastOpenedAt: Date.now(),
                    source: 'project-folder'
                });
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
                recordRecentProjectEntry({
                    projectId,
                    projectName: getAppContext().currentBook?.name || 'workspace',
                    directoryName: getAppContext().currentProjectDirectoryHandle?.name || null,
                    savedAt: Date.now(),
                    lastOpenedAt: Date.now(),
                    source: 'project-folder'
                });
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
                recordRecentProjectEntry({
                    projectId: getAppContext().currentProjectId || ensureRuntimeProjectId(localStorage),
                    projectName: getAppContext().currentBook?.name || 'workspace',
                    directoryName: getAppContext().currentProjectDirectoryHandle?.name || null,
                    savedAt: projectStatusState.lastSavedAt,
                    lastOpenedAt: Date.now(),
                    source: 'project-folder'
                });
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
        recordRecentProjectEntry({
            projectId: event.detail?.projectId || getAppContext().currentProjectId || ensureRuntimeProjectId(localStorage),
            projectName: event.detail?.projectName || getAppContext().currentBook?.name || 'workspace',
            directoryName: event.detail?.directoryName || getAppContext().currentProjectDirectoryHandle?.name || null,
            savedAt: projectStatusState.lastSavedAt,
            lastOpenedAt: Date.now(),
            source: event.detail?.source || 'project-folder'
        });
        showSaveStatus('success', `Saved at ${formatAutosaveTime(projectStatusState.lastSavedAt)}.`);
    }

    function handleProjectOpened(event) {
        projectStatusState.lastMode = event.detail?.mode || projectStatusState.lastMode;
        if (getAppContext().currentProjectId) {
            setRuntimeProjectId(getAppContext().currentProjectId, localStorage);
        }
        recordRecentProjectEntry({
            projectId: event.detail?.projectId || getAppContext().currentProjectId || ensureRuntimeProjectId(localStorage),
            projectName: event.detail?.projectName || getAppContext().currentBook?.name || 'workspace',
            directoryName: event.detail?.directoryName || getAppContext().currentProjectDirectoryHandle?.name || null,
            savedAt: event.detail?.openedAt || Date.now(),
            lastOpenedAt: event.detail?.openedAt || Date.now(),
            source: event.detail?.source || 'project-folder'
        });
        showSaveStatus('success', 'Project opened and synced to the current workspace.', 1800);
    }

    return {
        projectStatusState,
        ensureProjectIdentity,
        continueLatestWorkspace,
        getRecentProjects: () => projectStatusState.recentProjects,
        getProjectStatus,
        openRecentProject,
        promptExportArtifact,
        showSaveStatus,
        restartProjectAutosave,
        restoreRuntimeWorkspace,
        performProjectAutosave,
        applyProjectAutosavePrefs,
        promptOpenProject,
        promptProjectHistory,
        promptSaveProject,
        refreshProjectSnapshotHistory,
        restoreProjectHistorySnapshot,
        handleProjectSaveCompleted,
        handleProjectOpened
    };
}
