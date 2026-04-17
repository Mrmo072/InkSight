import { getVisibleDocuments } from './file-library.js';
import { getAppContext } from './app-context.js';

function normalizeQuery(value) {
    return String(value ?? '').trim().toLowerCase();
}

function tokenize(value) {
    return normalizeQuery(value).split(/\s+/).filter(Boolean);
}

function createExcerpt(text, query) {
    const source = String(text ?? '').trim();
    if (!source) {
        return '';
    }

    const normalizedSource = source.toLowerCase();
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
        return source.slice(0, 120);
    }

    const matchIndex = normalizedSource.indexOf(normalizedQuery);
    if (matchIndex < 0) {
        return source.slice(0, 120);
    }

    const start = Math.max(0, matchIndex - 32);
    const end = Math.min(source.length, matchIndex + normalizedQuery.length + 56);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < source.length ? '…' : '';
    return `${prefix}${source.slice(start, end)}${suffix}`;
}

function scoreMatch(haystack, query) {
    const normalized = normalizeQuery(haystack);
    const tokens = tokenize(query);
    if (!normalized || !tokens.length) {
        return 0;
    }

    let score = 0;
    for (const token of tokens) {
        if (normalized === token) {
            score += 120;
            continue;
        }
        if (normalized.startsWith(token)) {
            score += 90;
            continue;
        }
        const index = normalized.indexOf(token);
        if (index >= 0) {
            score += Math.max(30, 70 - index);
        }
    }

    return score;
}

function buildDocumentResults(files, appContext) {
    const visibleDocuments = getVisibleDocuments(files, appContext.documentManager);
    return visibleDocuments.map((document) => ({
        type: 'document',
        id: document.id,
        title: document.name,
        excerpt: document.loaded
            ? `${document.type || 'Unknown file type'}`
            : 'Source file missing - import to relink',
        sourceId: document.id,
        loaded: document.loaded,
        actionPayload: {
            documentId: document.id
        },
        searchableText: [document.name, document.type, document.loaded ? 'loaded' : 'missing'].filter(Boolean).join(' ')
    }));
}

function buildCardResults(appContext) {
    const cards = appContext.cardSystem?.cards instanceof Map
        ? Array.from(appContext.cardSystem.cards.values())
        : Object.values(appContext.cardSystem?.cards || {});

    return cards
        .filter((card) => !card.deleted)
        .map((card) => ({
            type: 'card',
            id: card.id,
            title: card.content || card.note || 'Untitled card',
            excerpt: card.note || card.content || '',
            sourceId: card.sourceId,
            actionPayload: {
                cardId: card.id,
                sourceId: card.sourceId,
                highlightId: card.highlightId || null
            },
            searchableText: [card.content, card.note, card.sourceName].filter(Boolean).join(' ')
        }));
}

function buildHighlightResults(appContext) {
    const highlights = Array.isArray(appContext.highlightManager?.highlights)
        ? appContext.highlightManager.highlights
        : [];

    return highlights.map((highlight) => ({
        type: 'highlight',
        id: highlight.id,
        title: highlight.text || 'Untitled highlight',
        excerpt: highlight.text || '',
        sourceId: highlight.sourceId,
        actionPayload: {
            highlightId: highlight.id,
            sourceId: highlight.sourceId
        },
        searchableText: [highlight.text, highlight.sourceName].filter(Boolean).join(' ')
    }));
}

function getTypePriority(type) {
    return {
        document: 3,
        card: 2,
        highlight: 1
    }[type] ?? 0;
}

export function buildWorkspaceSearchIndex(appContext = getAppContext(), files = []) {
    return [
        ...buildDocumentResults(files, appContext),
        ...buildCardResults(appContext),
        ...buildHighlightResults(appContext)
    ];
}

export function queryWorkspaceSearch(index = [], query) {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
        return [];
    }

    return index
        .map((entry) => {
            const score = Math.max(
                scoreMatch(entry.title, normalizedQuery),
                scoreMatch(entry.searchableText, normalizedQuery)
            );

            if (score <= 0) {
                return null;
            }

            return {
                ...entry,
                excerpt: createExcerpt(entry.excerpt || entry.searchableText, normalizedQuery),
                score
            };
        })
        .filter(Boolean)
        .sort((left, right) =>
            right.score - left.score ||
            getTypePriority(right.type) - getTypePriority(left.type) ||
            left.title.localeCompare(right.title)
        );
}
