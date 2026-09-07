import { t } from '../i18n/index.js';

/**
 * ai-client - Unified chat completion entry over three wire protocols.
 * The renderer calls provider HTTPS APIs directly (no CSP restrictions and
 * no main-process proxy in this app).
 */

const REQUEST_TIMEOUT_MS = 60000;
// Streaming responses can legitimately last minutes; the timeout guards
// against a stalled connection, so it resets on every received chunk.
const STREAM_IDLE_TIMEOUT_MS = 60000;

function extractErrorMessage(payload, response) {
    const detail = payload?.error?.message
        || payload?.error?.msg
        || payload?.message
        || (Array.isArray(payload) ? payload[0]?.error?.message : null);
    if (detail) {
        return detail;
    }
    return t('ai.error.http', { status: response.status });
}

async function requestJson(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        let payload = null;
        try {
            payload = await response.json();
        } catch {
            // Non-JSON error body — fall through to status handling.
        }
        if (!response.ok) {
            throw new Error(extractErrorMessage(payload, response));
        }
        return payload;
    } finally {
        clearTimeout(timer);
    }
}

function joinUrl(baseUrl, path) {
    return `${(baseUrl || '').replace(/\/+$/, '')}${path}`;
}

async function chatOpenAI(config, { system, messages }) {
    const payload = await requestJson(joinUrl(config.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: system ? [{ role: 'system', content: system }, ...messages] : messages
        })
    });
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
        throw new Error(t('ai.error.openaiContent'));
    }
    return content.trim();
}

async function chatAnthropic(config, { system, messages }) {
    const payload = await requestJson(joinUrl(config.baseUrl, '/v1/messages'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: 2048,
            system: system || undefined,
            messages
        })
    });
    const text = (payload?.content || [])
        .filter((block) => block?.type === 'text')
        .map((block) => block.text)
        .join('');
    if (!text) {
        throw new Error(t('ai.error.anthropicContent'));
    }
    return text.trim();
}

async function chatGemini(config, { system, messages }) {
    const contents = messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
    }));
    const url = joinUrl(config.baseUrl, `/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`);
    const payload = await requestJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents,
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {})
        })
    });
    const text = (payload?.candidates?.[0]?.content?.parts || [])
        .map((part) => part.text || '')
        .join('');
    if (!text) {
        throw new Error(t('ai.error.geminiContent'));
    }
    return text.trim();
}

const ADAPTERS = {
    openai: chatOpenAI,
    anthropic: chatAnthropic,
    gemini: chatGemini
};

/**
 * Reads an SSE response body and invokes `onData` with every `data:` payload.
 * The idle timer resets on each chunk so only a stalled connection aborts.
 */
async function requestSse(url, options, onData) {
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const resetIdleTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
    };
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) {
            let payload = null;
            try {
                payload = await response.json();
            } catch {
                // Non-JSON error body — fall through to status handling.
            }
            throw new Error(extractErrorMessage(payload, response));
        }
        if (!response.body) {
            throw new Error(t('ai.error.streamUnavailable'));
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            resetIdleTimer();
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                if (line.startsWith('data:')) {
                    onData(line.slice(5).trim());
                }
            }
        }
    } finally {
        clearTimeout(timer);
    }
}

function finishStreamText(text) {
    const trimmed = text.trim();
    if (!trimmed) {
        throw new Error(t('ai.error.streamEmpty'));
    }
    return trimmed;
}

async function streamOpenAI(config, { system, messages, onDelta }) {
    let full = '';
    await requestSse(joinUrl(config.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
            stream: true
        })
    }, (data) => {
        if (data === '[DONE]') {
            return;
        }
        try {
            const payload = JSON.parse(data);
            const delta = payload?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) {
                full += delta;
                onDelta(delta, full);
            }
        } catch {
            // Ignore keep-alive / malformed frames.
        }
    });
    return finishStreamText(full);
}

async function streamAnthropic(config, { system, messages, onDelta }) {
    let full = '';
    await requestSse(joinUrl(config.baseUrl, '/v1/messages'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: 2048,
            stream: true,
            system: system || undefined,
            messages
        })
    }, (data) => {
        try {
            const payload = JSON.parse(data);
            if (payload?.type === 'content_block_delta') {
                const delta = payload?.delta?.text;
                if (typeof delta === 'string' && delta) {
                    full += delta;
                    onDelta(delta, full);
                }
            } else if (payload?.type === 'error') {
                throw new Error(payload?.error?.message || t('ai.error.streamFailed'));
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                return;
            }
            throw error;
        }
    });
    return finishStreamText(full);
}

async function streamGemini(config, { system, messages, onDelta }) {
    let full = '';
    const contents = messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
    }));
    const url = joinUrl(config.baseUrl, `/v1beta/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`);
    await requestSse(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents,
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {})
        })
    }, (data) => {
        try {
            const payload = JSON.parse(data);
            const delta = (payload?.candidates?.[0]?.content?.parts || [])
                .map((part) => part.text || '')
                .join('');
            if (delta) {
                full += delta;
                onDelta(delta, full);
            }
        } catch {
            // Ignore keep-alive / malformed frames.
        }
    });
    return finishStreamText(full);
}

const STREAM_ADAPTERS = {
    openai: streamOpenAI,
    anthropic: streamAnthropic,
    gemini: streamGemini
};

/**
 * Sends a chat completion request. `messages` is [{ role: 'user'|'assistant', content }].
 * Returns the assistant text; throws with a user-readable message on failure.
 */
export async function chatComplete(config, { system, messages }) {
    if (!config?.baseUrl || !config?.apiKey || !config?.model) {
        throw new Error(t('ai.error.incomplete'));
    }
    const adapter = ADAPTERS[config.protocol] || chatOpenAI;
    return adapter(config, { system, messages });
}

/**
 * Streaming variant of chatComplete. `onDelta(deltaText, fullText)` fires as
 * tokens arrive; the resolved value is the complete assistant text.
 */
export async function chatStream(config, { system, messages, onDelta }) {
    if (!config?.baseUrl || !config?.apiKey || !config?.model) {
        throw new Error(t('ai.error.incomplete'));
    }
    if (typeof onDelta !== 'function') {
        return chatComplete(config, { system, messages });
    }
    const adapter = STREAM_ADAPTERS[config.protocol] || streamOpenAI;
    return adapter(config, { system, messages, onDelta });
}
