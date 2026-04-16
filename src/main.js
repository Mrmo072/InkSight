import './styles/styles.css';
import { highlightManager } from './core/highlight-manager.js';
import { emitAppNotification } from './ui/app-notifications.js';
import { suppressResizeObserverLoop } from './drawnix/react-board/src/utils/resizeObserverFix.js';
import { documentHistoryManager } from './core/document-history-manager.js'; // Import History Manager
import { getAppContext, initAppContext, setAppService } from './app/app-context.js';
import { initAppBootstrap, setupAppEventListeners } from './app/app-bootstrap.js';
import { createReaderLoader } from './app/reader-loader.js';
import { registerEventListeners } from './app/event-listeners.js';
import { buildRecoveryDiagnostics, findLoadedDocumentMatch } from './app/document-relink.js';
import { createFileLibraryRenderer, getCardsCollection, getDocumentReferenceDetails } from './app/file-library.js';
import { createWorkspaceDocumentsController } from './app/workspace-documents.js';
import { createProjectWorkspaceController } from './app/project-workspace.js';
import { navigateToLinkedSource } from './app/source-navigation.js';
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
let renderFileList = () => {};
let workspaceDocuments = null;
const projectWorkspace = createProjectWorkspaceController({
    localStorage,
    sessionStorage,
    saveStatusIndicator: elements.saveStatusIndicator,
    renderFileList: () => renderFileList()
});

renderFileList = createFileLibraryRenderer({
    fileListElement: elements.fileList,
    getFiles: () => state.files,
    getCurrentFileId: () => state.currentFile?.id ?? null,
    getProjectStatus: () => projectWorkspace.getProjectStatus(state.files)
});

workspaceDocuments = createWorkspaceDocumentsController({
    logger,
    projectWorkspace,
    getDocumentReferenceDetails,
    workspace: {
        state,
        elements
    },
    readers: {
        readerLoader: {
            loadReaderForFile: async (...args) => readerLoader.loadReaderForFile(...args)
        },
        documentHistoryManager,
        getCurrentReader: () => currentReader,
        setCurrentReader: (reader) => {
            currentReader = reader;
        }
    },
    ui: {
        renderFileList: () => renderFileList(),
        updateToolbarSummary,
        updateToolAvailability,
        setWorkspaceMode: (...args) => setWorkspaceMode(...args),
        updatePageInfo
    }
});

async function createDrawnixView(container) {
    const { DrawnixView } = await import('./mindmap/drawnix-view.js');
    return new DrawnixView(container);
}

function registerCleanup(cleanup) {
    return cleanup;
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

function setupMainEventListeners() {
    setupAppEventListeners({
        registerCleanup,
        elements,
        projectWorkspace,
        workspaceDocuments,
        ui: {
            promptImportDocument,
            promptBulkRelink,
            setWorkspaceMode,
            attemptAutoRelinkRecoveredDocuments,
            renderFileList,
            showRecoveryValidation,
            promptRelinkDocument
        },
        navigation: {
            getCurrentReader: () => currentReader,
            handleJumpToSource,
            closeCompactPanels
        },
        dragState: {
            getDraggedFileId: () => draggedFileId,
            setDraggedFileId: (id) => {
                draggedFileId = id;
            },
            getFiles: () => state.files
        },
        selectionSync: {
            findCardById,
            findCardByHighlightId,
            isCompactLayout,
            collapseNotesPanel: () => {
                splitView?.setRightCollapsed(true);
                updatePanelControls();
            }
        },
        toolbar: {
            getCurrentReader: () => currentReader,
            getCurrentToolMode: () => currentToolMode,
            setCurrentToolMode: (mode) => {
                currentToolMode = mode;
            },
            setMobileToolbarExpanded,
            setWorkspaceMode,
            logger
        }
    });
}

async function init() {
    const initialized = await initAppBootstrap({
        elements,
        registerCleanup,
        services: {
            logger,
            projectWorkspace
        },
        hooks: {
            updateToolbarSummary,
            createDrawnixView,
            workspaceModeReadingInit: () => setWorkspaceMode('reading', { force: true }),
            setupEventListeners: ({ splitView: nextSplitView, outlineSidebar: nextOutlineSidebar, annotationList: nextAnnotationList }) => {
                splitView = nextSplitView;
                outlineSidebar = nextOutlineSidebar;
                annotationList = nextAnnotationList;
                setupMainEventListeners();
            },
            currentToolModeSync: () => getAppContext().syncToolMode?.(currentToolMode),
            setupResponsiveLayout: () => setupResponsiveLayout(),
            setupFloatingSelectionToolbar,
            setWorkspaceMode,
            setMobileNotesViewHandler: (handler) => {
                setMobileNotesView = handler;
            },
            getSplitViewDeps: () => ({
                updatePanelControls,
                setMobileToolbarExpanded
            }),
            handleRestorePagePosition: (event) => {
                const page = event.detail.page;
                if (page && currentReader && page > 1) {
                    logger.debug('Received restore-page-position event. Jumping to', page);
                    currentReader.scrollToPage(page);
                }
            }
        }
    });

    return initialized;
}

// Global handler for list items
window.openFileById = (id) => workspaceDocuments.openFileById(id, {
    onMissingDocument: (documentId) => promptRelinkDocument(documentId)
});

async function handleJumpToSource(sourceId, highlightId) {
    const result = await navigateToLinkedSource({
        sourceId,
        highlightId,
        findHighlightById,
        findFileById: (id) => state.files.find((file) => file.id === id) ?? null,
        openFile: (fileData) => workspaceDocuments.openFile(fileData),
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

setAppService('getProjectFiles', () => state.files);
setAppService('hydrateProjectFiles', (projectFiles, options = {}) => workspaceDocuments.hydrateProjectFiles(projectFiles, options));

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
