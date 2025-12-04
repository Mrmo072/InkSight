import React from 'react';
import { createRoot } from 'react-dom/client';
import { DrawnixBoardComponent } from './DrawnixBoard.jsx';

export class DrawnixView {
    constructor(container) {
        this.container = container;
        this.init();
    }

    init() {
        this.container.innerHTML = '';
        // Ensure container has dimensions
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.overflow = 'hidden';

        const root = createRoot(this.container);
        root.render(React.createElement(DrawnixBoardComponent));
    }
}
