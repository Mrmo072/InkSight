import { beforeEach, describe, expect, it } from 'vitest';
import {
    getLocale,
    localizeDocument,
    LOCALE_STORAGE_KEY,
    normalizeLocale,
    setLocale,
    t
} from '../index.js';

describe('application i18n', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
    });

    it('normalizes supported Chinese variants and falls back to English', () => {
        expect(normalizeLocale('zh-Hans-CN')).toBe('zh-CN');
        expect(normalizeLocale('en-GB')).toBe('en-US');
        expect(normalizeLocale('fr-FR')).toBe('en-US');
    });

    it('persists the app locale and keeps the Drawnix locale in sync', () => {
        setLocale('zh-CN');

        expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN');
        expect(localStorage.getItem('language')).toBe('zh');
        expect(getLocale()).toBe('zh-CN');
        expect(document.documentElement.lang).toBe('zh-CN');
    });

    it('translates messages, parameters, text, and accessible attributes', () => {
        localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN');
        document.body.innerHTML = `
            <button data-i18n="app.settings" data-i18n-title="app.settings" title="Settings">Settings</button>
            <input data-i18n-placeholder="app.searchPlaceholder" placeholder="Search documents, cards, and highlights">
        `;

        localizeDocument();

        expect(document.querySelector('button').textContent).toBe('设置');
        expect(document.querySelector('button').title).toBe('设置');
        expect(document.querySelector('input').placeholder).toBe('搜索文档、卡片和高亮');
        expect(t('ai.failed', { message: 'timeout' })).toBe('连接失败：timeout');
    });
});
