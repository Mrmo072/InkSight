import DOMPurify from 'dompurify';
import { marked } from 'marked';

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

export function isSafeExternalUrl(value, baseUrl = globalThis.location?.href || 'https://localhost/') {
    try {
        return SAFE_EXTERNAL_PROTOCOLS.has(new URL(value, baseUrl).protocol);
    } catch {
        return false;
    }
}

export function sanitizeHtml(html) {
    const sanitized = DOMPurify.sanitize(String(html || ''), {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'],
        FORBID_ATTR: ['style'],
        SANITIZE_NAMED_PROPS: true
    });
    const template = document.createElement('template');
    template.innerHTML = sanitized;
    template.content.querySelectorAll('a').forEach((anchor) => {
        if (!isSafeExternalUrl(anchor.getAttribute('href'))) {
            anchor.removeAttribute('href');
        }
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
    });
    return template.innerHTML;
}

export function renderSafeMarkdown(markdown) {
    return sanitizeHtml(marked.parse(String(markdown || '')));
}
