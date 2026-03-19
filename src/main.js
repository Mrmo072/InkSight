import './styles/styles.css';
import { highlightManager } from './core/highlight-manager.js';
import { SplitView } from './ui/split-view.js';
import { OutlineSidebar } from './ui/outline-sidebar.js';
import { AnnotationList } from './ui/annotation-list.js';
import { emitAppNotification, mountAppNotifications } from './ui/app-notifications.js';
import { suppressResizeObserverLoop } from './drawnix/react-board/src/utils/resizeObserverFix.js';
import { documentHistoryManager } from './core/document-history-manager.js'; // Import History Manager
import { getAppContext, initAppContext, setAppService, updateCurrentBook } from './app/app-context.js';
import { createReaderLoader } from './app/reader-loader.js';
import { registerEventListeners } from './app/event-listeners.js';
import { setupSelectionSync } from './app/selection-sync.js';
import { buildRecoveryDiagnostics, chooseDocumentTarget, findLoadedDocumentMatch } from './app/document-relink.js';
import { buildDocumentRemovalPrompt, reorderFilesById } from './app/file-list-helpers.js';
import {
    formatAutosaveTime,
    loadProjectSnapshotMeta,
    loadProjectAutosavePrefs,
    PROJECT_AUTOSAVE_SNAPSHOT_KEY,
    saveProjectAutosavePrefs
} from './app/project-status-helpers.js';
import {
    ensureRuntimeProjectId,
    ensureRuntimeSessionId,
    ensureRuntimeUserId,
    setRuntimeProjectId
} from './app/runtime-project-identity.js';
import { handleRecoveryPanelClick } from './app/recovery-panel-actions.js';
import { navigateToLinkedSource } from './app/source-navigation.js';
import { saveCurrentProject } from './inksight-file/inksight-project-actions.js';
import { restoreInksightPersistence } from './inksight-file/inksight-file-restore.js';
import { getRuntimeStorageInfo, loadRuntimeProjectSnapshot, saveRuntimeProjectSnapshot } from './inksight-file/inksight-runtime-project-io.js';
import { createLogger } from './core/logger.js';

const logger = createLogger('Main');

suppressResizeObserverLoop();

initAppContext();

// Import cardSystem (it's already imported by other modules, but we need it here)
import { cardSystem } from './core/card-system.js';
import { documentManager } from './core/document-manager.js';
setAppService('cardSystem', cardSystem);
setAppService('highlightManager', highlightManager);
setAppService('documentManager', documentManager);

// State
const state = {
    currentFile: null,
    files: [],
    zoom: 1.0,
    currentPage: 1,
    totalPages: 0,
    workspaceMode: 'reading'
};

// DOM Elements
const elements = {
    appLayout: document.getElementById('app-layout'),
    readerContainer: document.getElementById('reader-container'),
    readerContentWrapper: document.getElementById('reader-content-wrapper'),
    fileInput: document.getElementById('file-input'),
    fileList: document.getElementById('file-list'),
    viewer: document.getElementById('viewer'),
    docTitle: document.getElementById('doc-title'),
    prevBtn: document.getElementById('prev-page'),
    nextBtn: document.getElementById('next-page'),
    mobilePrevBtn: document.getElementById('mobile-prev-page'),
    mobileNextBtn: document.getElementById('mobile-next-page'),
    mobileImportDocumentsBtn: document.getElementById('mobile-import-documents'),
    mobileOpenProjectBtn: document.getElementById('mobile-open-project'),
    mobileSaveProjectBtn: document.getElementById('mobile-save-project'),
    pageInfo: document.getElementById('page-info'),
    mobileContextPageInfo: document.getElementById('mobile-context-page-info'),
    mobileDocSummary: document.getElementById('mobile-doc-summary'),
    mobilePageInfo: document.getElementById('mobile-page-info'),
    toolbarImportDocumentsBtn: document.getElementById('toolbar-import-documents'),
    toolbarOpenProjectBtn: document.getElementById('toolbar-open-project'),
    toolbarSaveProjectBtn: document.getElementById('toolbar-save-project'),
    toggleSidebarBtn: document.getElementById('toggle-sidebar'),
    toggleNotesBtn: document.getElementById('toggle-notes'),
    toggleOutlineBtn: document.getElementById('toggle-outline'),
    toggleMobileToolsBtn: document.getElementById('toggle-mobile-tools'),
    workspaceModeReadingBtn: document.getElementById('workspace-mode-reading'),
    workspaceModeCaptureBtn: document.getElementById('workspace-mode-capture'),
    workspaceModeMapBtn: document.getElementById('workspace-mode-map'),
    mobileWorkspaceModeReadingBtn: document.getElementById('mobile-workspace-mode-reading'),
    mobileWorkspaceModeCaptureBtn: document.getElementById('mobile-workspace-mode-capture'),
    mobileWorkspaceModeMapBtn: document.getElementById('mobile-workspace-mode-map'),
    toolbarSidebarWidthPresetBtn: document.getElementById('toolbar-sidebar-width-preset'),
    toolbarNotesWidthPresetBtn: document.getElementById('toolbar-notes-width-preset'),
    sidebarWidthPresetBtn: document.getElementById('sidebar-width-preset'),
    closeSidebarPanelBtn: document.getElementById('close-sidebar-panel'),
    notesWidthPresetBtn: document.getElementById('notes-width-preset'),
    closeNotesPanelBtn: document.getElementById('close-notes-panel'),
    closeOutlinePanelBtn: document.getElementById('close-outline-panel'),
    readerToolbar: document.getElementById('reader-toolbar'),
    panelBackdrop: document.getElementById('panel-backdrop'),
    selectionModeFloating: document.getElementById('selection-mode-floating'),
    selectionModeDragHandle: document.getElementById('selection-mode-drag-handle'),
    saveStatusIndicator: document.getElementById('save-status-indicator'),
    appNotifications: document.getElementById('app-notifications'),
    emptyImportDocumentBtn: document.getElementById('empty-import-document'),
    emptyOpenProjectBtn: document.getElementById('empty-open-project')
};

let currentReader = null;
let splitView = null;
let outlineSidebar = null;
let annotationList = null;
let currentToolMode = 'pan';
let readerLoader = null;
let setMobileNotesView = () => {};
const CAPTURE_NOTES_FOCUS_WIDTH = 356;
const getMapNotesFocusWidth = () => Math.round(window.innerWidth * 0.58);
let readerLayoutSyncTimeout = null;
const selectionToolbarPositions = {
    desktop: null,
    mobile: null
};
let draggedFileId = null;
let projectAutosaveIntervalId = null;
let isProjectAutosaveRunning = false;
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

async function createDrawnixView(container) {
    const { DrawnixView } = await import('./mindmap/drawnix-view.js');
    return new DrawnixView(container);
}

function registerCleanup(cleanup) {
    return cleanup;
}

function getCardsCollection() {
    const cards = getAppContext().cardSystem?.cards;
    if (cards instanceof Map) {
        return Array.from(cards.values());
    }

    return Object.values(cards || {});
}

function getVisibleDocuments() {
    const registeredDocuments = getAppContext().documentManager?.getAllDocuments?.() ?? [];
    const importedFileIds = new Set(state.files.map((file) => file.id));
    const visibleDocuments = state.files.map((file) => ({
        id: file.id,
        name: file.name,
        type: file.type,
        loaded: true,
        fileData: file
    }));

    registeredDocuments.forEach((doc) => {
        if (importedFileIds.has(doc.id)) {
            return;
        }

        visibleDocuments.push({
            ...doc,
            fileData: null
        });
    });

    return visibleDocuments;
}

function getMissingDocuments() {
    return getAppContext().documentManager?.getMissingDocuments?.() ?? [];
}

function describeDocumentStatus(file, index) {
    if (file.loaded) {
        return `Document ${index + 1}`;
    }

    return 'Source file missing - re-import to relink';
}

