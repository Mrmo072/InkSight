import { BoardTransforms, PlaitBoard, Transforms, getSelectedElements, toHostPoint, toViewBoxPoint } from '@plait/core';
import { v4 as uuidv4 } from 'uuid';
import { calculateNodeSize, createCenteredPoints } from './drawnix-board-utils.js';

export function createViewportCenterResolver(boardRef, board, containerRef) {
    return () => {
        const currentBoard = boardRef.current || board;
        const container = containerRef.current;
        const zoom = currentBoard?.viewport?.zoom || 1;
        const viewX = currentBoard?.viewport?.x || 0;
        const viewY = currentBoard?.viewport?.y || 0;
        const width = container?.clientWidth || 600;
        const height = container?.clientHeight || 400;

        return {
            boardX: viewX + (width / 2) / zoom,
            boardY: viewY + (height / 2) / zoom
        };
    };
}

function insertImageNode(targetBoard, data, boardX, boardY) {
    const img = new Image();
    img.onload = () => {
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        const maxWidth = 300;
        if (width > maxWidth) {
            const scale = maxWidth / width;
            width = maxWidth;
            height = height * scale;
        }

        const imageNode = {
            id: uuidv4(),
            type: 'image',
            url: data.imageData,
            points: createCenteredPoints(boardX, boardY, width, height),
            data: { cardId: data.id, cardType: data.type, sourceName: data.sourceName },
            strokeColor: data.color || '#4f46e5',
            strokeWidth: 2
        };
        Transforms.insertNode(targetBoard, imageNode, [targetBoard.children.length]);
    };
    img.onerror = () => {
        const imageNode = {
            id: uuidv4(),
            type: 'image',
            url: data.imageData,
            points: createCenteredPoints(boardX, boardY, 200, 150),
            data: { cardId: data.id, cardType: data.type, sourceName: data.sourceName },
            strokeColor: data.color || '#4f46e5',
            strokeWidth: 2
        };
        Transforms.insertNode(targetBoard, imageNode, [targetBoard.children.length]);
    };
    img.src = data.imageData;
}

export function insertCardIntoBoard({ data, boardRef, board, cardSystem, resolveViewportCenter }) {
    if (!data?.id) {
        return;
    }

    const position = resolveViewportCenter();
    const targetBoard = boardRef.current || board;
    const { boardX, boardY } = position;
    const existingNode = targetBoard.children.find((child) => child.data?.cardId === data.id);

    if (existingNode) {
        const path = [targetBoard.children.indexOf(existingNode)];
        const width = existingNode.width || Math.abs((existingNode.points?.[1]?.[0] || 0) - (existingNode.points?.[0]?.[0] || 0)) || 200;
        const height = existingNode.height || Math.abs((existingNode.points?.[1]?.[1] || 0) - (existingNode.points?.[0]?.[1] || 0)) || 100;
        Transforms.setNode(targetBoard, {
            points: createCenteredPoints(boardX, boardY, width, height)
        }, path);
        return;
    }

    const card = cardSystem.cards.get(data.id);
    if (!card) {
        return;
    }

    cardSystem.updateCard(card.id, { isOnBoard: true });

    if (data.type === 'image' && data.imageData) {
        insertImageNode(targetBoard, data, boardX, boardY);
        return;
    }

    const { width, height } = calculateNodeSize(data.text);
    const node = {
        id: uuidv4(),
        type: 'geometry',
        shape: 'rectangle',
        points: createCenteredPoints(boardX, boardY, width, height),
        text: { children: [{ text: data.text }] },
        data: { cardId: data.id, cardType: data.type, sourceName: data.sourceName },
        strokeColor: data.color || '#4f46e5',
        strokeWidth: 2
    };
    Transforms.insertNode(targetBoard, node, [targetBoard.children.length]);
}

export function handleGlobalBoardDrop({ event, boardRef, board, resolveViewportCenter, insertCard, logger }) {
    const dataStr = event.dataTransfer.getData('application/json');
    if (!dataStr) {
        return;
    }

    try {
        const data = JSON.parse(dataStr);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const currentBoard = boardRef.current || board;
        const host = PlaitBoard.getHost(currentBoard);

        if (host) {
            const hostPoint = toHostPoint(currentBoard, event.clientX, event.clientY);
            const viewBoxPoint = toViewBoxPoint(currentBoard, hostPoint);
            insertCard({ ...data, boardX: viewBoxPoint[0], boardY: viewBoxPoint[1] });
            return;
        }

        const { boardX, boardY } = resolveViewportCenter();
        insertCard({ ...data, boardX, boardY });
    } catch (error) {
        logger?.error?.('Drop error', error);
    }
}

export function focusBoardCard({ board, cardId, setFlashOverlay }) {
    const node = board.children.find((child) => child.data?.cardId === cardId);
    if (!node) {
        return;
    }

    const path = [board.children.indexOf(node)];
    Transforms.setSelection(board, {
        anchor: { path, offset: 0 },
        focus: { path, offset: 0 }
    });

    if (!node.points || node.points.length < 2) {
        return;
    }

    const [p1, p2] = node.points;
    const nodeCenterX = (p1[0] + p2[0]) / 2;
    const nodeCenterY = (p1[1] + p2[1]) / 2;
    const container = document.getElementById('mindmap-container');
    const containerWidth = container?.clientWidth || window.innerWidth / 2;
    const containerHeight = container?.clientHeight || window.innerHeight;
    const currentZoom = board.viewport?.zoom || 1;
    const newScrollX = nodeCenterX - (containerWidth / 2) / currentZoom;
    const newScrollY = nodeCenterY - (containerHeight / 2) / currentZoom;

    BoardTransforms.updateViewport(board, [newScrollX, newScrollY], currentZoom);

    const nodeWidth = Math.abs(p2[0] - p1[0]);
    const nodeHeight = Math.abs(p2[1] - p1[1]);
    const screenWidth = nodeWidth * currentZoom;
    const screenHeight = nodeHeight * currentZoom;
    const left = (containerWidth - screenWidth) / 2;
    const top = (containerHeight - screenHeight) / 2;

    setFlashOverlay({
        left,
        top,
        width: screenWidth,
        height: screenHeight
    });

    setTimeout(() => {
        setFlashOverlay(null);
    }, 800);
}

export function dispatchJumpToSourceFromSelection(board, cardSystem) {
    const selection = board.selection;
    if (!selection?.anchor || !selection?.focus) {
        return;
    }

    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) {
        return;
    }

    const node = selectedElements[0];
    if (!node.data?.cardId) {
        return;
    }

    const card = cardSystem.cards.get(node.data.cardId);
    if (!card?.highlightId) {
        return;
    }

    window.dispatchEvent(new CustomEvent('jump-to-source', {
        detail: {
            sourceId: card.sourceId,
            highlightId: card.highlightId,
            cardId: card.id
        }
    }));
}
