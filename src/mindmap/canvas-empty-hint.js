import { cardSystem } from '../core/card-system.js';
import { getAppContext } from '../app/app-context.js';
import { APP_EVENTS } from '../core/event-names.js';

function isBoardEmpty() {
    const board = getAppContext().board;
    const boardElementCount = board?.children?.length || 0;
    let cardCount = 0;
    const cards = cardSystem?.cards;
    if (cards instanceof Map) {
        cardCount = cards.size;
    } else if (cards && typeof cards === 'object') {
        cardCount = Object.keys(cards).length;
    }
    return boardElementCount === 0 && cardCount === 0;
}

/**
 * Toggles an empty-state class on the mind map container; the guidance copy
 * itself is rendered by CSS ::after so it survives React/Plait taking over
 * the container's DOM.
 */
export function mountCanvasEmptyHint(container) {
    const update = () => {
        container.classList.toggle('mindmap-empty', isBoardEmpty());
    };

    [
        APP_EVENTS.CARD_ADDED,
        APP_EVENTS.CARD_REMOVED,
        APP_EVENTS.CARDS_CLEARED,
        APP_EVENTS.CARDS_RESTORED,
        APP_EVENTS.RESTORE_BOARD_STATE,
        APP_EVENTS.BOARD_READY
    ].forEach((eventName) => window.addEventListener(eventName, update));

    // Non-card drawings (shapes, freehand) also clear the hint.
    const observer = new MutationObserver(update);
    observer.observe(container, { childList: true, subtree: true });

    update();
}
