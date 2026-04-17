import { getAppContext } from './app-context.js';
import { emitAppNotification } from '../ui/app-notifications.js';

function sanitizeFileNameSegment(value, fallback = 'workspace') {
    const normalized = String(value || '').trim().replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-');
    const collapsed = normalized.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return collapsed || fallback;
}

function getCardsCollection(cardSystem) {
    if (cardSystem?.cards instanceof Map) {
        return Array.from(cardSystem.cards.values());
    }

    return Object.values(cardSystem?.cards || {});
}

function getDocumentsCollection(appContext) {
    const registered = appContext.documentManager?.getAllDocuments?.() ?? [];
    return registered.map((document) => ({
        id: document.id,
        name: document.name || 'Untitled document',
        type: document.type || 'unknown',
        loaded: document.loaded !== false
    }));
}

function formatLocation(highlight = {}) {
    const location = highlight.location || {};
    if (Number.isFinite(location.page)) {
        return `Page ${location.page}`;
    }
    if (location.cfi) {
        return `CFI ${location.cfi}`;
    }
    if (Number.isFinite(location.index)) {
        return `Offset ${location.index}`;
    }
    return 'Location unavailable';
}

function deriveCardTitle(card) {
    const source = String(card.note || card.content || 'Untitled card').trim();
    const firstLine = source.split(/\r?\n/, 1)[0].trim();
    return firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
}

function buildGraphData(cards, connections = []) {
    const adjacency = new Map();
    const inbound = new Set();
    const cardIds = new Set(cards.map((card) => card.id));

    cards.forEach((card) => adjacency.set(card.id, []));
    connections.forEach((connection) => {
        if (!cardIds.has(connection.sourceId) || !cardIds.has(connection.targetId)) {
            return;
        }

        adjacency.get(connection.sourceId)?.push(connection.targetId);
        inbound.add(connection.targetId);
    });

    const roots = cards.filter((card) => adjacency.get(card.id)?.length && !inbound.has(card.id));
    const looseCards = cards.filter((card) => !adjacency.get(card.id)?.length && !inbound.has(card.id));

    return { adjacency, roots, looseCards };
}

function renderCardTree(card, cardMap, adjacency, depth = 0, visited = new Set()) {
    if (visited.has(card.id)) {
        return [];
    }

    visited.add(card.id);
    const lines = [];
    const indent = '  '.repeat(depth);
    lines.push(`${indent}- ${deriveCardTitle(card)}`);

    if (card.content && card.content.trim() && card.content.trim() !== deriveCardTitle(card)) {
        lines.push(`${indent}  - Excerpt: ${card.content.trim()}`);
    }
    if (card.note?.trim()) {
        lines.push(`${indent}  - Note: ${card.note.trim()}`);
    }
    if (card.sourceName) {
        lines.push(`${indent}  - Source: ${card.sourceName}`);
    }

    (adjacency.get(card.id) || []).forEach((childId) => {
        const child = cardMap.get(childId);
        if (child) {
            lines.push(...renderCardTree(child, cardMap, adjacency, depth + 1, visited));
        }
    });

    return lines;
}

function buildCitationEntries(appContext = getAppContext()) {
    const cards = getCardsCollection(appContext.cardSystem);
    const cardsByHighlightId = new Map(cards.filter((card) => card.highlightId).map((card) => [card.highlightId, card]));

    return (appContext.highlightManager?.highlights || []).map((highlight) => {
        const linkedCard = cardsByHighlightId.get(highlight.id) || null;
        return {
            id: highlight.id,
            text: highlight.text || '',
            sourceName: highlight.sourceName || appContext.documentManager?.getDocumentInfo?.(highlight.sourceId)?.name || 'Unknown source',
            locationLabel: formatLocation(highlight),
            cardTitle: linkedCard ? deriveCardTitle(linkedCard) : null,
            needsValidation: Boolean(highlight.needsValidation)
        };
    });
}

export function buildMarkdownOutline(appContext = getAppContext()) {
    const cards = getCardsCollection(appContext.cardSystem);
    const connections = Array.isArray(appContext.cardSystem?.connections) ? appContext.cardSystem.connections : [];
    const cardMap = new Map(cards.map((card) => [card.id, card]));
    const { adjacency, roots, looseCards } = buildGraphData(cards, connections);
    const visited = new Set();
    const lines = ['# Markdown Outline', ''];

    if (!cards.length) {
        lines.push('No cards are available in the current workspace.');
        return lines.join('\n');
    }

    lines.push('## Connected Map', '');
    const rootCards = roots.length ? roots : cards.filter((card) => adjacency.get(card.id)?.length);
    rootCards.forEach((card) => {
        lines.push(...renderCardTree(card, cardMap, adjacency, 0, visited));
    });

    const unresolvedLoose = looseCards.filter((card) => !visited.has(card.id));
    if (unresolvedLoose.length) {
        lines.push('', '## Loose Cards', '');
        unresolvedLoose.forEach((card) => {
            lines.push(`- ${deriveCardTitle(card)}`);
            if (card.content?.trim()) {
                lines.push(`  - Excerpt: ${card.content.trim()}`);
            }
            if (card.note?.trim()) {
                lines.push(`  - Note: ${card.note.trim()}`);
            }
            if (card.sourceName) {
                lines.push(`  - Source: ${card.sourceName}`);
            }
        });
    }

    return lines.join('\n');
}

