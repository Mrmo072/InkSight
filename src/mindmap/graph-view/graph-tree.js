/**
 * Builds a tree structure for the graph view from the board's flat
 * card-node + arrow-line elements, rooted at a given card.
 *
 * Node relationships follow arrow-line direction (source → target), the
 * same semantics as buildForest in drawnix-board-utils.js. BFS traversal
 * with a visited set prevents cycles and duplicate branches.
 */

function isCardElement(element) {
    return (element.type === 'geometry' || element.type === 'image') && element.data?.cardId;
}

function buildCardText(card) {
    const parts = [];
    if (card?.content) {
        parts.push(card.content);
    }
    if (card?.note) {
        parts.push(card.note);
    }
    return parts.join('\n\n') || '（无内容）';
}

export function buildGraphTree({ board, getCardById, rootCardId }) {
    if (!rootCardId) {
        return null;
    }

    const children = board?.children || [];
    const cardIdByElementId = new Map();
    const elementByCardId = new Map();

    children.forEach((element) => {
        if (isCardElement(element)) {
            cardIdByElementId.set(element.id, element.data.cardId);
            elementByCardId.set(element.data.cardId, element);
        }
    });

    const outgoing = new Map();
    children.forEach((element) => {
        if (element.type !== 'arrow-line') {
            return;
        }

        const sourceCardId = cardIdByElementId.get(element.source?.boundId);
        const targetCardId = cardIdByElementId.get(element.target?.boundId);
        if (!sourceCardId || !targetCardId || sourceCardId === targetCardId) {
            return;
        }

        if (!outgoing.has(sourceCardId)) {
            outgoing.set(sourceCardId, []);
        }
        outgoing.get(sourceCardId).push(targetCardId);
    });

    // 未上板的标注也可以展开图谱：退化为单根树（子节点来自图谱视图内创建）
    if (!elementByCardId.has(rootCardId)) {
        const rootCard = getCardById?.(rootCardId) || null;
        if (!rootCard) {
            return null;
        }
        return {
            tree: {
                id: rootCardId,
                tag: rootCard.sourceName || '标注',
                text: buildCardText(rootCard),
                color: rootCard.color || null,
                children: []
            },
            cardById: elementByCardId
        };
    }

    const visited = new Set();
    const buildNode = (cardId) => {
        visited.add(cardId);
        const card = getCardById?.(cardId) || null;
        const childIds = (outgoing.get(cardId) || []).filter((childId) => !visited.has(childId));

        return {
            id: cardId,
            tag: card?.sourceName || '标注',
            text: buildCardText(card),
            color: card?.color || null,
            children: childIds.map(buildNode)
        };
    };

    return {
        tree: buildNode(rootCardId),
        cardById: elementByCardId
    };
}
