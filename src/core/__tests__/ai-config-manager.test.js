import { beforeEach, describe, expect, it } from 'vitest';
import { aiConfigManager, PROVIDER_PRESETS } from '../ai-config-manager.js';

describe('AIConfigManager', () => {
    beforeEach(() => {
        localStorage.clear();
        aiConfigManager.init();
    });

    it('initializes with the DeepSeek preset defaults', () => {
        const config = aiConfigManager.get();
        expect(config.provider).toBe('deepseek');
        expect(config.protocol).toBe('openai');
        expect(config.baseUrl).toBe('https://api.deepseek.com');
        expect(config.model).toBe('deepseek-chat');
        expect(config.apiKey).toBe('');
    });

    it('switching provider applies the preset endpoint and model', () => {
        aiConfigManager.set({ provider: 'anthropic' });
        const config = aiConfigManager.get();
        expect(config.protocol).toBe('anthropic');
        expect(config.baseUrl).toBe('https://api.anthropic.com');
        expect(config.model).toContain('claude');
    });

    it('persists config to localStorage and restores on init', () => {
        aiConfigManager.set({ provider: 'custom', protocol: 'openai', baseUrl: 'https://my.api.com/v1/', apiKey: 'sk-mine', model: 'my-model' });

        expect(JSON.parse(localStorage.getItem('inksight:ai-config'))).toMatchObject({ provider: 'custom', apiKey: 'sk-mine' });

        aiConfigManager.init();
        const config = aiConfigManager.get();
        // Trailing slash is stripped, values restored.
        expect(config.baseUrl).toBe('https://my.api.com/v1');
        expect(config.apiKey).toBe('sk-mine');
        expect(config.model).toBe('my-model');
    });

    it('keeps the API key in memory only when device persistence is disabled', () => {
        aiConfigManager.set({ apiKey: 'sk-session', rememberApiKey: false });

        expect(aiConfigManager.get().apiKey).toBe('sk-session');
        expect(JSON.parse(localStorage.getItem('inksight:ai-config'))).toMatchObject({
            apiKey: '',
            rememberApiKey: false
        });

        aiConfigManager.init();
        expect(aiConfigManager.get().apiKey).toBe('');
        expect(aiConfigManager.get().rememberApiKey).toBe(false);
    });

    it('clears a remembered API key without resetting provider settings', () => {
        aiConfigManager.set({ provider: 'custom', baseUrl: 'https://my.api.com/v1', apiKey: 'sk-remove', model: 'my-model' });
        aiConfigManager.clearApiKey();

        expect(aiConfigManager.get()).toMatchObject({
            provider: 'custom',
            baseUrl: 'https://my.api.com/v1',
            apiKey: '',
            model: 'my-model'
        });
        expect(JSON.parse(localStorage.getItem('inksight:ai-config')).apiKey).toBe('');
    });

    it('routes persistence through the encrypted main-process store when available', () => {
        const saved = [];
        window.electronAPI = {
            aiConfigLoad: vi.fn().mockResolvedValue({ success: true, config: null }),
            aiConfigSave: vi.fn().mockImplementation((config) => {
                saved.push(config);
                return Promise.resolve({ success: true, encrypted: true });
            })
        };
        try {
            aiConfigManager.init();
            aiConfigManager.set({ apiKey: 'sk-secure' });

            expect(saved.at(-1)).toMatchObject({ apiKey: 'sk-secure' });
            expect(localStorage.getItem('inksight:ai-config')).toBeNull();
        } finally {
            delete window.electronAPI;
            localStorage.clear();
        }
    });

    it('migrates a plaintext localStorage key into secure storage and removes it', async () => {
        localStorage.setItem('inksight:ai-config', JSON.stringify({ provider: 'custom', apiKey: 'sk-legacy' }));
        const saved = [];
        window.electronAPI = {
            aiConfigLoad: vi.fn().mockResolvedValue({ success: true, config: null }),
            aiConfigSave: vi.fn().mockImplementation((config) => {
                saved.push(config);
                return Promise.resolve({ success: true });
            })
        };
        try {
            aiConfigManager.init();

            await vi.waitFor(() => expect(saved.length).toBeGreaterThan(0));
            expect(saved.at(-1)).toMatchObject({ apiKey: 'sk-legacy' });
            expect(localStorage.getItem('inksight:ai-config')).toBeNull();
            expect(aiConfigManager.get().apiKey).toBe('sk-legacy');
        } finally {
            delete window.electronAPI;
            localStorage.clear();
        }
    });

    it('ignores invalid protocol values', () => {
        aiConfigManager.set({ protocol: 'hacker' });
        expect(aiConfigManager.get().protocol).toBe('openai');
    });

    it('reports configured state only when complete', () => {
        expect(aiConfigManager.isConfigured()).toBe(false);
        aiConfigManager.set({ apiKey: 'sk-1' });
        expect(aiConfigManager.isConfigured()).toBe(true);
    });

    it('notifies subscribers on change', () => {
        const listener = vi.fn();
        const unsubscribe = aiConfigManager.subscribe(listener);
        aiConfigManager.set({ apiKey: 'sk-x' });
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-x' }));
        unsubscribe();
    });

    it('exposes presets for every supported provider', () => {
        for (const key of ['deepseek', 'kimi', 'qwen', 'zhipu', 'openai', 'openrouter', 'anthropic', 'gemini', 'custom']) {
            expect(PROVIDER_PRESETS[key]).toBeTruthy();
        }
    });
});