function getDocumentReferenceDetails(documentId) {
    const cardCount = getCardsCollection().filter((card) => card.sourceId === documentId).length;
    const highlightCount = getAppContext().highlightManager?.highlights?.filter((highlight) => highlight.sourceId === documentId).length ?? 0;
    return {
        cardCount,
        highlightCount,
        referenceCount: cardCount + highlightCount
    };
}

function getProjectStatus() {
    const appContext = getAppContext();
    const linkedToDirectory = Boolean(appContext.currentProjectDirectoryHandle);
    const documentCount = state.files.length;
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

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function promptRelinkDocument(documentId) {
    const targetDocument = getAppContext().documentManager?.getDocumentInfo?.(documentId);
    if (!targetDocument || targetDocument.loaded) {
        return;
    }

    setAppService('pendingDocumentImport', {
        id: targetDocument.id,
        name: targetDocument.name,
        type: targetDocument.type
    });
    elements.fileInput.value = '';
    elements.fileInput.click();
}

function promptBulkRelink() {
    setAppService('pendingDocumentImport', {
        mode: 'bulk'
    });
    elements.fileInput.value = '';
    elements.fileInput.click();
}

function promptImportDocument() {
    setAppService('pendingDocumentImport', null);
    elements.fileInput.value = '';
    elements.fileInput.click();
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

let saveStatusHideTimeout = null;

function showSaveStatus(state, message, duration = 1800) {
    if (!elements.saveStatusIndicator) {
        return;
    }

    if (saveStatusHideTimeout) {
        clearTimeout(saveStatusHideTimeout);
        saveStatusHideTimeout = null;
    }

    elements.saveStatusIndicator.textContent = message;
    elements.saveStatusIndicator.className = `save-status-indicator visible ${state}`.trim();

    if (duration > 0) {
        saveStatusHideTimeout = setTimeout(() => {
            elements.saveStatusIndicator?.classList.remove('visible', 'success', 'error', 'saving');
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
            } catch (error) {
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

function attemptAutoRelinkRecoveredDocuments({ notify = false } = {}) {
    const appContext = getAppContext();
    const missingDocuments = appContext.documentManager?.getMissingDocuments?.() ?? [];
    const loadedDocuments = (appContext.documentManager?.getAllDocuments?.() ?? []).filter((doc) => doc.loaded);
    let matchedCount = 0;

    missingDocuments.forEach((document) => {
        const loadedMatch = findLoadedDocumentMatch({
            document,
            loadedDocuments,
            documentManager: appContext.documentManager
        });

        if (!loadedMatch) {
            return;
        }

        appContext.highlightManager?.remapSourceIds?.(loadedMatch.id, document.id);
        appContext.cardSystem?.remapSourceIds?.(loadedMatch.id, document.id);
        appContext.cardSystem?.updateSourceNames?.(loadedMatch.id, loadedMatch.name);
        appContext.highlightManager?.updateSourceNames?.(loadedMatch.id, loadedMatch.name);
        appContext.documentManager?.unregisterDocument?.(document.id);
        matchedCount += 1;
    });

    if (matchedCount > 0) {
        renderFileList();
        appContext.annotationList?.refresh?.();
    }

    if (notify) {
        if (matchedCount > 0) {
            emitAppNotification({
                title: 'Auto Match Complete',
                message: `Automatically relinked ${matchedCount} restored source ${matchedCount === 1 ? 'file' : 'files'} using documents already loaded in the workspace.`,
                level: 'success',
                actions: [
                    { label: 'Validate', onClick: () => showRecoveryValidation() }
                ]
            });
        } else {
            emitAppNotification({
                title: 'Auto Match',
                message: 'No automatic relink candidates were found among the documents already loaded in this workspace.',
                level: 'warning',
                actions: [
                    { label: 'Import Sources', onClick: () => promptBulkRelink() }
                ]
            });
        }
    }

    return matchedCount;
}

function showRecoveryValidation() {
    const diagnostics = buildRecoveryDiagnostics(getAppContext());
    const unresolvedDocumentCount = diagnostics.missingDocuments.length;

    if (unresolvedDocumentCount === 0) {
    emitAppNotification({
        title: 'Links Ready',
        message: `All saved source documents are linked. ${diagnostics.readyCards} of ${diagnostics.totalCards} cards and ${diagnostics.readyHighlights} of ${diagnostics.totalHighlights} highlights are ready for source navigation.`,
        level: 'success',
        duration: 5200,
        actions: [
            { label: 'Validate Again', onClick: () => showRecoveryValidation() }
        ]
    });
        return;
    }

    emitAppNotification({
        title: 'Links Incomplete',
        message: `${unresolvedDocumentCount} source ${unresolvedDocumentCount === 1 ? 'file is' : 'files are'} still missing. ${diagnostics.readyCards} of ${diagnostics.totalCards} cards and ${diagnostics.readyHighlights} of ${diagnostics.totalHighlights} highlights are navigation-ready. Use the relink actions in the library to restore linked navigation.`,
        level: 'warning',
        duration: 6200,
        actions: [
            { label: 'Auto Match', onClick: () => attemptAutoRelinkRecoveredDocuments({ notify: true }) },
            { label: 'Import Sources', onClick: () => promptBulkRelink() }
        ]
    });
}

async function moveFileByOffset(fileId, offset) {
    const currentIndex = state.files.findIndex((file) => file.id === fileId);
    if (currentIndex < 0) {
        return;
    }

    const targetIndex = currentIndex + offset;
    if (targetIndex < 0 || targetIndex >= state.files.length) {
        return;
    }

    const [file] = state.files.splice(currentIndex, 1);
    state.files.splice(targetIndex, 0, file);
    renderFileList();
}

function moveFileToIndex(fileId, targetIndex) {
    state.files = reorderFilesById(state.files, fileId, targetIndex);
    renderFileList();
}

async function removeFileFromWorkspace(fileId) {
    const fileIndex = state.files.findIndex((file) => file.id === fileId);
    if (fileIndex < 0) {
        return;
    }

    const fileToRemove = state.files[fileIndex];
    const appContext = getAppContext();
    const { cardCount, highlightCount, referenceCount } = getDocumentReferenceDetails(fileId);
    const isCurrentDocument = appContext.currentBook?.id === fileId;
    const confirmed = window.confirm(buildDocumentRemovalPrompt({
        name: fileToRemove.name,
        cardCount,
        highlightCount,
        isCurrentDocument
    }));

    if (!confirmed) {
        return;
    }

    const [removedFile] = state.files.splice(fileIndex, 1);

    if (referenceCount > 0 || isCurrentDocument) {
        appContext.documentManager?.markDocumentLoaded?.(fileId, false);
    } else {
        appContext.documentManager?.unregisterDocument?.(fileId);
    }

    if (state.currentFile?.id === fileId) {
        const fallbackFile = state.files[fileIndex] || state.files[fileIndex - 1] || null;
        if (fallbackFile) {
            await openFile(fallbackFile);
        } else {
            clearLoadedFiles();
            renderFileList();
        }
    } else {
        renderFileList();
    }

    emitAppNotification({
        title: 'Document Removed',
        message: referenceCount > 0
            ? `"${removedFile.name}" was removed from the active library list. Linked cards and highlights were preserved and now need relinking before source navigation works again.`
            : `"${removedFile.name}" was removed from the active library list.`,
        level: 'success'
    });
}

function findCardByHighlightId(highlightId) {
    if (!highlightId) return null;
    return getCardsCollection().find((card) => card.highlightId === highlightId) ?? null;
}

function findCardById(cardId) {
    if (!cardId) return null;

    const cards = getAppContext().cardSystem?.cards;
    if (cards instanceof Map) {
        return cards.get(cardId) ?? null;
    }

    return cards?.[cardId] ?? null;
}

function findHighlightById(highlightId) {
    if (!highlightId) return null;
    return getAppContext().highlightManager?.highlights?.find((highlight) => highlight.id === highlightId) ?? null;
}

function destroyCurrentReader() {
    if (currentReader?.destroy) {
        currentReader.destroy();
    }
    currentReader = null;
    setAppService('pdfReader', null);
}

function resetReadingState() {
    state.currentPage = 1;
    state.totalPages = 0;
    updatePageInfo();
}

function updateToolbarSummary() {
    const title = state.currentFile?.name || 'No document open';
    elements.mobileDocSummary && (elements.mobileDocSummary.textContent = title);
    elements.docTitle && (elements.docTitle.textContent = title);
}

function setMobileToolbarExpanded(expanded) {
    elements.readerToolbar?.classList.toggle('mobile-tools-open', expanded);
    elements.readerContainer?.classList.toggle('mobile-tools-open', expanded);
    elements.toggleMobileToolsBtn?.classList.toggle('active', expanded);
    elements.toggleMobileToolsBtn?.setAttribute('aria-expanded', String(expanded));
}

function syncWorkspaceModeButtons(mode) {
    const modeMap = {
        reading: elements.workspaceModeReadingBtn,
        capture: elements.workspaceModeCaptureBtn,
        map: elements.workspaceModeMapBtn,
        mobileReading: elements.mobileWorkspaceModeReadingBtn,
        mobileCapture: elements.mobileWorkspaceModeCaptureBtn,
        mobileMap: elements.mobileWorkspaceModeMapBtn
    };

    Object.entries(modeMap).forEach(([key, button]) => {
        if (!button) return;
        const normalizedKey = key.replace(/^mobile/, '').toLowerCase();
        const active = normalizedKey === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });
}

function syncReaderLayoutAfterModeChange() {
    if (!currentReader) {
        return;
    }

    const relayout = () => {
        currentReader?.onLayoutChange?.({
            page: state.currentPage,
            totalPages: state.totalPages,
            workspaceMode: state.workspaceMode
        });
    };

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(relayout);
    });

    if (readerLayoutSyncTimeout) {
        clearTimeout(readerLayoutSyncTimeout);
    }

    readerLayoutSyncTimeout = window.setTimeout(() => {
        relayout();
    }, 260);
}

function setupFloatingSelectionToolbar() {
    const toolbar = elements.selectionModeFloating;
    const dragHandle = elements.selectionModeDragHandle;
    const wrapper = elements.readerContentWrapper;

    if (!toolbar || !dragHandle || !wrapper) {
        return;
    }

    const getLayoutKey = () => (document.body.classList.contains('mobile-layout') ? 'mobile' : 'desktop');

    const clearToolbarInlinePosition = () => {
        toolbar.style.left = '';
        toolbar.style.top = '';
        toolbar.style.right = '';
        toolbar.style.bottom = '';
        toolbar.style.transform = '';
    };

    const clampToolbarPosition = (x, y) => {
        const wrapperRect = wrapper.getBoundingClientRect();
        const toolbarRect = toolbar.getBoundingClientRect();
        const maxX = Math.max(12, wrapperRect.width - toolbarRect.width - 12);
        const maxY = Math.max(12, wrapperRect.height - toolbarRect.height - 12);

        return {
            x: Math.min(Math.max(12, x), maxX),
            y: Math.min(Math.max(12, y), maxY)
        };
    };

    const applyStoredToolbarPosition = () => {
        const layoutKey = getLayoutKey();
        const storedPosition = selectionToolbarPositions[layoutKey];

        if (!storedPosition) {
            clearToolbarInlinePosition();
            return;
        }

        const nextPosition = clampToolbarPosition(storedPosition.x, storedPosition.y);
        toolbar.style.left = `${nextPosition.x}px`;
        toolbar.style.top = `${nextPosition.y}px`;
        toolbar.style.right = 'auto';
        toolbar.style.bottom = 'auto';
        toolbar.style.transform = 'none';
        selectionToolbarPositions[layoutKey] = nextPosition;
    };

    let dragSession = null;

    const stopDrag = () => {
        if (!dragSession) {
            return;
        }

        toolbar.classList.remove('dragging');
        dragSession = null;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', stopDrag);
        window.removeEventListener('pointercancel', stopDrag);
    };

    function handlePointerMove(event) {
        if (!dragSession) {
            return;
        }

        const proposedX = event.clientX - dragSession.wrapperLeft - dragSession.offsetX;
        const proposedY = event.clientY - dragSession.wrapperTop - dragSession.offsetY;
        const nextPosition = clampToolbarPosition(proposedX, proposedY);

        toolbar.style.left = `${nextPosition.x}px`;
        toolbar.style.top = `${nextPosition.y}px`;
        toolbar.style.right = 'auto';
        toolbar.style.bottom = 'auto';
        toolbar.style.transform = 'none';
        selectionToolbarPositions[dragSession.layoutKey] = nextPosition;
    }

    const startDrag = (event) => {
        event.preventDefault();

        const wrapperRect = wrapper.getBoundingClientRect();
        const toolbarRect = toolbar.getBoundingClientRect();
        dragSession = {
            layoutKey: getLayoutKey(),
            offsetX: event.clientX - toolbarRect.left,
            offsetY: event.clientY - toolbarRect.top,
            wrapperLeft: wrapperRect.left,
            wrapperTop: wrapperRect.top
        };

        toolbar.classList.add('dragging');
        dragHandle.setPointerCapture?.(event.pointerId);
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopDrag);
        window.addEventListener('pointercancel', stopDrag);
    };

    dragHandle.addEventListener('pointerdown', startDrag);

    registerCleanup(() => {
        dragHandle.removeEventListener('pointerdown', startDrag);
        stopDrag();
    });

    registerCleanup(registerEventListeners([
        {
            target: window,
            event: 'resize',
            handler: () => window.requestAnimationFrame(applyStoredToolbarPosition)
        }
    ]));

    window.requestAnimationFrame(applyStoredToolbarPosition);
    setAppService('refreshFloatingToolbarPosition', () => window.requestAnimationFrame(applyStoredToolbarPosition));
}

function applyWorkspaceLayout(mode) {
    document.body.dataset.workspaceMode = mode;
    state.workspaceMode = mode;
    syncWorkspaceModeButtons(mode);

    if (!splitView) {
        return;
    }

    const isMobile = document.body.classList.contains('mobile-layout');
    const isCompact = splitView.isCompactLayout();

    if (mode === 'reading') {
        outlineSidebar?.close();
        if (isMobile || isCompact) {
            splitView.closeAll();
        } else {
            splitView.setLeftCollapsed(false);
            splitView.setRightCollapsed(true);
            splitView.setPanelWidth('left', 292);
        }
        setMobileNotesView('annotations');
    }

    if (mode === 'capture') {
        if (isMobile || isCompact) {
            splitView.setRightCollapsed(true);
            splitView.setLeftCollapsed(true);
            setMobileNotesView('annotations');
        } else {
            splitView.setLeftCollapsed(true);
            splitView.setRightCollapsed(false);
            splitView.setPanelWidth('right', CAPTURE_NOTES_FOCUS_WIDTH);
        }
    }

    if (mode === 'map') {
        if (isMobile || isCompact) {
            splitView.setRightCollapsed(false);
            splitView.setLeftCollapsed(true);
            setMobileNotesView('mindmap');
        } else {
            splitView.setLeftCollapsed(true);
            splitView.setRightCollapsed(false);
            splitView.setPanelWidth('right', getMapNotesFocusWidth());
        }
    }

    updatePanelControls();
    syncReaderLayoutAfterModeChange();
    getAppContext().refreshFloatingToolbarPosition?.();
}

function setWorkspaceMode(mode, options = {}) {
    const nextMode = ['reading', 'capture', 'map'].includes(mode) ? mode : 'reading';
    if (state.workspaceMode === nextMode && !options.force) {
        return;
    }

    applyWorkspaceLayout(nextMode);
}

function isCompactLayout() {
    return splitView?.isCompactLayout() ?? window.innerWidth <= 820;
}

function updatePanelControls() {
    const sidebarOpen = splitView ? !splitView.isLeftCollapsed() : false;
    const notesOpen = splitView ? !splitView.isRightCollapsed() : false;
    const outlineOpen = outlineSidebar?.isOpen() ?? false;
    const isTablet = document.body.classList.contains('tablet-layout');

    elements.toggleSidebarBtn?.classList.toggle('active', sidebarOpen);
    elements.toggleNotesBtn?.classList.toggle('active', notesOpen);
    elements.toggleOutlineBtn?.classList.toggle('active', outlineOpen);
    elements.sidebarWidthPresetBtn?.classList.toggle('hidden', !isTablet);
    elements.notesWidthPresetBtn?.classList.toggle('hidden', !isTablet);
    elements.toolbarSidebarWidthPresetBtn?.classList.toggle('hidden', !isTablet);
    elements.toolbarNotesWidthPresetBtn?.classList.toggle('hidden', !isTablet);

    const backdropVisible = isCompactLayout() && (sidebarOpen || notesOpen);
    elements.panelBackdrop?.classList.toggle('visible', backdropVisible);
    document.body.classList.toggle('has-overlay-panel', backdropVisible);
}

function closeCompactPanels() {
    if (!isCompactLayout()) return;
    splitView?.closeAll();
    outlineSidebar?.close();
    updatePanelControls();
}

function resetAuxiliaryPanels() {
    outlineSidebar?.reset();
    document.getElementById('highlighter-panel')?.classList.remove('visible');
}

function setupResponsiveLayout() {
    registerCleanup(registerEventListeners([
        {
            target: elements.panelBackdrop,
            event: 'click',
            handler: () => {
                closeCompactPanels();
            }
        },
        { target: window, event: 'layout-panel-toggled', handler: updatePanelControls },
        { target: window, event: 'outline-visibility-changed', handler: updatePanelControls },
        {
            target: window,
            event: 'resize',
            handler: () => {
                if (!document.body.classList.contains('mobile-layout')) {
                    setMobileToolbarExpanded(false);
                }
                updatePanelControls();
            }
        }
    ].filter(({ target }) => target)));

    updatePanelControls();
}

// Initialization
async function init() {

    try {
        ensureProjectIdentity();
        const runtimeStorageInfo = await getRuntimeStorageInfo().catch(() => null);
        if (runtimeStorageInfo) {
            setAppService('runtimeStorageInfo', runtimeStorageInfo);
        }

        loadFilesFromStorage();
        updateToolbarSummary();

        // Init Mindmap or Drawnix
        const mindmapContainer = document.getElementById('mindmap-container');
        if (mindmapContainer) {
            await createDrawnixView(mindmapContainer);
        }

        // Init SplitView BEFORE setupEventListeners
        splitView = new SplitView({
            leftId: 'sidebar',
            centerId: 'reader-container',
            rightId: 'notes-panel',
            resizerLeftId: 'resizer-left',
            resizerRightId: 'resizer-right'
        });

        // Init Outline Sidebar
        outlineSidebar = new OutlineSidebar('outline-sidebar', 'outline-content', 'toggle-outline');
        setAppService('outlineSidebar', outlineSidebar);

        // Init Annotation List
        annotationList = new AnnotationList('annotation-list', getAppContext().cardSystem);
        setAppService('annotationList', annotationList);

        // Setup event listeners AFTER SplitView is initialized
        setupEventListeners();
        getAppContext().syncToolMode?.(currentToolMode);

        // Setup Layout Toggles (incl. Annotations)
        setupLayoutToggles();
        setupResponsiveLayout();
        setupFloatingSelectionToolbar();
        registerCleanup(mountAppNotifications(elements.appNotifications));
        restartProjectAutosave();
        setWorkspaceMode('reading', { force: true });
        await restoreRuntimeWorkspace();

        // Listen for live page restore events (from History Manager recovery)
        registerCleanup(registerEventListeners([
            {
                target: window,
                event: 'restore-page-position',
                handler: (e) => {
                    const page = e.detail.page;
                    if (page && currentReader && page > 1) {
                        logger.debug('Received restore-page-position event. Jumping to', page);
                        currentReader.scrollToPage(page);
                    }
                }
            }
        ]));

    } catch (e) {
        logger.error('Error opening file', e);
        // showToast('无法打开文件: ' + e.message);
    }
}

function setupLayoutToggles() {
    // Annotation List Toggle
    const toggleAnnotationsBtn = document.getElementById('toggle-annotations');
    const annotationListContainer = document.getElementById('annotation-list');
    const showAnnotationsBtn = document.getElementById('show-annotations');
    const showMindmapBtn = document.getElementById('show-mindmap');

    setMobileNotesView = (view) => {
        const nextView = view === 'mindmap' ? 'mindmap' : 'annotations';
        document.body.dataset.notesView = nextView;
        showAnnotationsBtn?.classList.toggle('active', nextView === 'annotations');
        showAnnotationsBtn?.setAttribute('aria-selected', String(nextView === 'annotations'));
        showMindmapBtn?.classList.toggle('active', nextView === 'mindmap');
        showMindmapBtn?.setAttribute('aria-selected', String(nextView === 'mindmap'));
    };

    const syncNotesLayoutMode = () => {
        if (document.body.classList.contains('mobile-layout')) {
            annotationListContainer?.classList.remove('collapsed');
            toggleAnnotationsBtn?.classList.add('active');
            setMobileNotesView(document.body.dataset.notesView || 'annotations');
            return;
        }

        delete document.body.dataset.notesView;
        showAnnotationsBtn?.classList.remove('active');
        showAnnotationsBtn?.setAttribute('aria-selected', 'false');
        showMindmapBtn?.classList.remove('active');
        showMindmapBtn?.setAttribute('aria-selected', 'false');
    };

    if (toggleAnnotationsBtn && annotationListContainer) {
        registerCleanup(registerEventListeners([
            {
                target: toggleAnnotationsBtn,
                event: 'click',
                handler: () => {
                    if (document.body.classList.contains('mobile-layout')) {
                        setMobileNotesView('annotations');
                        return;
                    }

                    const isCollapsed = annotationListContainer.classList.toggle('collapsed');
                    toggleAnnotationsBtn.classList.toggle('active', !isCollapsed);
                }
            }
        ]));
    }

    registerCleanup(registerEventListeners([
        {
            target: showAnnotationsBtn,
            event: 'click',
            handler: () => {
                setMobileNotesView('annotations');
                setWorkspaceMode('capture');
            }
        },
        {
            target: showMindmapBtn,
            event: 'click',
            handler: () => {
                setMobileNotesView('mindmap');
                setWorkspaceMode('map');
            }
        },
        {
            target: window,
            event: 'resize',
            handler: syncNotesLayoutMode
        }
    ].filter(({ target }) => target)));

    syncNotesLayoutMode();

    // Sidebar Toggles (Existing)
    if (elements.toggleSidebarBtn) {
        registerCleanup(registerEventListeners([
            {
                target: elements.toggleSidebarBtn,
                event: 'click',
                handler: () => {
                    if (splitView) splitView.toggleLeft();
                    setWorkspaceMode('reading');
                }
            }
        ]));
    }

    if (elements.closeSidebarPanelBtn) {
        registerCleanup(registerEventListeners([
            {
                target: elements.closeSidebarPanelBtn,
                event: 'click',
                handler: () => {
                    splitView?.setLeftCollapsed(true);
                    updatePanelControls();
                }
            }
        ]));
    }

    if (elements.toggleNotesBtn) {
        registerCleanup(registerEventListeners([
            {
                target: elements.toggleNotesBtn,
                event: 'click',
                handler: () => {
                    if (splitView) splitView.toggleRight();
                    setWorkspaceMode('capture');
                }
            }
        ]));
    }

    if (elements.closeNotesPanelBtn) {
        registerCleanup(registerEventListeners([
            {
                target: elements.closeNotesPanelBtn,
                event: 'click',
                handler: () => {
                    splitView?.setRightCollapsed(true);
                    setMobileToolbarExpanded(false);
                    updatePanelControls();
                }
            }
        ]));
    }

    if (elements.closeOutlinePanelBtn) {
        registerCleanup(registerEventListeners([
            {
                target: elements.closeOutlinePanelBtn,
                event: 'click',
                handler: () => {
                    outlineSidebar?.close();
                    updatePanelControls();
                }
            }
        ]));
    }

    registerCleanup(registerEventListeners([
        elements.sidebarWidthPresetBtn && {
            target: elements.sidebarWidthPresetBtn,
            event: 'click',
            handler: () => splitView?.cyclePanelPreset('left')
        },
        elements.toolbarSidebarWidthPresetBtn && {
            target: elements.toolbarSidebarWidthPresetBtn,
            event: 'click',
            handler: () => splitView?.cyclePanelPreset('left')
        },
        elements.notesWidthPresetBtn && {
            target: elements.notesWidthPresetBtn,
            event: 'click',
            handler: () => splitView?.cyclePanelPreset('right')
        },
        elements.toolbarNotesWidthPresetBtn && {
            target: elements.toolbarNotesWidthPresetBtn,
            event: 'click',
            handler: () => splitView?.cyclePanelPreset('right')
        }
    ].filter(Boolean)));

    if (elements.toggleMobileToolsBtn) {
        registerCleanup(registerEventListeners([
            {
                target: elements.toggleMobileToolsBtn,
                event: 'click',
                handler: () => {
                    const nextExpanded = !elements.readerToolbar?.classList.contains('mobile-tools-open');
                    setMobileToolbarExpanded(nextExpanded);
                }
            },
            {
                target: document,
                event: 'click',
                handler: (e) => {
                    if (!document.body.classList.contains('mobile-layout')) {
                        return;
                    }

                    if (!elements.readerToolbar?.contains(e.target)) {
                        setMobileToolbarExpanded(false);
                    }
                }
            }
        ]));
    }

    registerCleanup(registerEventListeners([
        elements.workspaceModeReadingBtn && {
            target: elements.workspaceModeReadingBtn,
            event: 'click',
            handler: () => setWorkspaceMode('reading')
        },
        elements.workspaceModeCaptureBtn && {
            target: elements.workspaceModeCaptureBtn,
            event: 'click',
            handler: () => setWorkspaceMode('capture')
        },
        elements.workspaceModeMapBtn && {
            target: elements.workspaceModeMapBtn,
            event: 'click',
            handler: () => setWorkspaceMode('map')
        },
        elements.mobileWorkspaceModeReadingBtn && {
            target: elements.mobileWorkspaceModeReadingBtn,
            event: 'click',
            handler: () => setWorkspaceMode('reading')
        },
        elements.mobileWorkspaceModeCaptureBtn && {
            target: elements.mobileWorkspaceModeCaptureBtn,
            event: 'click',
            handler: () => setWorkspaceMode('capture')
        },
        elements.mobileWorkspaceModeMapBtn && {
            target: elements.mobileWorkspaceModeMapBtn,
            event: 'click',
            handler: () => setWorkspaceMode('map')
        }
    ].filter(Boolean)));
}


function setupEventListeners() {
    // File Import
    registerCleanup(registerEventListeners([
        { target: elements.fileInput, event: 'change', handler: handleFileSelect },
        { target: elements.toolbarImportDocumentsBtn, event: 'click', handler: promptImportDocument },
        { target: elements.toolbarOpenProjectBtn, event: 'click', handler: () => void promptOpenProject() },
        { target: elements.toolbarSaveProjectBtn, event: 'click', handler: () => void promptSaveProject() },
        { target: elements.mobileImportDocumentsBtn, event: 'click', handler: promptImportDocument },
        { target: elements.mobileOpenProjectBtn, event: 'click', handler: () => void promptOpenProject() },
        { target: elements.mobileSaveProjectBtn, event: 'click', handler: () => void promptSaveProject() },
        { target: elements.emptyImportDocumentBtn, event: 'click', handler: promptImportDocument },
        { target: elements.emptyOpenProjectBtn, event: 'click', handler: () => void promptOpenProject() },
        { target: elements.prevBtn, event: 'click', handler: () => currentReader?.onPrevPage() },
        { target: elements.nextBtn, event: 'click', handler: () => currentReader?.onNextPage() },
        { target: elements.mobilePrevBtn, event: 'click', handler: () => currentReader?.onPrevPage() },
        { target: elements.mobileNextBtn, event: 'click', handler: () => currentReader?.onNextPage() },
        {
            target: window,
            event: 'add-card-to-board',
            handler: () => setWorkspaceMode('map')
        },
        {
            target: window,
            event: 'document-registered',
            handler: () => {
                attemptAutoRelinkRecoveredDocuments();
                renderFileList();
            }
        },
        {
            target: window,
            event: 'document-loaded-changed',
            handler: () => {
                attemptAutoRelinkRecoveredDocuments();
                renderFileList();
            }
        },
        {
            target: window,
            event: 'documents-restored',
            handler: () => {
                attemptAutoRelinkRecoveredDocuments();
                renderFileList();
            }
        },
        {
            target: window,
            event: 'recovery-validate-requested',
            handler: () => {
                showRecoveryValidation();
            }
        },
        {
            target: window,
            event: 'project-save-completed',
            handler: (event) => {
                projectStatusState.lastSavedAt = event.detail?.savedAt || Date.now();
                projectStatusState.lastMode = event.detail?.mode || projectStatusState.lastMode;
                if (getAppContext().currentProjectId) {
                    setRuntimeProjectId(getAppContext().currentProjectId, localStorage);
                }
                showSaveStatus('success', `Saved at ${formatAutosaveTime(projectStatusState.lastSavedAt)}.`);
            }
        },
        {
            target: window,
            event: 'project-opened',
            handler: (event) => {
                projectStatusState.lastMode = event.detail?.mode || projectStatusState.lastMode;
                if (getAppContext().currentProjectId) {
                    setRuntimeProjectId(getAppContext().currentProjectId, localStorage);
                }
                showSaveStatus('success', 'Project opened and synced to the current workspace.', 1800);
            }
        },
        {
            target: elements.fileList,
            event: 'click',
            handler: (event) => {
                const handled = handleRecoveryPanelClick(event, {
                    onRelinkDocument: (documentId) => promptRelinkDocument(documentId),
                    onRecoveryAction: (action) => {
                        if (action === 'auto') {
                            attemptAutoRelinkRecoveredDocuments({ notify: true });
                        }
                        if (action === 'bulk') {
                            promptBulkRelink();
                        }
                        if (action === 'validate') {
                            showRecoveryValidation();
                        }
                    }
                });
                if (handled) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }

                const actionButton = event.target.closest('[data-file-action]');
                if (actionButton) {
                    event.preventDefault();
                    event.stopPropagation();
                    const fileId = actionButton.getAttribute('data-file-id');
                    const action = actionButton.getAttribute('data-file-action');

                    if (!fileId || !action) {
                        return;
                    }

                    if (action === 'move-up') {
                        void moveFileByOffset(fileId, -1);
                    } else if (action === 'move-down') {
                        void moveFileByOffset(fileId, 1);
                    } else if (action === 'remove') {
                        void removeFileFromWorkspace(fileId);
                    }
                    return;
                }

                const projectActionButton = event.target.closest('[data-project-action]');
                if (projectActionButton) {
                    event.preventDefault();
                    event.stopPropagation();
                    const action = projectActionButton.getAttribute('data-project-action');

                    if (action === 'open') {
                        void promptOpenProject();
                    } else if (action === 'save') {
                        void promptSaveProject();
                    } else if (action === 'import') {
                        promptImportDocument();
                    }
                    return;
                }

                const fileItem = event.target.closest('[data-open-file-id]');
                if (fileItem) {
                    const fileId = fileItem.getAttribute('data-open-file-id');
                    if (fileId) {
                        window.openFileById(fileId);
                    }
                }
            }
        },
        {
            target: elements.fileList,
            event: 'dragstart',
            handler: (event) => {
                const item = event.target.closest('[data-open-file-id]');
                if (!item || item.classList.contains('disabled')) {
                    return;
                }

                draggedFileId = item.getAttribute('data-open-file-id');
                item.classList.add('dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', draggedFileId || '');
            }
        },
        {
            target: elements.fileList,
            event: 'dragover',
            handler: (event) => {
                const targetItem = event.target.closest('[data-open-file-id]');
                if (!draggedFileId || !targetItem) {
                    return;
                }

                event.preventDefault();
                const targetFileId = targetItem.getAttribute('data-open-file-id');
                if (!targetFileId || targetFileId === draggedFileId) {
                    return;
                }

                elements.fileList.querySelectorAll('.file-item.drop-target').forEach((item) => {
                    item.classList.remove('drop-target');
                });
                targetItem.classList.add('drop-target');
                event.dataTransfer.dropEffect = 'move';
            }
        },
        {
            target: elements.fileList,
            event: 'drop',
            handler: (event) => {
                const targetItem = event.target.closest('[data-open-file-id]');
                if (!draggedFileId || !targetItem) {
                    return;
                }

                event.preventDefault();
                const targetFileId = targetItem.getAttribute('data-open-file-id');
                if (!targetFileId || targetFileId === draggedFileId) {
                    return;
                }

                const targetIndex = state.files.findIndex((file) => file.id === targetFileId);
                if (targetIndex >= 0) {
                    moveFileToIndex(draggedFileId, targetIndex);
                }
            }
        },
        {
            target: elements.fileList,
            event: 'dragend',
            handler: () => {
                draggedFileId = null;
                elements.fileList.querySelectorAll('.file-item.dragging, .file-item.drop-target').forEach((item) => {
                    item.classList.remove('dragging', 'drop-target');
                });
            }
        },
        {
            target: window,
            event: 'jump-to-source',
            handler: (e) => {
                const { sourceId, highlightId } = e.detail;
                handleJumpToSource(sourceId, highlightId);
                closeCompactPanels();
            }
        }
    ].filter(({ target }) => target)));

    const highlighterPanel = document.getElementById('highlighter-panel');
    registerCleanup(setupSelectionSync({
        findCardById,
        findCardByHighlightId,
        isCompactLayout,
        collapseNotesPanel: () => {
            splitView?.setRightCollapsed(true);
            updatePanelControls();
        }
    }));

    // Layout Toggles moved to setupLayoutToggles()

    // Selection mode toggle buttons
    const panModeBtn = document.getElementById('pan-mode');
    const textModeBtn = document.getElementById('text-mode');
    const rectModeBtn = document.getElementById('rect-mode');
    const ellipseModeBtn = document.getElementById('ellipse-mode');
    const highlighterModeBtn = document.getElementById('highlighter-mode');
    const isCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches;

    const modeButtons = [panModeBtn, textModeBtn, rectModeBtn, ellipseModeBtn, highlighterModeBtn].filter(Boolean);

    const syncModeButtons = (mode) => {
        currentToolMode = mode;
        modeButtons.forEach(btn => btn.classList.remove('active'));
        const modeMap = {
            pan: panModeBtn,
            text: textModeBtn,
            rectangle: rectModeBtn,
            rect: rectModeBtn,
            ellipse: ellipseModeBtn,
            highlighter: highlighterModeBtn
        };
        modeMap[mode]?.classList.add('active');
    };

    const positionHighlighterPanel = () => {
        if (!highlighterModeBtn || !highlighterPanel) return;

        highlighterPanel.classList.add('visible');
        void highlighterPanel.offsetHeight;
        const btnRect = highlighterModeBtn.getBoundingClientRect();
        const offsetParent = highlighterPanel.offsetParent || document.body;
        const containerRect = offsetParent.getBoundingClientRect();
        const panelWidth = 220;
        let left = (btnRect.left - containerRect.left) + (btnRect.width / 2) - (panelWidth / 2);
        const containerWidth = containerRect.width;
        if (left < 10) left = 10;
        if (left + panelWidth > containerWidth - 10) left = containerWidth - panelWidth - 10;
        const top = (btnRect.bottom - containerRect.top) + 12;
        highlighterPanel.style.top = `${top}px`;
        highlighterPanel.style.left = `${left}px`;
        highlighterPanel.style.transform = 'translateX(0)';
    };

    const setActiveMode = (mode, options = {}) => {
        if (currentReader && currentReader.setSelectionMode) {
            currentReader.setSelectionMode(mode);
            syncModeButtons(mode);

            if (mode === 'highlighter' && options.showHighlighterPanel) {
                positionHighlighterPanel();
            } else if (mode !== 'highlighter') {
                highlighterPanel?.classList.remove('visible');
            }

            if (document.body.classList.contains('mobile-layout') && mode !== 'highlighter') {
                setMobileToolbarExpanded(false);
            }
        }
    };

    setAppService('setToolMode', (mode, options = {}) => setActiveMode(mode, options));
    setAppService('syncToolMode', (mode) => syncModeButtons(mode));

    registerCleanup(registerEventListeners([
        panModeBtn && { target: panModeBtn, event: 'click', handler: () => setActiveMode('pan') },
        textModeBtn && { target: textModeBtn, event: 'click', handler: () => setActiveMode('text') },
        rectModeBtn && { target: rectModeBtn, event: 'click', handler: () => setActiveMode('rectangle') },
        ellipseModeBtn && { target: ellipseModeBtn, event: 'click', handler: () => setActiveMode('ellipse') },
        highlighterModeBtn && highlighterPanel && {
            target: highlighterModeBtn,
            event: 'click',
            handler: () => {
                // Toggle panel if already active (for mobile/tablet where no hover)
                if (highlighterModeBtn.classList.contains('active')) {
                    const isVisible = highlighterPanel.classList.contains('visible');
                    if (isVisible) {
                        highlighterPanel.classList.remove('visible');
                    } else {
                        positionHighlighterPanel();
                    }
                } else {
                    setActiveMode('highlighter', { showHighlighterPanel: isCoarsePointer() });
                }
            }
        }
    ].filter(Boolean)));

    // Highlighter Height Control Panel
    const heightSlider = document.getElementById('highlighter-height');

    if (highlighterModeBtn && highlighterPanel) {
        let isDragging = false;
        let startY = 0;
        let startHeight = 16;
        let clickThreshold = 5;

        const startDrag = (y) => {
            isDragging = false;
            startY = y;
            if (currentReader && currentReader.highlighterTool) {
                startHeight = currentReader.highlighterTool.height;
            } else if (heightSlider) {
                startHeight = parseInt(heightSlider.value) || 16;
            }
        };

        const onMove = (y) => {
            const deltaY = startY - y;
            if (Math.abs(deltaY) > clickThreshold) isDragging = true;
            if (isDragging) {
                let newHeight = startHeight + deltaY;
                newHeight = Math.max(8, Math.min(48, newHeight));
                if (heightSlider) heightSlider.value = newHeight;
                if (currentReader && currentReader.highlighterTool) {
                    currentReader.highlighterTool.setHeight(newHeight);
                }
            }
        };

        const cleanupPointerDrag = registerEventListeners([
            {
                target: highlighterModeBtn,
                event: 'mouseenter',
                handler: () => {
                    if (highlighterModeBtn.classList.contains('active') && !isCoarsePointer()) {
                        positionHighlighterPanel();
                    }
                }
            }
        ]);

        const onMouseMove = (e) => {
            onMove(e.clientY);
        };

        const onTouchMove = (e) => {
            if (e.cancelable) e.preventDefault();
            onMove(e.touches[0].clientY);
        };

        const onMouseUp = () => {
            pointerCleanup?.();
            pointerCleanup = null;
        };

        const onTouchEnd = () => {
            pointerCleanup?.();
            pointerCleanup = null;
        };

        let pointerCleanup = null;
        const handleMouseDown = (e) => {
            startDrag(e.clientY);
            pointerCleanup?.();
            pointerCleanup = registerEventListeners([
                { target: document, event: 'mousemove', handler: onMouseMove },
                { target: document, event: 'mouseup', handler: onMouseUp }
            ]);
        };
        registerCleanup(() => pointerCleanup?.());

        if (heightSlider) {
            registerCleanup(registerEventListeners([
                {
                    target: heightSlider,
                    event: 'input',
                    handler: (e) => {
                        const newHeight = parseInt(e.target.value);
                        if (currentReader && currentReader.highlighterTool) {
                            currentReader.highlighterTool.setHeight(newHeight);
                        }
                    }
                }
            ]));
        }

        registerCleanup(() => {
            cleanupPointerDrag();
            pointerCleanup?.();
        });

        registerCleanup(registerEventListeners([
            { target: highlighterModeBtn, event: 'mousedown', handler: handleMouseDown },
            {
                target: document,
                event: 'click',
                handler: (e) => {
                    const clickedInsideButton = highlighterModeBtn.contains(e.target);
                    if (!highlighterPanel.contains(e.target) && !clickedInsideButton) {
                        highlighterPanel.classList.remove('visible');
                    }
                }
            }
        ]));
    }

    // Auto-layout button
    const layoutBtn = document.getElementById('layout-btn');
    const mindmapContainer = document.getElementById('mindmap-container');
    if (layoutBtn) {
        registerCleanup(registerEventListeners([
            {
                target: layoutBtn,
                event: 'click',
                handler: () => {
                    setWorkspaceMode('map');
                    if (window.applyAutoLayout) {
                        window.applyAutoLayout();
                    } else {
                        logger.warn('Auto-layout function not available yet');
                    }
                }
            }
        ]));
    }

    if (mindmapContainer) {
        registerCleanup(registerEventListeners([
            {
                target: mindmapContainer,
                event: 'pointerdown',
                handler: () => setWorkspaceMode('map')
            }
        ]));
    }
}

// File Handling
async function importFiles(files, { openImportedFile = true } = {}) {
    const appContext = getAppContext();
    if (!appContext.currentProjectId) {
        const { projectId } = ensureProjectIdentity();
        setRuntimeProjectId(projectId, localStorage);
    }
    const pendingDocumentImport = appContext.pendingDocumentImport;
    const reservedIds = new Set();
    const importedFileData = [];

    for (const file of files) {
        const targetDocument = chooseDocumentTarget({
            file,
            pendingDocumentImport: pendingDocumentImport?.id ? pendingDocumentImport : null,
            documentManager: appContext.documentManager,
            reservedIds
        });

        if (pendingDocumentImport?.id && !targetDocument) {
            emitAppNotification({
                title: 'Relink Skipped',
                message: `"${file.name}" does not match the expected file type for "${pendingDocumentImport.name}". Please choose a compatible source file.`,
                level: 'warning'
            });
            break;
        }

        const fileSignature = `${file.name}-${file.size}-${file.lastModified}`;
        const fileId = targetDocument?.id || await generateHash(fileSignature);

        if (targetDocument?.id) {
            reservedIds.add(targetDocument.id);
        }

        const fileData = {
            id: fileId,
            name: file.name,
            type: file.type,
            lastModified: file.lastModified,
            fileObj: file,
            restoredDocumentId: targetDocument?.id || null
        };

        const existingIndex = state.files.findIndex((item) => item.id === fileId);
        if (existingIndex >= 0) {
            state.files[existingIndex] = fileData;
        } else {
            state.files.push(fileData);
        }

        if (appContext.documentManager) {
            appContext.documentManager.registerDocument(
                fileId,
                file.name,
                file.type,
                true
            );
        }

        appContext.cardSystem?.updateSourceNames?.(fileId, file.name);
        appContext.highlightManager?.updateSourceNames?.(fileId, file.name);
        importedFileData.push(fileData);

        if (pendingDocumentImport?.id) {
            break;
        }
    }

    setAppService('pendingDocumentImport', null);
    renderFileList();

    if (!importedFileData.length) {
        return [];
    }

    if (openImportedFile) {
        await openFile(importedFileData[0]);
    }

    void performProjectAutosave({ notify: false });

    return importedFileData;
}

async function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) {
        return;
    }

    const pendingDocumentImport = getAppContext().pendingDocumentImport;
    const openImportedFile = !(pendingDocumentImport?.mode === 'bulk' || files.length > 1);
    await importFiles(files, { openImportedFile });
    elements.fileInput.value = '';
}

