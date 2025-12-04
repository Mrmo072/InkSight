export class ModalManager {
    constructor() {
        this.createModal();
    }

    createModal() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';

        this.content = document.createElement('div');
        this.content.className = 'modal-content';

        this.closeBtn = document.createElement('button');
        this.closeBtn.className = 'modal-close';
        this.closeBtn.innerHTML = '&times;';
        this.closeBtn.onclick = () => this.hide();

        this.body = document.createElement('div');
        this.body.className = 'modal-body';

        this.content.appendChild(this.closeBtn);
        this.content.appendChild(this.body);
        this.overlay.appendChild(this.content);
        document.body.appendChild(this.overlay);

        // Close on click outside
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    showImage(src) {
        this.body.innerHTML = '';
        const img = document.createElement('img');
        img.src = src;
        img.className = 'modal-image';
        this.body.appendChild(img);
        this.show();
    }

    showText(text) {
        this.body.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'modal-text';
        div.textContent = text;
        this.body.appendChild(div);
        this.show();
    }

    show() {
        this.isVisible = true;
        this.overlay.classList.add('active');
    }

    hide() {
        this.isVisible = false;
        this.overlay.classList.remove('active');
    }
}

export const modalManager = new ModalManager();
