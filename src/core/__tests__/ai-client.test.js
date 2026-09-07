import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatComplete, chatStream } from '../ai-client.js';

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

function sseResponse(frames) {
    const encoder = new TextEncoder();
    let index = 0;
    return {
        ok: true,
        status: 200,
        body: {
            getReader() {
                return {
                    read() {
                        if (index < frames.length) {
                            return Promise.resolve({ done: false, value: encoder.encode(frames[index++]) });
                        }
                        return Promise.resolve({ done: true, value: undefined });
                    }
                };
            }
        }
    };
}

describe('ai-client', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        localStorage.setItem('inksight:locale', 'zh-CN');
    });

    it('throws when the config is incomplete', async () => {
        await expect(chatComplete({ protocol: 'openai', baseUrl: '', apiKey: '', model: '' }, { messages: [] }))
            .rejects.toThrow('AI 接口尚未配置完整');
    });

    it('localizes client-side errors using the active app language', async () => {
        localStorage.setItem('inksight:locale', 'en-US');

        await expect(chatComplete({ protocol: 'openai', baseUrl: '', apiKey: '', model: '' }, { messages: [] }))
            .rejects.toThrow('AI API configuration is incomplete');
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

    it('streams OpenAI deltas and resolves the full text', async () => {
        const fetchMock = vi.fn().mockResolvedValue(sseResponse([
            'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"好"}}]}\n',
            'data: [DONE]\n\n'
        ]));
        vi.stubGlobal('fetch', fetchMock);

        const deltas = [];
        const text = await chatStream(OPENAI_CONFIG, {
            messages: [{ role: 'user', content: '问题' }],
            onDelta: (delta, full) => deltas.push([delta, full])
        });

        expect(text).toBe('你好');
        expect(deltas).toEqual([['你', '你'], ['好', '你好']]);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.example.com/v1/chat/completions');
        expect(JSON.parse(options.body).stream).toBe(true);
    });

    it('streams Anthropic content_block_delta events', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"流式"}}\n\n',
            'event: message_stop\ndata: {"type":"message_stop"}\n\n'
        ])));

        const text = await chatStream(ANTHROPIC_CONFIG, { messages: [{ role: 'user', content: '问题' }], onDelta: () => {} });
        expect(text).toBe('流式');
    });

    it('streams Gemini SSE parts and appends the key', async () => {
        const fetchMock = vi.fn().mockResolvedValue(sseResponse([
            'data: {"candidates":[{"content":{"parts":[{"text":"Gemini 流"}]}}]}\n\n'
        ]));
        vi.stubGlobal('fetch', fetchMock);

        const text = await chatStream(GEMINI_CONFIG, { messages: [{ role: 'user', content: '问题' }], onDelta: () => {} });
        expect(text).toBe('Gemini 流');
        expect(fetchMock.mock.calls[0][0]).toContain(':streamGenerateContent?alt=sse&key=gm-test');
    });

    it('surfaces provider errors on a streaming response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ error: { message: '密钥无效' } })
        }));
        await expect(chatStream(OPENAI_CONFIG, { messages: [], onDelta: () => {} })).rejects.toThrow('密钥无效');
    });
});