// Simple hash function for deterministic IDs
async function generateHash(message) {
    if (window.crypto && window.crypto.subtle) {
        try {
            const msgBuffer = new TextEncoder().encode(message);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex.substring(0, 32);
        } catch (e) {
            logger.warn('Crypto API failed, falling back', e);
        }
    }

    // Fallback for insecure contexts (e.g. HTTP IP access)
    // Simple non-cryptographic hash (DJB2 variant)
    let hash = 5381;
    for (let i = 0; i < message.length; i++) {
        hash = ((hash << 5) + hash) + message.charCodeAt(i); /* hash * 33 + c */
    }
    // Convert to hex and pad/trim to look similar to SHA-256 frag
    const hashHex = (hash >>> 0).toString(16).padStart(8, '0');
    // Extend a bit to mimic ID length if needed, or just return short unique ID
    // Since we need consistent IDs, we'll just append length + first/last chars code
    const suffix = message.length.toString(16) + (message.charCodeAt(0) || 0).toString(16);
    return (hashHex + suffix).padEnd(32, '0').substring(0, 32);
}

function renderFileList() {
    const visibleDocuments = getVisibleDocuments();
    const diagnostics = buildRecoveryDiagnostics(getAppContext());
    const missingDocuments = diagnostics.missingDocuments;
    const projectStatus = getProjectStatus();

    const projectPanelMarkup = `
        <section class="library-project-panel" aria-label="Project actions">
          <div class="library-project-header">
            <span class="material-icons-round">folder_managed</span>
            <div class="library-project-copy">
              <strong>${projectStatus.title}</strong>
              <p>${projectStatus.description}</p>
            </div>
          </div>
          <div class="library-project-meta">
            <span>${projectStatus.summary}</span>
            <span>${projectStatus.linkedToDirectory ? 'Local export linked' : 'Server workspace autosave'}</span>
            ${projectStatus.projectDirectoryName ? `<span title="${escapeHtml(projectStatus.projectDirectoryName)}">${escapeHtml(projectStatus.projectDirectoryName)}</span>` : ''}
            ${projectStatus.runtimeRoot ? `<span title="${escapeHtml(projectStatus.runtimeRoot)}">runtime-data</span>` : ''}
          </div>
          <div class="library-project-actions">
            <button type="button" class="library-project-btn primary" data-project-action="open">Open Project Folder</button>
            <button type="button" class="library-project-btn" data-project-action="save">Save Project Folder</button>
            <button type="button" class="library-project-btn" data-project-action="import">Import Documents</button>
          </div>
        </section>
    `;

    if (!visibleDocuments.length) {
        elements.fileList.innerHTML = `
            ${projectPanelMarkup}
            <div class="library-empty-state">
              <span class="material-icons-round">upload_file</span>
              <h3>Your library is empty</h3>
              <p>Import reading sources or open a saved project folder to get started.</p>
            </div>
        `;
        return;
    }

    const recoveryMarkup = missingDocuments.length ? `
        <section class="library-recovery-panel" aria-label="Missing source files">
          <div class="library-recovery-header">
            <span class="material-icons-round">link_off</span>
            <div class="library-recovery-copy">
              <strong>${missingDocuments.length} source ${missingDocuments.length === 1 ? 'file is' : 'files are'} waiting to be relinked</strong>
              <p>Re-import the original documents to restore jump-back navigation from the mind map.</p>
            </div>
          </div>
          <div class="library-recovery-stats">
            <span>${diagnostics.unresolvedCards.length} cards</span>
            <span>${diagnostics.unresolvedHighlights.length} highlights</span>
            <span>${diagnostics.totalDocuments} saved docs</span>
          </div>
          <div class="library-recovery-actions">
            <button type="button" class="library-recovery-secondary-btn" data-recovery-action="auto">Auto match</button>
            <button type="button" class="library-recovery-secondary-btn" data-recovery-action="bulk">Import sources</button>
            <button type="button" class="library-recovery-secondary-btn" data-recovery-action="validate">Validate links</button>
          </div>
          <div class="library-recovery-list">
            ${missingDocuments.map((doc) => `
              <div class="library-recovery-item">
                <div class="library-recovery-item-copy">
                  <span class="library-recovery-name">${escapeHtml(doc.name)}</span>
                  <span class="library-recovery-meta">${escapeHtml(doc.type || 'Unknown file type')}</span>
                </div>
                <button type="button" class="library-recovery-btn" data-relink-document-id="${escapeHtml(doc.id)}">Relink</button>
              </div>
            `).join('')}
          </div>
        </section>
    ` : '';

    elements.fileList.innerHTML = `
        ${projectPanelMarkup}
        ${recoveryMarkup}
        ${visibleDocuments.map((file, index) => `
        <div class="file-item ${state.currentFile?.id === file.id ? 'active' : ''} ${file.loaded ? '' : 'disabled'}" 
             data-open-file-id="${escapeHtml(file.id)}"
             data-file-index="${index}"
             draggable="${file.loaded ? 'true' : 'false'}"
             title="${escapeHtml(file.loaded ? file.name : `${file.name} - re-import this source file to relink annotations`)}">
          <span class="material-icons-round file-item-icon">description</span>
          <span class="file-item-body">
            <span class="text-truncate file-item-name">${escapeHtml(file.name)}</span>
            <span class="file-item-meta">${describeDocumentStatus(file, index)}</span>
          </span>
          ${file.loaded ? `
          <span class="file-item-actions">
            <button type="button" class="file-item-action-btn" data-file-action="move-up" data-file-id="${escapeHtml(file.id)}" title="Move Up" ${index === 0 ? 'disabled' : ''}>
              <span class="material-icons-round">keyboard_arrow_up</span>
            </button>
            <button type="button" class="file-item-action-btn" data-file-action="move-down" data-file-id="${escapeHtml(file.id)}" title="Move Down" ${index === state.files.length - 1 ? 'disabled' : ''}>
              <span class="material-icons-round">keyboard_arrow_down</span>
            </button>
            <button type="button" class="file-item-action-btn danger" data-file-action="remove" data-file-id="${escapeHtml(file.id)}" title="Remove From Library">
              <span class="material-icons-round">delete</span>
            </button>
          </span>
          ` : ''}
        </div>
    `).join('')}
    `;
}

