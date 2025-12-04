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

        this.setupResizers();
        console.log('SplitView initialized successfully');
    }

    setupResizers() {
        // Left Resizer
        this.resizerLeft.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.leftPanel.classList.add('resizing'); // Disable transitions
            document.addEventListener('mousemove', this.resizeLeft);
            document.addEventListener('mouseup', this.stopResizeLeft);
            document.body.style.cursor = 'col-resize';
        });

        // Right Resizer
        this.resizerRight.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.rightPanel.classList.add('resizing'); // Disable transitions
            document.addEventListener('mousemove', this.resizeRight);
            document.addEventListener('mouseup', this.stopResizeRight);
            document.body.style.cursor = 'col-resize';
        });
    }

    resizeLeft = (e) => {
        const newWidth = e.clientX;
        // Calculate max width allowing for right panel and min center width
        const rightPanelWidth = this.rightPanel.getBoundingClientRect().width;
        const maxLeftWidth = window.innerWidth - rightPanelWidth - 300; // Reserve 300px for center

        if (newWidth > this.minWidth && newWidth < maxLeftWidth) {
            this.leftPanel.style.width = `${newWidth}px`;
            this.leftPanel.style.flex = 'none';
        }
    }

    stopResizeLeft = () => {
        this.leftPanel.classList.remove('resizing'); // Re-enable transitions
        document.removeEventListener('mousemove', this.resizeLeft);
        document.removeEventListener('mouseup', this.stopResizeLeft);
        document.body.style.cursor = 'default';
    }

    resizeRight = (e) => {
        const newWidth = window.innerWidth - e.clientX;
        // Calculate max width allowing for left panel and min center width
        const leftPanelWidth = this.leftPanel.getBoundingClientRect().width;
        const maxRightWidth = window.innerWidth - leftPanelWidth - 300; // Reserve 300px for center

        if (newWidth > this.minWidth && newWidth < maxRightWidth) {
            this.rightPanel.style.width = `${newWidth}px`;
            this.rightPanel.style.flex = 'none';
        }
    }

    stopResizeRight = () => {
        this.rightPanel.classList.remove('resizing'); // Re-enable transitions
        document.removeEventListener('mousemove', this.resizeRight);
        document.removeEventListener('mouseup', this.stopResizeRight);
        document.body.style.cursor = 'default';
    }

    toggleLeft() {
        this.leftPanel.classList.toggle('collapsed');
    }

    toggleRight() {
        this.rightPanel.classList.toggle('collapsed');
    }
}
