import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupLayoutToggles } from '../layout-controls.js';

describe('layout-controls', () => {
    let elements;
    let splitView;
    let outlineSidebar;
    let setWorkspaceMode;
    let updatePanelControls;
    let setMobileToolbarExpanded;
    let mobileNotesViewHandler;

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="toggle-annotations"></button>
            <div id="annotation-list"></div>
            <button id="show-annotations"></button>
            <button id="show-mindmap"></button>
            <button id="toggle-mobile-tools"></button>
            <div id="reader-toolbar"></div>
            <button id="toggle-sidebar"></button>
            <button id="close-sidebar-panel"></button>
            <button id="toggle-notes"></button>
            <button id="close-notes-panel"></button>
            <button id="close-outline-panel"></button>
            <button id="sidebar-width-preset"></button>
            <button id="toolbar-sidebar-width-preset"></button>
            <button id="notes-width-preset"></button>
            <button id="toolbar-notes-width-preset"></button>
            <button id="workspace-mode-reading"></button>
            <button id="workspace-mode-capture"></button>
            <button id="workspace-mode-map"></button>
            <button id="mobile-workspace-mode-reading"></button>
            <button id="mobile-workspace-mode-capture"></button>
            <button id="mobile-workspace-mode-map"></button>
        `;
        document.body.className = '';

        elements = {
            toggleSidebarBtn: document.getElementById('toggle-sidebar'),
            closeSidebarPanelBtn: document.getElementById('close-sidebar-panel'),
            toggleNotesBtn: document.getElementById('toggle-notes'),
            closeNotesPanelBtn: document.getElementById('close-notes-panel'),
            closeOutlinePanelBtn: document.getElementById('close-outline-panel'),
            sidebarWidthPresetBtn: document.getElementById('sidebar-width-preset'),
            toolbarSidebarWidthPresetBtn: document.getElementById('toolbar-sidebar-width-preset'),
            notesWidthPresetBtn: document.getElementById('notes-width-preset'),
            toolbarNotesWidthPresetBtn: document.getElementById('toolbar-notes-width-preset'),
            toggleMobileToolsBtn: document.getElementById('toggle-mobile-tools'),
            readerToolbar: document.getElementById('reader-toolbar'),
            workspaceModeReadingBtn: document.getElementById('workspace-mode-reading'),
            workspaceModeCaptureBtn: document.getElementById('workspace-mode-capture'),
            workspaceModeMapBtn: document.getElementById('workspace-mode-map'),
            mobileWorkspaceModeReadingBtn: document.getElementById('mobile-workspace-mode-reading'),
            mobileWorkspaceModeCaptureBtn: document.getElementById('mobile-workspace-mode-capture'),
            mobileWorkspaceModeMapBtn: document.getElementById('mobile-workspace-mode-map')
        };

        splitView = {
            toggleLeft: vi.fn(),
            setLeftCollapsed: vi.fn(),
            toggleRight: vi.fn(),
            setRightCollapsed: vi.fn(),
            cyclePanelPreset: vi.fn()
        };
        outlineSidebar = {
            close: vi.fn()
        };
        setWorkspaceMode = vi.fn();
        updatePanelControls = vi.fn();
        setMobileToolbarExpanded = vi.fn();
        mobileNotesViewHandler = vi.fn();
    });

    function setup() {
        const cleanups = [];
        setupLayoutToggles({
            elements,
            registerCleanup: (fn) => {
                cleanups.push(fn);
                return fn;
            },
            splitView,
            outlineSidebar,
            setWorkspaceMode,
            updatePanelControls,
            setMobileToolbarExpanded,
            setMobileNotesViewHandler: mobileNotesViewHandler
        });
        return cleanups;
    }

    it('switches to capture/map modes from the mobile notes toggles', () => {
        setup();

        document.getElementById('show-annotations').click();
        document.getElementById('show-mindmap').click();

        expect(setWorkspaceMode).toHaveBeenNthCalledWith(1, 'capture');
        expect(setWorkspaceMode).toHaveBeenNthCalledWith(2, 'map');
        expect(mobileNotesViewHandler).toHaveBeenCalledOnce();
    });

    it('handles sidebar and notes buttons through split view controls', () => {
        setup();

        elements.toggleSidebarBtn.click();
        elements.toggleNotesBtn.click();
        elements.closeNotesPanelBtn.click();

        expect(splitView.toggleLeft).toHaveBeenCalled();
        expect(splitView.toggleRight).toHaveBeenCalled();
        expect(splitView.setRightCollapsed).toHaveBeenCalledWith(true);
        expect(setMobileToolbarExpanded).toHaveBeenCalledWith(false);
    });

    it('closes the mobile toolbar when clicking outside in mobile layout', () => {
        setup();
        document.body.classList.add('mobile-layout');

        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(setMobileToolbarExpanded).toHaveBeenCalledWith(false);
    });
});