// Global handler for list items
window.openFileById = (id) => {
    const file = state.files.find(f => f.id === id);
    if (file) {
        openFile(file);
        return;
    }

    const missingDocument = getAppContext().documentManager?.getDocumentInfo?.(id);
    if (missingDocument && !missingDocument.loaded) {
        promptRelinkDocument(id);
    }
};

async function handleJumpToSource(sourceId, highlightId) {
    const result = await navigateToLinkedSource({
        sourceId,
        highlightId,
        findHighlightById,
        findFileById: (id) => state.files.find((file) => file.id === id) ?? null,
        openFile,
        getCurrentFile: () => state.currentFile,
        getCurrentReader: () => currentReader,
        notify: ({ message, level }) => emitAppNotification({
            title: level === 'warning' ? 'Source Navigation' : 'Navigation',
            message,
            level
        })
    });

    if (result.status === 'missing-file') {
        logger.warn('Source file not found', { effectiveSourceId: result.effectiveSourceId, sourceId });
    }

    if (result.status === 'missing-highlight') {
        logger.warn('Highlight not found', highlightId);
    }
}

async function openFile(fileData) {
    destroyCurrentReader();
    resetReadingState();
    documentHistoryManager.stopAutoSave();

    state.currentFile = fileData;
    updateToolbarSummary();

    // Update Global State for Persistence
    updateCurrentBook({
        md5: fileData.id,
        id: fileData.id,
        name: fileData.name
    });

    renderFileList();
    elements.viewer.innerHTML = '';

    if (getAppContext().documentManager) {
        getAppContext().documentManager.registerDocument(
            fileData.id,
            fileData.name,
            fileData.type,
            true
        );
    }

    if (getAppContext().cardSystem) {
        getAppContext().cardSystem.updateSourceNames(fileData.id, fileData.name);
    }
    if (getAppContext().highlightManager) {
        getAppContext().highlightManager.updateSourceNames(fileData.id, fileData.name);
    }

    // Load Annotations List
    if (getAppContext().annotationList) {
        getAppContext().annotationList.load(fileData.id);
    }

    currentReader = await readerLoader.loadReaderForFile(fileData);

    updateToolAvailability(fileData.type);
    setWorkspaceMode('reading', { force: true });
    renderFileList();
}