export function buildCitationList(appContext = getAppContext()) {
    const entries = buildCitationEntries(appContext);
    const lines = ['# Citation List', ''];

    if (!entries.length) {
        lines.push('No highlights are available in the current workspace.');
        return lines.join('\n');
    }

    entries.forEach((entry, index) => {
        lines.push(`${index + 1}. ${entry.text || '[Empty highlight]'}`);
        lines.push(`   - Source: ${entry.sourceName}`);
        lines.push(`   - Location: ${entry.locationLabel}`);
        if (entry.cardTitle) {
            lines.push(`   - Linked card: ${entry.cardTitle}`);
        }
        if (entry.needsValidation) {
            lines.push(`   - Status: Needs validation`);
        }
    });

    return lines.join('\n');
}

export function buildReadingNotesPackage(appContext = getAppContext()) {
    const cards = getCardsCollection(appContext.cardSystem);
    const documents = getDocumentsCollection(appContext);
    const citations = buildCitationEntries(appContext);
    const unmappedCards = cards.filter((card) => !card.isOnBoard);
    const lines = ['# Reading Notes Package', ''];

    lines.push('## Project Overview', '');
    lines.push(`- Documents: ${documents.length}`);
    lines.push(`- Cards: ${cards.length}`);
    lines.push(`- Highlights: ${citations.length}`);
    lines.push('');

    lines.push('## Documents', '');
    if (documents.length) {
        documents.forEach((document) => {
            lines.push(`- ${document.name} (${document.type})${document.loaded ? '' : ' - missing source'}`);
        });
    } else {
        lines.push('No documents are loaded.');
    }

    lines.push('', buildMarkdownOutline(appContext), '', buildCitationList(appContext), '', '## Unmapped Notes', '');
    if (unmappedCards.length) {
        unmappedCards.forEach((card) => {
            lines.push(`- ${deriveCardTitle(card)}`);
            if (card.note?.trim()) {
                lines.push(`  - Note: ${card.note.trim()}`);
            }
            if (card.sourceName) {
                lines.push(`  - Source: ${card.sourceName}`);
            }
        });
    } else {
        lines.push('No unmapped notes.');
    }

    return lines.join('\n');
}

function downloadMarkdown(content, fileName) {
    const blob = new Blob([content], {
        type: 'text/markdown;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}.md`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function countWorkspaceContent(appContext) {
    return {
        documents: getDocumentsCollection(appContext).length,
        cards: getCardsCollection(appContext.cardSystem).length,
        highlights: (appContext.highlightManager?.highlights || []).length
    };
}

export function exportWorkspaceArtifact({
    type,
    appContext = getAppContext(),
    notify = emitAppNotification
} = {}) {
    const counts = countWorkspaceContent(appContext);
    if (counts.documents === 0 && counts.cards === 0 && counts.highlights === 0) {
        notify?.({
            title: 'Export Skipped',
            message: 'There is no workspace content to export yet.',
            level: 'warning'
        });
        return false;
    }

    const projectName = sanitizeFileNameSegment(appContext.currentBook?.name || 'inksight-workspace');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const artifactBuilders = {
        outline: {
            label: 'Markdown Outline',
            fileSuffix: 'outline',
            build: () => buildMarkdownOutline(appContext)
        },
        citations: {
            label: 'Citation List',
            fileSuffix: 'citations',
            build: () => buildCitationList(appContext)
        },
        'notes-package': {
            label: 'Reading Notes Package',
            fileSuffix: 'notes-package',
            build: () => buildReadingNotesPackage(appContext)
        }
    };

    const artifact = artifactBuilders[type];
    if (!artifact) {
        return false;
    }

    downloadMarkdown(artifact.build(), `${projectName}-${artifact.fileSuffix}-${timestamp}`);
    notify?.({
        title: 'Export Ready',
        message: `${artifact.label} was exported as a UTF-8 Markdown file.`,
        level: 'success'
    });
    return true;
}
