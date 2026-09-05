/**
 * AIConfigManager - LLM API configuration (provider preset, endpoint, key, model).
 * Single active config, persisted to localStorage. Same singleton pattern as
 * PreferencesManager.
 */

const STORAGE_KEY = 'inksight:ai-config';

const PROTOCOLS = Object.freeze(['openai', 'anthropic', 'gemini']);

/**
 * Built-in provider presets. `protocol` selects the request adapter; most
 * Chinese providers expose an OpenAI-compatible chat completions endpoint.
 */
const PROVIDER_PRESETS = Object.freeze({
    deepseek: { label: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
    kimi: { label: 'Kimi（月之暗面）', protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    qwen: { label: '通义千问', protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    zhipu: { label: '智谱 GLM', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4' },
    openai: { label: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    openrouter: { label: 'OpenRouter', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: '' },
    anthropic: { label: 'Claude（Anthropic）', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
    gemini: { label: 'Google Gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash' },
    custom: { label: '自定义接口', protocol: 'openai', baseUrl: '', model: '' }
});

const DEFAULT_CONFIG = Object.freeze({
    provider: 'deepseek',
    protocol: 'openai',
    baseUrl: PROVIDER_PRESETS.deepseek.baseUrl,
    apiKey: '',
    model: PROVIDER_PRESETS.deepseek.model
});

function sanitizeString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

class AIConfigManager {
    constructor() {
        this.config = { ...DEFAULT_CONFIG };
        this.listeners = new Set();
        this.STORAGE_KEY = STORAGE_KEY;
        this.PROVIDER_PRESETS = PROVIDER_PRESETS;
        this.PROTOCOLS = PROTOCOLS;
        this.init();
    }

    init() {
        this.config = { ...DEFAULT_CONFIG };
        try {
            const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.STORAGE_KEY) : null;
            if (stored) {
                const parsed = JSON.parse(stored);
                this.config = {
                    provider: sanitizeString(parsed?.provider, DEFAULT_CONFIG.provider),
                    protocol: PROTOCOLS.includes(parsed?.protocol) ? parsed.protocol : DEFAULT_CONFIG.protocol,
                    baseUrl: sanitizeString(parsed?.baseUrl, DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ''),
                    apiKey: sanitizeString(parsed?.apiKey),
                    model: sanitizeString(parsed?.model, DEFAULT_CONFIG.model)
                };
            }
        } catch {
            this.config = { ...DEFAULT_CONFIG };
        }
    }
    get() {
        return { ...this.config };
    }

    getPresets() {
        return PROVIDER_PRESETS;
    }

    isConfigured() {
        const { baseUrl, apiKey, model } = this.config;
        return Boolean(baseUrl && apiKey && model);
    }

    set(patch) {
        const next = { ...this.config };

        if (patch?.provider !== undefined && PROVIDER_PRESETS[patch.provider]) {
            next.provider = patch.provider;
            // Switching provider applies the preset defaults for unset fields.
            const preset = PROVIDER_PRESETS[patch.provider];
            next.protocol = preset.protocol;
            next.baseUrl = preset.baseUrl;
            next.model = preset.model || next.model;
        }
        if (patch?.protocol !== undefined && PROTOCOLS.includes(patch.protocol)) {
            next.protocol = patch.protocol;
        }
        if (patch?.baseUrl !== undefined) {
            next.baseUrl = sanitizeString(patch.baseUrl).replace(/\/+$/, '');
        }
        if (patch?.apiKey !== undefined) {
            next.apiKey = sanitizeString(patch.apiKey);
        }
        if (patch?.model !== undefined) {
            next.model = sanitizeString(patch.model).trim();
        }

        const changed = Object.keys(next).some((key) => next[key] !== this.config[key]);
        if (!changed) {
            return this.get();
        }

        this.config = next;
        this.persist();
        this.listeners.forEach((fn) => fn(this.get()));
        return this.get();
    }

    persist() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
        } catch {
            // Ignore persistence failures — session config still applies.
        }
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.unsubscribe(callback);
    }

    unsubscribe(callback) {
        this.listeners.delete(callback);
    }
}

export const aiConfigManager = new AIConfigManager();
export { DEFAULT_CONFIG, PROVIDER_PRESETS, PROTOCOLS };