function updateToolAvailability(fileType) {
    const isPDF = fileType === 'application/pdf';
    const toolsToToggle = ['rect-mode', 'ellipse-mode', 'highlighter-mode'];

    toolsToToggle.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            if (!btn.dataset.baseTitle) {
                btn.dataset.baseTitle = btn.title || '';
            }

            btn.disabled = !isPDF;
            if (!isPDF) {
                btn.classList.add('disabled');
                btn.title = `${btn.dataset.baseTitle} (Only available for PDF)`.trim();
            } else {
                btn.classList.remove('disabled');
                btn.title = btn.dataset.baseTitle;
            }
        }
    });

    const currentModeBtn = document.querySelector('.mode-btn.active');
    if (currentModeBtn && currentModeBtn.disabled) {
        getAppContext().setToolMode?.('pan');
    }

    [elements.prevBtn, elements.nextBtn, elements.mobilePrevBtn, elements.mobileNextBtn]
        .filter(Boolean)
        .forEach((button) => {
            button.disabled = !state.currentFile;
        });
}

function updatePageInfo() {
    if (state.totalPages > 0) {
        elements.pageInfo.textContent = `${state.currentPage} / ${state.totalPages}`;
        elements.mobilePageInfo && (elements.mobilePageInfo.textContent = `${state.currentPage} / ${state.totalPages}`);
        elements.mobileContextPageInfo && (elements.mobileContextPageInfo.textContent = `${state.currentPage} / ${state.totalPages}`);
    } else {
        elements.pageInfo.textContent = '-- / --';
        elements.mobilePageInfo && (elements.mobilePageInfo.textContent = '-- / --');
        elements.mobileContextPageInfo && (elements.mobileContextPageInfo.textContent = '-- / --');
    }
}

