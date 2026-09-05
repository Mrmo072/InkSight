/**
 * ai-client - Unified chat completion entry over three wire protocols.
 * The renderer calls provider HTTPS APIs directly (no CSP restrictions and
 * no main-process proxy in this app).
 */

const REQUEST_TIMEOUT_MS = 60000;

function extractErrorMessage(payload, response) {
    const detail = payload?.error?.message
        || payload?.error?.msg
        || payload?.message
        || (Array.isArray(payload) ? payload[0]?.error?.message : null);
    if (detail) {
        return detail;
    }
    return `AI 请求失败（HTTP ${response.status}）`;
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
        throw new Error('AI 响应格式异常：缺少 choices[0].message.content');
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
        throw new Error('AI 响应格式异常：content 为空');
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
        throw new Error('AI 响应格式异常：candidates 为空');
    }
    return text.trim();
}

const ADAPTERS = {
    openai: chatOpenAI,
    anthropic: chatAnthropic,
    gemini: chatGemini
};

/**
 * Sends a chat completion request. `messages` is [{ role: 'user'|'assistant', content }].
 * Returns the assistant text; throws with a user-readable message on failure.
 */
export async function chatComplete(config, { system, messages }) {
    if (!config?.baseUrl || !config?.apiKey || !config?.model) {
        throw new Error('AI 接口尚未配置完整（需要 Base URL、API Key 和模型名）');
    }
    const adapter = ADAPTERS[config.protocol] || chatOpenAI;
    return adapter(config, { system, messages });
}
