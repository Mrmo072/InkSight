import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatComplete } from '../ai-client.js';

const OPENAI_CONFIG = { protocol: 'openai', baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'test-model' };
const ANTHROPIC_CONFIG = { protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'ak-test', model: 'claude-test' };
const GEMINI_CONFIG = { protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'gm-test', model: 'gemini-test' };

function jsonResponse(body, ok = true, status = 200) {
    return {
        ok,
        status,
        json: async () => body
    };
}

describe('ai-client', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('throws when the config is incomplete', async () => {
        await expect(chatComplete({ protocol: 'openai', baseUrl: '', apiKey: '', model: '' }, { messages: [] }))
            .rejects.toThrow('AI 接口尚未配置完整');
    });

    it('rejects unknown protocol by falling back to OpenAI adapter', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'hi' } }] }));
        vi.stubGlobal('fetch', fetchMock);

        const text = await chatComplete({ ...OPENAI_CONFIG, protocol: 'unknown' }, { messages: [{ role: 'user', content: 'hi' }] });
        expect(text).toBe('hi');
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions');
    });

    it('sends OpenAI-compatible chat completions with bearer auth', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: ' 答案 ' } }] }));
        vi.stubGlobal('fetch', fetchMock);

        const text = await chatComplete(OPENAI_CONFIG, {
            system: '你是助手',
            messages: [{ role: 'user', content: '问题' }]
        });

        expect(text).toBe('答案');
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.example.com/v1/chat/completions');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer sk-test');
        const body = JSON.parse(options.body);
        expect(body.model).toBe('test-model');
        expect(body.messages[0]).toEqual({ role: 'system', content: '你是助手' });
        expect(body.messages[1]).toEqual({ role: 'user', content: '问题' });
    });

    it('surfaces provider error messages (OpenAI shape)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { message: '配额不足' } }, false, 429)));
        await expect(chatComplete(OPENAI_CONFIG, { messages: [] })).rejects.toThrow('配额不足');
    });

    it('sends Anthropic messages with x-api-key and parses text blocks', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            content: [{ type: 'text', text: '克' }, { type: 'text', text: '答案' }]
        }));
        vi.stubGlobal('fetch', fetchMock);

        const text = await chatComplete(ANTHROPIC_CONFIG, {
            system: '系统提示',
            messages: [{ role: 'user', content: '问题' }]
        });

        expect(text).toBe('克答案');
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.anthropic.com/v1/messages');
        expect(options.headers['x-api-key']).toBe('ak-test');
        const body = JSON.parse(options.body);
        expect(body.system).toBe('系统提示');
        expect(body.messages).toEqual([{ role: 'user', content: '问题' }]);
    });

    it('maps assistant role to model role for Gemini and appends the key', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            candidates: [{ content: { parts: [{ text: 'Gemini 回答' }] } }]
        }));
        vi.stubGlobal('fetch', fetchMock);

        const text = await chatComplete(GEMINI_CONFIG, {
            system: '系统提示',
            messages: [
                { role: 'user', content: '问' },
                { role: 'assistant', content: '答' },
                { role: 'user', content: '再问' }
            ]
        });

        expect(text).toBe('Gemini 回答');
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toContain('/v1beta/models/gemini-test:generateContent?key=gm-test');
        const body = JSON.parse(options.body);
        expect(body.systemInstruction.parts[0].text).toBe('系统提示');
        expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    });

    it('throws a readable error on HTTP failure without JSON body', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('bad json'); } }));
        await expect(chatComplete(OPENAI_CONFIG, { messages: [] })).rejects.toThrow('HTTP 502');
    });
});