function loadFilesFromStorage() {
    return [];
}

function clearLoadedFiles() {
    destroyCurrentReader();
    resetReadingState();
    documentHistoryManager.stopAutoSave();
    state.files = [];
    state.currentFile = null;
    elements.viewer.innerHTML = '';
    updateCurrentBook({
        md5: null,
        id: null,
        name: null
    });
    updateToolbarSummary();
}

async function hydrateProjectFiles(projectFiles = [], { openCurrentBookId = null } = {}) {
    clearLoadedFiles();

    if (!Array.isArray(projectFiles) || !projectFiles.length) {
        renderFileList();
        return [];
    }

    const appContext = getAppContext();
    state.files = projectFiles.map((file) => ({
        ...file,
        restoredDocumentId: file.id
    }));

    state.files.forEach((file) => {
        appContext.documentManager?.registerDocument(file.id, file.name, file.type, true);
    });

    renderFileList();

    const initialFile = state.files.find((file) => file.id === openCurrentBookId) || state.files[0];
    if (initialFile) {
        await openFile(initialFile);
    }

    return state.files;
}

setAppService('getProjectFiles', () => state.files);
setAppService('hydrateProjectFiles', hydrateProjectFiles);

// Start app
readerLoader = createReaderLoader({
    elements,
    state,
    getOutlineSidebar: () => outlineSidebar,
    documentHistoryManager,
    resetAuxiliaryPanels,
    setToolMode: (mode) => getAppContext().setToolMode?.(mode),
    updatePageInfo
});

void init();
