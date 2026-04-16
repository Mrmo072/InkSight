import { registerEventListeners } from './event-listeners.js';

export function setupReaderToolbarEvents({
    registerCleanup,
    getCurrentReader,
    getCurrentToolMode,
    setCurrentToolMode,
    setMobileToolbarExpanded,
    setWorkspaceMode,
    logger,
    setAppService
}) {
    const highlighterPanel = document.getElementById('highlighter-panel');
    const panModeBtn = document.getElementById('pan-mode');
    const textModeBtn = document.getElementById('text-mode');
    const rectModeBtn = document.getElementById('rect-mode');
    const ellipseModeBtn = document.getElementById('ellipse-mode');
    const highlighterModeBtn = document.getElementById('highlighter-mode');
    const heightSlider = document.getElementById('highlighter-height');
    const layoutBtn = document.getElementById('layout-btn');
    const mindmapContainer = document.getElementById('mindmap-container');
    const isCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches;

    const modeButtons = [panModeBtn, textModeBtn, rectModeBtn, ellipseModeBtn, highlighterModeBtn].filter(Boolean);

    const syncModeButtons = (mode) => {
        setCurrentToolMode(mode);
        modeButtons.forEach((btn) => btn.classList.remove('active'));
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
        if (!highlighterModeBtn || !highlighterPanel) {
            return;
        }

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
        const currentReader = getCurrentReader();
        if (currentReader?.setSelectionMode) {
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

    if (highlighterModeBtn && highlighterPanel) {
        let isDragging = false;
        let startY = 0;
        let startHeight = 16;
        const clickThreshold = 5;

        const startDrag = (y) => {
            isDragging = false;
            startY = y;
            const currentReader = getCurrentReader();
            if (currentReader?.highlighterTool) {
                startHeight = currentReader.highlighterTool.height;
            } else if (heightSlider) {
                startHeight = parseInt(heightSlider.value, 10) || 16;
            }
        };

        const onMove = (y) => {
            const deltaY = startY - y;
            if (Math.abs(deltaY) > clickThreshold) {
                isDragging = true;
            }
            if (isDragging) {
                let newHeight = startHeight + deltaY;
                newHeight = Math.max(8, Math.min(48, newHeight));
                if (heightSlider) {
                    heightSlider.value = String(newHeight);
                }
                const currentReader = getCurrentReader();
                currentReader?.highlighterTool?.setHeight(newHeight);
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

        const onMouseMove = (e) => onMove(e.clientY);
        const onMouseUp = () => {
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
                        const newHeight = parseInt(e.target.value, 10);
                        getCurrentReader()?.highlighterTool?.setHeight(newHeight);
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

    if (getCurrentToolMode()) {
        syncModeButtons(getCurrentToolMode());
    }
}
