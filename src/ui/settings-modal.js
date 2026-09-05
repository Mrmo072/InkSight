import { themeManager } from '../core/theme-manager.js';
import { preferencesManager } from '../core/preferences-manager.js';

const THEME_OPTIONS = [
    { value: 'default', label: '默认' },
    { value: 'colorful', label: '缤纷' },
    { value: 'soft', label: '柔和' },
    { value: 'retro', label: '复古' },
    { value: 'dark', label: '暗夜' },
    { value: 'starry', label: '星空' }
];

/**
 * Standalone settings dialog. Uses the same modal CSS classes as
 * ModalManager but keeps its own overlay so confirm/prompt content can
 * never clobber the settings form.
 */
class SettingsModal {
    constructor() {
        this.isVisible = false;
        this._resetArmed = false;
        this._resetTimer = null;
        this.createModal();
    }

    createModal() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';

        this.content = document.createElement('div');
        this.content.className = 'modal-content settings-modal';

        this.closeBtn = document.createElement('button');
        this.closeBtn.className = 'modal-close';
        this.closeBtn.innerHTML = '&times;';
        this.closeBtn.onclick = () => this.hide();

        this.body = document.createElement('div');
        this.body.className = 'modal-body';

        const title = document.createElement('h3');
        title.className = 'modal-title';
        title.textContent = '设置';
        this.body.appendChild(title);

        this.body.appendChild(this.buildAppearanceSection());
        this.body.appendChild(this.buildReadingSection());

        const actions = document.createElement('div');
        actions.className = 'modal-actions settings-modal__actions';

        this.resetBtn = document.createElement('button');
        this.resetBtn.type = 'button';
        this.resetBtn.className = 'modal-btn';
        this.resetBtn.textContent = '恢复默认';
        this.resetBtn.onclick = () => this.handleReset();

        const closeActionBtn = document.createElement('button');
        closeActionBtn.type = 'button';
        closeActionBtn.className = 'modal-btn modal-btn-primary';
        closeActionBtn.textContent = '关闭';
        closeActionBtn.onclick = () => this.hide();

        actions.appendChild(this.resetBtn);
        actions.appendChild(closeActionBtn);
        this.body.appendChild(actions);

        this.content.appendChild(this.closeBtn);
        this.content.appendChild(this.body);
        this.overlay.appendChild(this.content);
        document.body.appendChild(this.overlay);

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    buildAppearanceSection() {
        const section = document.createElement('div');
        section.className = 'settings-modal__group';

        const heading = document.createElement('h4');
        heading.className = 'settings-modal__group-title';
        heading.textContent = '外观';
        section.appendChild(heading);

        const row = document.createElement('div');
        row.className = 'settings-modal__row';

        const label = document.createElement('label');
        label.className = 'settings-modal__label';
        label.textContent = '主题';

        this.themeSelect = document.createElement('select');
        this.themeSelect.className = 'settings-modal__select';
        this.themeSelect.setAttribute('aria-label', 'Theme');
        THEME_OPTIONS.forEach(({ value, label: text }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            this.themeSelect.appendChild(option);
        });
        this.themeSelect.value = themeManager.getTheme();
        this.themeSelect.addEventListener('change', () => {
            themeManager.setTheme(this.themeSelect.value);
        });

        row.appendChild(label);
        row.appendChild(this.themeSelect);
        section.appendChild(row);
        return section;
    }

    buildReadingSection() {
        const section = document.createElement('div');
        section.className = 'settings-modal__group';

        const heading = document.createElement('h4');
        heading.className = 'settings-modal__group-title';
        heading.textContent = '阅读';
        section.appendChild(heading);

        const limits = preferencesManager.getLimits();
        const prefs = preferencesManager.get();

        this.fontSizeSlider = this.buildSliderRow(section, {
            label: '字号',
            min: limits.fontSize.min,
            max: limits.fontSize.max,
            step: 1,
            value: prefs.fontSize,
            format: (v) => `${v}px`,
            onChange: (value) => preferencesManager.set({ fontSize: value })
        });

        this.lineHeightSlider = this.buildSliderRow(section, {
            label: '行高',
            min: limits.lineHeight.min,
            max: limits.lineHeight.max,
            step: 0.1,
            value: prefs.lineHeight,
            format: (v) => v.toFixed(1),
            onChange: (value) => preferencesManager.set({ lineHeight: value })
        });

        return section;
    }

    buildSliderRow(container, { label, min, max, step, value, format, onChange }) {
        const row = document.createElement('div');
        row.className = 'settings-modal__row';

        const labelEl = document.createElement('label');
        labelEl.className = 'settings-modal__label';
        labelEl.textContent = label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'settings-modal__slider';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        slider.setAttribute('aria-label', label);

        const valueEl = document.createElement('span');
        valueEl.className = 'settings-modal__value';
        valueEl.textContent = format(Number(value));

        slider.addEventListener('input', () => {
            const next = Number(slider.value);
            valueEl.textContent = format(next);
            onChange(next);
        });

        row.appendChild(labelEl);
        row.appendChild(slider);
        row.appendChild(valueEl);
        container.appendChild(row);

        return slider;
    }

    handleReset() {
        if (!this._resetArmed) {
            this._resetArmed = true;
            this.resetBtn.textContent = '确认恢复？';
            this.resetBtn.classList.add('danger');
            this._resetTimer = setTimeout(() => this.disarmReset(), 3000);
            return;
        }

        this.disarmReset();
        preferencesManager.reset();
        this.syncFromPreferences();
    }

    disarmReset() {
        this._resetArmed = false;
        clearTimeout(this._resetTimer);
        this._resetTimer = null;
        this.resetBtn.textContent = '恢复默认';
        this.resetBtn.classList.remove('danger');
    }

    syncFromPreferences() {
        const prefs = preferencesManager.get();
        if (this.fontSizeSlider) {
            this.fontSizeSlider.value = prefs.fontSize;
            this.fontSizeSlider.dispatchEvent(new Event('input'));
        }
        if (this.lineHeightSlider) {
            this.lineHeightSlider.value = prefs.lineHeight;
            this.lineHeightSlider.dispatchEvent(new Event('input'));
        }
    }

    open() {
        this.themeSelect.value = themeManager.getTheme();
        this.syncFromPreferences();
        this.disarmReset();
        this.show();
    }

    show() {
        this.isVisible = true;
        this.overlay.classList.add('active');
    }

    hide() {
        this.isVisible = false;
        this.overlay.classList.remove('active');
        this.disarmReset();
    }
}

export const settingsModal = new SettingsModal();
