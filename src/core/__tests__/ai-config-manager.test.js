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
