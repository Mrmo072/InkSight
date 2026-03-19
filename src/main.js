import './styles/styles.css';
import { highlightManager } from './core/highlight-manager.js';
import { SplitView } from './ui/split-view.js';
import { OutlineSidebar } from './ui/outline-sidebar.js';
import { AnnotationList } from './ui/annotation-list.js';
import { suppressResizeObserverLoop } from './drawnix/react-board/src/utils/resizeObserverFix.js';
import { documentHistoryManager } from './core/document-history-manager.js'; // Import History Manager
import { getAppContext, initAppContext, setAppService, updateCurrentBook } from './app/app-context.js';
import { createReaderLoader } from './app/reader-loader.js';
import { registerEventListeners } from './app/event-listeners.js';
import { setupSelectionSync } from './app/selection-sync.js';
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
    addFileBtn: document.getElementById('add-file-btn'),
    fileList: document.getElementById('file-list'),
    viewer: document.getElementById('viewer'),
    docTitle: document.getElementById('doc-title'),
    prevBtn: document.getElementById('prev-page'),
    nextBtn: document.getElementById('next-page'),
    mobilePrevBtn: document.getElementById('mobile-prev-page'),
    mobileNextBtn: document.getElementById('mobile-next-page'),
    pageInfo: document.getElementById('page-info'),
    mobileContextPageInfo: document.getElementById('mobile-context-page-info'),
    mobileDocSummary: document.getElementById('mobile-doc-summary'),
    mobilePageInfo: document.getElementById('mobile-page-info'),
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
    selectionModeDragHandle: document.getElementById('selection-mode-drag-handle')
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
        setWorkspaceMode('reading', { force: true });

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
async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileSignature = `${file.name}-${file.size}-${file.lastModified}`;
    const fileId = await generateHash(fileSignature);

    const fileData = {
        id: fileId,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        fileObj: file
    };

    const existingIndex = state.files.findIndex(f => f.id === fileId);
    if (existingIndex >= 0) {
        state.files[existingIndex] = fileData;
    } else {
        state.files.push(fileData);
    }

    renderFileList();
    openFile(fileData);
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
    if (!state.files.length) {
        elements.fileList.innerHTML = `
            <div class="library-empty-state">
              <span class="material-icons-round">upload_file</span>
              <h3>Your library is empty</h3>
              <p>Import a PDF, EPUB, TXT, or Markdown file to start reading.</p>
            </div>
        `;
        return;
    }

    elements.fileList.innerHTML = state.files.map((file, index) => `
        <div class="file-item ${state.currentFile?.id === file.id ? 'active' : ''}" 
             onclick="window.openFileById('${file.id}')">
          <span class="material-icons-round file-item-icon">description</span>
          <span class="file-item-body">
            <span class="text-truncate file-item-name">${file.name}</span>
            <span class="file-item-meta">Document ${index + 1}</span>
          </span>
        </div>
    `).join('');
}

// Global handler for list items
window.openFileById = (id) => {
    const file = state.files.find(f => f.id === id);
    if (file) openFile(file);
};

async function handleJumpToSource(sourceId, highlightId) {
    const highlight = findHighlightById(highlightId);

    const effectiveSourceId = highlight ? highlight.sourceId : sourceId;
    const file = state.files.find(f => f.id === effectiveSourceId);
    if (!file) {
        logger.warn('Source file not found', { effectiveSourceId, sourceId });
        return;
    }

    if (!highlight) {
        logger.warn('Highlight not found', highlightId);
        return;
    }

    if (!state.currentFile || state.currentFile.id !== effectiveSourceId) {
        await openFile(file);
    }

    if (currentReader) {
        if (currentReader.scrollToHighlight) {
            await currentReader.scrollToHighlight(highlightId);
        } else {
            const pageInfo = currentReader.pages ? currentReader.pages[highlight.location.page - 1] : null;
            if (pageInfo && pageInfo.wrapper) {
                pageInfo.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (currentReader.flashHighlight) {
                    setTimeout(() => {
                        currentReader.flashHighlight(highlightId);
                    }, 500);
                }
            }
        }
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
