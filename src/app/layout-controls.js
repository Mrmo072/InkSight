import { registerEventListeners } from './event-listeners.js';

export function setupLayoutToggles({
    elements,
    registerCleanup,
    splitView,
    outlineSidebar,
    setWorkspaceMode,
    updatePanelControls,
    setMobileToolbarExpanded,
    setMobileNotesViewHandler
}) {
    const toggleAnnotationsBtn = document.getElementById('toggle-annotations');
    const annotationListContainer = document.getElementById('annotation-list');
    const showAnnotationsBtn = document.getElementById('show-annotations');
    const showMindmapBtn = document.getElementById('show-mindmap');

    const setMobileNotesView = (view) => {
        const nextView = view === 'mindmap' ? 'mindmap' : 'annotations';
        document.body.dataset.notesView = nextView;
        showAnnotationsBtn?.classList.toggle('active', nextView === 'annotations');
        showAnnotationsBtn?.setAttribute('aria-selected', String(nextView === 'annotations'));
        showMindmapBtn?.classList.toggle('active', nextView === 'mindmap');
        showMindmapBtn?.setAttribute('aria-selected', String(nextView === 'mindmap'));
    };

    setMobileNotesViewHandler(setMobileNotesView);

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

    if (elements.toggleSidebarBtn) {
        registerCleanup(registerEventListeners([
            {
                target: elements.toggleSidebarBtn,
                event: 'click',
                handler: () => {
                    splitView?.toggleLeft();
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
                    splitView?.toggleRight();
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
