export class SplitView {
    constructor(options) {
        console.log('Initializing SplitView with options:', options);
        this.leftPanel = document.getElementById(options.leftId);
        this.centerPanel = document.getElementById(options.centerId);
        this.rightPanel = document.getElementById(options.rightId);

        this.resizerLeft = document.getElementById(options.resizerLeftId);
        this.resizerRight = document.getElementById(options.resizerRightId);

        if (!this.leftPanel || !this.centerPanel || !this.rightPanel || !this.resizerLeft || !this.resizerRight) {
            console.error('SplitView: One or more elements not found!', {
                left: this.leftPanel,
                center: this.centerPanel,
                right: this.rightPanel,
                resizerLeft: this.resizerLeft,
                resizerRight: this.resizerRight
            });
            return;
        }

        this.minWidth = 200;
        this.compactBreakpoint = options.compactBreakpoint || 820;
        this.isCompact = false;
        this.handleViewportChange = () => this.applyResponsiveState();

        this.setupResizers();
        window.addEventListener('resize', this.handleViewportChange);
        this.applyResponsiveState();
        console.log('SplitView initialized successfully');
    }

    setupResizers() {
        // Left Resizer
        const addResizeListeners = (element, isLeft) => {
            const startResize = (e) => {
                e.preventDefault();
                const panel = isLeft ? this.leftPanel : this.rightPanel;
                panel.classList.add('resizing');

                if (isLeft) {
                    document.addEventListener('mousemove', this.resizeLeft);
                    document.addEventListener('mouseup', this.stopResizeLeft);
                    document.addEventListener('touchmove', this.resizeLeftTouch, { passive: false });
                    document.addEventListener('touchend', this.stopResizeLeftTouch);
                } else {
                    document.addEventListener('mousemove', this.resizeRight);
                    document.addEventListener('mouseup', this.stopResizeRight);
                    document.addEventListener('touchmove', this.resizeRightTouch, { passive: false });
                    document.addEventListener('touchend', this.stopResizeRightTouch);
                }
                document.body.style.cursor = 'col-resize';
            };

            element.addEventListener('mousedown', startResize);
            element.addEventListener('touchstart', (e) => {
                // Use the first touch point
                startResize(e);
            }, { passive: false });
        };

        addResizeListeners(this.resizerLeft, true);
        addResizeListeners(this.resizerRight, false);
    }

    resizeLeft = (e) => {
        this.performResizeLeft(e.clientX);
    }

    resizeLeftTouch = (e) => {
        if (e.cancelable) e.preventDefault();
        this.performResizeLeft(e.touches[0].clientX);
    }

    performResizeLeft(clientX) {
        const newWidth = clientX;
        // Calculate max width allowing for right panel and min center width
        const rightPanelWidth = this.rightPanel.getBoundingClientRect().width;
        const maxLeftWidth = window.innerWidth - rightPanelWidth - 300; // Reserve 300px for center

        if (newWidth > this.minWidth && newWidth < maxLeftWidth) {
            this.leftPanel.style.width = `${newWidth}px`;
            this.leftPanel.style.flex = 'none';
        }
    }

    stopResizeLeft = () => {
        this.cleanupResizeLeft();
    }

    stopResizeLeftTouch = () => {
        this.cleanupResizeLeft();
    }

    cleanupResizeLeft() {
        this.leftPanel.classList.remove('resizing'); // Re-enable transitions
        document.removeEventListener('mousemove', this.resizeLeft);
        document.removeEventListener('mouseup', this.stopResizeLeft);
        document.removeEventListener('touchmove', this.resizeLeftTouch);
        document.removeEventListener('touchend', this.stopResizeLeftTouch);
        document.body.style.cursor = 'default';
    }

    resizeRight = (e) => {
        this.performResizeRight(e.clientX);
    }

    resizeRightTouch = (e) => {
        if (e.cancelable) e.preventDefault();
        this.performResizeRight(e.touches[0].clientX);
    }

    performResizeRight(clientX) {
        const newWidth = window.innerWidth - clientX;
        // Calculate max width allowing for left panel and min center width
        const leftPanelWidth = this.leftPanel.getBoundingClientRect().width;
        const maxRightWidth = window.innerWidth - leftPanelWidth - 300; // Reserve 300px for center

        if (newWidth > this.minWidth && newWidth < maxRightWidth) {
            this.rightPanel.style.width = `${newWidth}px`;
            this.rightPanel.style.flex = 'none';
        }
    }

    stopResizeRight = () => {
        this.cleanupResizeRight();
    }

    stopResizeRightTouch = () => {
        this.cleanupResizeRight();
    }

    cleanupResizeRight() {
        this.rightPanel.classList.remove('resizing'); // Re-enable transitions
        document.removeEventListener('mousemove', this.resizeRight);
        document.removeEventListener('mouseup', this.stopResizeRight);
        document.removeEventListener('touchmove', this.resizeRightTouch);
        document.removeEventListener('touchend', this.stopResizeRightTouch);
        document.body.style.cursor = 'default';
    }

    applyResponsiveState() {
        const nextCompact = window.innerWidth <= this.compactBreakpoint;
        const changed = this.isCompact !== nextCompact;
        this.isCompact = nextCompact;
        document.body.classList.toggle('compact-layout', this.isCompact);

        if (!changed) return;

        if (this.isCompact) {
            this.setLeftCollapsed(true);
            this.setRightCollapsed(true);
        }
    }

    isCompactLayout() {
        return this.isCompact;
    }

    isLeftCollapsed() {
        return this.leftPanel.classList.contains('collapsed');
    }

    isRightCollapsed() {
        return this.rightPanel.classList.contains('collapsed');
    }

    setLeftCollapsed(collapsed) {
        this.leftPanel.classList.toggle('collapsed', collapsed);
        this.emitPanelState('left', !collapsed);
    }

    setRightCollapsed(collapsed) {
        this.rightPanel.classList.toggle('collapsed', collapsed);
        this.emitPanelState('right', !collapsed);
    }

    emitPanelState(panel, open) {
        window.dispatchEvent(new CustomEvent('layout-panel-toggled', {
            detail: {
                panel,
                open,
                compact: this.isCompact
            }
        }));
    }

    closeAll() {
        this.setLeftCollapsed(true);
        this.setRightCollapsed(true);
    }

    toggleLeft() {
        const willOpen = this.isLeftCollapsed();
        if (this.isCompact && willOpen) {
            this.setRightCollapsed(true);
        }
        this.setLeftCollapsed(!willOpen);
    }

    toggleRight() {
        const willOpen = this.isRightCollapsed();
        if (this.isCompact && willOpen) {
            this.setLeftCollapsed(true);
        }
        this.setRightCollapsed(!willOpen);
    }
}
