export class OutlineSidebar {
    constructor(sidebarId, contentId, toggleBtnId) {
        this.sidebar = document.getElementById(sidebarId);
        this.content = document.getElementById(contentId);
        this.toggleBtn = document.getElementById(toggleBtnId);

        // State
        this.outline = null;
        this.pdfDoc = null;
        this.isVisible = false; // Start collapsed

        this.init();
    }

    init() {
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.toggle());
        }
    }

    reset() {
        if (this.content) {
            this.content.innerHTML = '<div class="outline-empty">No outline available</div>';
        }
        this.outline = null;
        this.pdfDoc = null;
    }

    async render(outlinePromise, pdfDoc) {
        this.reset();
        this.pdfDoc = pdfDoc;

        try {
            const outline = await outlinePromise;
            this.outline = outline;

            if (!outline || outline.length === 0) {
                this.content.innerHTML = '<div class="outline-empty">No outline available</div>';
                return;
            }

            this.content.innerHTML = ''; // Clear empty message
            const fragment = document.createDocumentFragment();

            await this.buildTree(outline, fragment, 0);

            this.content.appendChild(fragment);

            // If we have an outline, auto-open sidebar if screen is wide enough
            // if (window.innerWidth > 1200 && !this.isVisible) {
            //     this.toggle(true);
            // }

        } catch (e) {
            console.error('Error rendering outline:', e);
            this.content.innerHTML = '<div class="outline-empty">Error loading outline</div>';
        }
    }

    async buildTree(items, container, level) {
        for (const item of items) {
            const div = document.createElement('div');
            div.className = `outline-item ${level > 0 ? 'nested' : ''} ${level > 1 ? 'nested-2' : ''}`;
            div.textContent = item.title;
            div.title = item.title; // Tooltip
            div.style.paddingLeft = `${16 + (level * 16)}px`; // Dynamic nesting

            div.addEventListener('click', async () => {
                // Remove active class from all items
                const allItems = this.content.querySelectorAll('.outline-item');
                allItems.forEach(el => el.classList.remove('active'));
                div.classList.add('active');

                // Navigate
                if (window.inksight && window.inksight.pdfReader) {
                    await window.inksight.pdfReader.navigateToDest(item.dest);
                }
            });

            container.appendChild(div);

            if (item.items && item.items.length > 0) {
                await this.buildTree(item.items, container, level + 1);
            }
        }
    }

    toggle(forceState) {
        if (forceState !== undefined) {
            this.isVisible = forceState;
        } else {
            this.isVisible = !this.isVisible;
        }

        if (this.isVisible) {
            this.sidebar.classList.remove('collapsed');
            if (this.toggleBtn) this.toggleBtn.classList.add('active');
        } else {
            this.sidebar.classList.add('collapsed');
            if (this.toggleBtn) this.toggleBtn.classList.remove('active');
        }
    }
}
