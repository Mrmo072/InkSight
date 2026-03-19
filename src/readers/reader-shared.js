import { highlightManager } from '../core/highlight-manager.js';
import { PDFHighlightToolbar } from './pdf-highlight-toolbar.jsx';
import { registerEventListeners } from '../app/event-listeners.js';

export function findCardIdByHighlightId(cardSystem, highlightId) {
    if (!highlightId || !cardSystem?.cards) {
        return null;
    }

    const cards = cardSystem.cards instanceof Map
        ? cardSystem.cards.values()
        : Object.values(cardSystem.cards);

    for (const card of cards) {
        if (card.highlightId === highlightId) {
            return card.id;
        }
    }

    return null;
}

export function emitHighlightColorUpdated(highlightId, color) {
    window.dispatchEvent(new CustomEvent('highlight-updated', {
        detail: { id: highlightId, color }
    }));
}

export function updateHighlightModelColor(highlightId, color) {
    const highlight = highlightManager.getHighlight(highlightId);
    if (!highlight) {
        return null;
    }

    highlight.color = color;
    emitHighlightColorUpdated(highlightId, color);
    return highlight;
}

export function createReaderHighlightToolbar(container, handlers) {
    return new PDFHighlightToolbar(container, {
        onDeleteHighlight: (highlightId, cardId) => {
            handlers.onDeleteHighlight(highlightId, cardId);
        },
        onUpdateColor: (highlightId, color) => {
            handlers.onUpdateColor(highlightId, color);
        }
    });
}

export function clearSelectedHighlightState(reader, highlightId = reader.selectedHighlightId) {
    if (highlightId && reader.selectedHighlightId !== highlightId) {
        return;
    }

    reader.selectedHighlightId = null;
    reader.toolbar?.hide();
}

export function removeHighlightFromStores(cardSystem, highlightId, cardId) {
    if (cardId && cardSystem) {
        cardSystem.removeCard(cardId);
        return;
    }

    highlightManager.removeHighlight(highlightId);
}

export function deleteSelectedReaderHighlight(reader) {
    const highlightId = reader.selectedHighlightId;
    if (!highlightId) {
        return false;
    }

    const cardId = findCardIdByHighlightId(reader.getCardSystem?.(), highlightId);
    reader.deleteHighlight(highlightId, cardId);
    clearSelectedHighlightState(reader, highlightId);
    return true;
}

export function handleReaderHighlightClick(reader, event, highlightId, cardId, afterClick) {
    reader.selectedHighlightId = highlightId;
    reader.toolbar.handleHighlightClick(event, highlightId, cardId);
    afterClick?.({ highlightId, cardId });
}

export function registerHighlightToolbarDeletionHandler(reader, options = {}) {
    reader.handleKeyDown = (e) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') {
            return;
        }

        const selectedHighlightId = options.getSelectedHighlightId?.() ?? reader.selectedHighlightId;
        if (!selectedHighlightId) {
            return;
        }

        if (typeof options.beforeDelete === 'function' && options.beforeDelete(e) === false) {
            return;
        }

        const cardId = options.getSelectedCardId?.() ?? findCardIdByHighlightId(reader.getCardSystem?.(), selectedHighlightId);
        reader.deleteHighlight(selectedHighlightId, cardId);
        if (typeof options.afterDelete === 'function') {
            options.afterDelete(selectedHighlightId, cardId);
        } else {
            clearSelectedHighlightState(reader, selectedHighlightId);
        }
    };

    return reader.handleKeyDown;
}

export function registerBasicReaderListeners(reader, { onCardDeleted }) {
    reader.handleMindmapNodeUpdated = (e) => {
        const { highlightId, color } = e.detail;
        reader.updateHighlightColor(highlightId, color);
    };

    reader.handleCardDeleted = (e) => {
        const { highlightId, deleted } = e.detail;

        if (deleted && highlightId) {
            onCardDeleted(highlightId, e.detail);
            return;
        }

        if (!deleted && highlightId && typeof reader.handleCardRestoredHighlight === 'function') {
            reader.handleCardRestoredHighlight(highlightId, e.detail);
        }
    };

    reader.handleKeyDown = (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && reader.selectedHighlightId) {
            if (typeof reader.beforeDeleteSelectedHighlight === 'function') {
                reader.beforeDeleteSelectedHighlight(e);
            }
            deleteSelectedReaderHighlight(reader);
        }
    };

    reader.cleanupListeners = registerEventListeners([
        { target: window, event: 'mindmap-node-updated', handler: reader.handleMindmapNodeUpdated },
        { target: window, event: 'card-soft-deleted', handler: reader.handleCardDeleted },
        { target: document, event: 'keydown', handler: reader.handleKeyDown }
    ]);
}

export function applyReaderSelectionMode({
    container,
    mode,
    textCursor = 'text',
    panCursor = 'grab',
    otherCursor = 'default',
    textTouchAction = 'pan-x pan-y pinch-zoom',
    nonTextTouchAction = 'none',
    disableSelectionClass = true,
    targetElements = []
}) {
    const isTextMode = mode === 'text';
    const isPanMode = mode === 'pan';

    if (disableSelectionClass) {
        container.classList.toggle('disable-selection', !isTextMode);
    }

    container.style.cursor = isTextMode ? textCursor : (isPanMode ? panCursor : otherCursor);
    container.style.touchAction = isTextMode ? textTouchAction : nonTextTouchAction;

    targetElements.forEach((element) => {
        if (!element) {
            return;
        }

        element.style.userSelect = isTextMode ? 'text' : 'none';
        element.style.webkitUserSelect = isTextMode ? 'text' : 'none';
    });
}

export function createTouchSelectionScheduler(commitSelection, options = {}) {
    const initialDelay = options.initialDelay ?? 180;
    const settleDelay = options.settleDelay ?? 90;
    let timer = null;
    let token = 0;

    const cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        token += 1;
    };

    const schedule = (...args) => {
        cancel();
        const currentToken = token;

        const runCommit = () => {
            const currentSelection = options.readSelection?.(...args);
            const currentSignature = options.getSignature?.(currentSelection, ...args);
            if (!currentSignature) {
                return;
            }

            timer = setTimeout(() => {
                if (currentToken !== token) {
                    return;
                }

                const nextSelection = options.readSelection?.(...args);
                const nextSignature = options.getSignature?.(nextSelection, ...args);
                if (!nextSignature || nextSignature !== currentSignature) {
                    schedule(...args);
                    return;
                }

                commitSelection(...args);
            }, settleDelay);
        };

        timer = setTimeout(runCommit, initialDelay);
    };

    return { schedule, cancel };
}
