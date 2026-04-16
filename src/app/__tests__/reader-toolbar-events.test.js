import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupReaderToolbarEvents } from '../reader-toolbar-events.js';

describe('reader-toolbar-events', () => {
    let cleanupFns;
    let currentReader;
    let services;
    let setWorkspaceMode;
    let setMobileToolbarExpanded;
    let logger;

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="pan-mode"></button>
            <button id="text-mode"></button>
            <button id="rect-mode"></button>
            <button id="ellipse-mode"></button>
            <button id="highlighter-mode"></button>
            <div id="highlighter-panel"></div>
            <input id="highlighter-height" value="16" />
            <button id="layout-btn"></button>
            <div id="mindmap-container"></div>
        `;
        document.body.className = '';
        cleanupFns = [];
        services = {};
        currentReader = {
            setSelectionMode: vi.fn(),
            highlighterTool: {
                height: 16,
                setHeight: vi.fn()
            }
        };
        setWorkspaceMode = vi.fn();
        setMobileToolbarExpanded = vi.fn();
        logger = { warn: vi.fn() };
        window.matchMedia = vi.fn().mockReturnValue({ matches: false });
        window.applyAutoLayout = vi.fn();
    });

    function setup(overrides = {}) {
        setupReaderToolbarEvents({
            registerCleanup: (fn) => {
                cleanupFns.push(fn);
                return fn;
            },
            getCurrentReader: () => currentReader,
            getCurrentToolMode: () => overrides.currentToolMode ?? 'pan',
            setCurrentToolMode: overrides.setCurrentToolMode ?? vi.fn(),
            setMobileToolbarExpanded,
            setWorkspaceMode,
            logger,
            setAppService: (key, value) => {
                services[key] = value;
            },
            ...overrides
        });
    }

    it('registers tool mode services and syncs active button state', () => {
        const setCurrentToolMode = vi.fn();
        setup({ setCurrentToolMode });

        services.setToolMode('text');

        expect(currentReader.setSelectionMode).toHaveBeenCalledWith('text');
        expect(setCurrentToolMode).toHaveBeenCalledWith('text');
        expect(document.getElementById('text-mode').classList.contains('active')).toBe(true);

        services.syncToolMode('ellipse');
        expect(document.getElementById('ellipse-mode').classList.contains('active')).toBe(true);
    });

    it('toggles the highlighter panel when the highlighter button is already active', () => {
        setup();

        const highlighterBtn = document.getElementById('highlighter-mode');
        const panel = document.getElementById('highlighter-panel');

        highlighterBtn.classList.add('active');
        highlighterBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(panel.classList.contains('visible')).toBe(true);

        highlighterBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(panel.classList.contains('visible')).toBe(false);
    });

    it('switches to map mode and runs auto-layout when layout button is pressed', () => {
        setup();

        document.getElementById('layout-btn').click();

        expect(setWorkspaceMode).toHaveBeenCalledWith('map');
        expect(window.applyAutoLayout).toHaveBeenCalled();
    });
});
