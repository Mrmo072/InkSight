import { themeManager } from '../core/theme-manager.js';
import { preferencesManager } from '../core/preferences-manager.js';
import { aiConfigManager } from '../core/ai-config-manager.js';
import { chatComplete } from '../core/ai-client.js';
import { modalManager } from './modal-manager.js';
import { emitAppNotification } from './app-notifications.js';
import { resetWorkspace } from '../app/workspace-reset.js';

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
        this.body.appendChild(this.buildAiSection());
        this.body.appendChild(this.buildWorkspaceSection());

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

    buildWorkspaceSection() {
        const section = document.createElement('div');
        section.className = 'settings-modal__group';

        const heading = document.createElement('h4');
        heading.className = 'settings-modal__group-title';
        heading.textContent = '工作区';
        section.appendChild(heading);

        const hint = document.createElement('p');
        hint.className = 'settings-modal__hint';
        hint.textContent = '清空画布、标注、高亮、文档与图谱节点，并重置项目身份。下次启动将从一个空白工作区开始。';
        section.appendChild(hint);

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'modal-btn modal-btn-primary danger';
        resetBtn.textContent = '清空工作区…';
        resetBtn.onclick = () => this.handleWorkspaceReset();
        section.appendChild(resetBtn);

        return section;
    }

    async handleWorkspaceReset() {
        const confirmed = await modalManager.confirm({
            title: '清空工作区',
            message: '将删除当前工作区的全部内容：画布节点、标注卡片、高亮、已导入文档、图谱思考节点，并重置项目身份。此操作不可撤销，确定继续？',
            confirmLabel: '全部清空',
            cancelLabel: '取消',
            danger: true
        });
        if (!confirmed) {
            return;
        }

        try {
            resetWorkspace();
            emitAppNotification({ message: '工作区已清空，即将重新加载…', level: 'success' });
            setTimeout(() => window.location.reload(), 800);
        } catch (error) {
            emitAppNotification({ message: `清空失败：${error.message}`, level: 'error' });
        }
    }

    buildAiSection() {
        const presets = aiConfigManager.getPresets();
        const config = aiConfigManager.get();
        const section = document.createElement('div');
        section.className = 'settings-modal__group';

        const heading = document.createElement('h4');
        heading.className = 'settings-modal__group-title';
        heading.textContent = 'AI 接口';
        section.appendChild(heading);

        const buildRow = (labelText, control) => {
            const row = document.createElement('div');
            row.className = 'settings-modal__row';
            const label = document.createElement('label');
            label.className = 'settings-modal__label';
            label.textContent = labelText;
            row.appendChild(label);
            row.appendChild(control);
            section.appendChild(row);
            return row;
        };

        const buildInput = (placeholder, type = 'text') => {
            const input = document.createElement('input');
            input.type = type;
            input.className = 'settings-modal__input';
            input.placeholder = placeholder;
            input.spellcheck = false;
            return input;
        };

        // 厂商预设
        this.aiProviderSelect = document.createElement('select');
        this.aiProviderSelect.className = 'settings-modal__select';
        Object.entries(presets).forEach(([value, preset]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = preset.label;
            this.aiProviderSelect.appendChild(option);
        });
        this.aiProviderSelect.value = config.provider;
        buildRow('厂商', this.aiProviderSelect).classList.add('settings-modal__row--tall');
        this.aiProviderSelect.addEventListener('change', () => {
            const next = aiConfigManager.set({ provider: this.aiProviderSelect.value });
            this.syncAiSection(next);
        });

        // 接口协议（自定义时可改）
        this.aiProtocolSelect = document.createElement('select');
        this.aiProtocolSelect.className = 'settings-modal__select';
        [
            { value: 'openai', label: 'OpenAI 兼容' },
            { value: 'anthropic', label: 'Anthropic (Claude)' },
            { value: 'gemini', label: 'Google Gemini' }
        ].forEach(({ value, label }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            this.aiProtocolSelect.appendChild(option);
        });
        buildRow('协议', this.aiProtocolSelect).classList.add('settings-modal__row--tall');
        this.aiProtocolSelect.addEventListener('change', () => {
            aiConfigManager.set({ protocol: this.aiProtocolSelect.value });
        });

        // Base URL
        this.aiBaseUrlInput = buildInput('https://…（接口地址）');
        this.aiBaseUrlInput.value = config.baseUrl;
        buildRow('地址', this.aiBaseUrlInput).classList.add('settings-modal__row--tall');
        this.aiBaseUrlInput.addEventListener('change', () => {
            aiConfigManager.set({ baseUrl: this.aiBaseUrlInput.value });
        });

        // API Key
        this.aiApiKeyInput = buildInput('sk-…（密钥仅保存在本机）', 'password');
        this.aiApiKeyInput.value = config.apiKey;
        buildRow('API Key', this.aiApiKeyInput).classList.add('settings-modal__row--tall');
        this.aiApiKeyInput.addEventListener('change', () => {
            aiConfigManager.set({ apiKey: this.aiApiKeyInput.value });
        });

        // 模型名
        this.aiModelInput = buildInput('模型名，如 deepseek-chat');
        this.aiModelInput.value = config.model;
        buildRow('模型', this.aiModelInput).classList.add('settings-modal__row--tall');
        this.aiModelInput.addEventListener('change', () => {
            aiConfigManager.set({ model: this.aiModelInput.value });
        });

        // 测试连接
        const testRow = document.createElement('div');
        testRow.className = 'settings-modal__row';
        this.aiTestBtn = document.createElement('button');
        this.aiTestBtn.type = 'button';
        this.aiTestBtn.className = 'modal-btn';
        this.aiTestBtn.textContent = '测试连接';
        this.aiTestBtn.onclick = () => this.handleAiTest();
        testRow.appendChild(this.aiTestBtn);
        // 结果内联显示在弹窗内：全局通知会被设置弹窗的遮罩挡住
        this.aiTestStatus = document.createElement('span');
        this.aiTestStatus.className = 'settings-modal__test-status';
        testRow.appendChild(this.aiTestStatus);
        section.appendChild(testRow);

        return section;
    }

    syncAiSection(config) {
        if (this.aiProviderSelect) this.aiProviderSelect.value = config.provider;
        if (this.aiProtocolSelect) this.aiProtocolSelect.value = config.protocol;
        if (this.aiBaseUrlInput) this.aiBaseUrlInput.value = config.baseUrl;
        if (this.aiApiKeyInput) this.aiApiKeyInput.value = config.apiKey;
        if (this.aiModelInput) this.aiModelInput.value = config.model;
    }

    setAiTestStatus(message, state = '') {
        if (!this.aiTestStatus) {
            return;
        }
        this.aiTestStatus.textContent = message;
        this.aiTestStatus.classList.remove('is-pending', 'is-success', 'is-error');
        if (state) {
            this.aiTestStatus.classList.add(state);
        }
    }

    async handleAiTest() {
        const config = aiConfigManager.get();
        if (!config.baseUrl || !config.apiKey || !config.model) {
            this.setAiTestStatus('请先填写完整的接口地址、API Key 和模型名', 'is-error');
            return;
        }

        this.aiTestBtn.disabled = true;
        this.aiTestBtn.textContent = '测试中…';
        this.setAiTestStatus('正在连接接口…', 'is-pending');
        try {
            const reply = await chatComplete(config, {
                system: '你是连接测试助手，请只回复：连接成功',
                messages: [{ role: 'user', content: 'ping' }]
            });
            this.setAiTestStatus(`连接成功：${reply.slice(0, 40)}`, 'is-success');
        } catch (error) {
            this.setAiTestStatus(`连接失败：${error.message}`, 'is-error');
        } finally {
            this.aiTestBtn.disabled = false;
            this.aiTestBtn.textContent = '测试连接';
        }
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
