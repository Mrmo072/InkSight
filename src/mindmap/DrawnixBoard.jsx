import React, { useState, useEffect, useRef } from 'react';
import { Drawnix } from '@drawnix/drawnix';
import { Transforms, PlaitBoard } from '@plait/core';
import { getAppContext, setAppService } from '../app/app-context.js';
import { registerEventListeners } from '../app/event-listeners.js';
import { cardSystem } from '../core/card-system.js';
import { themeManager } from '../core/theme-manager.js';
import { createLogger } from '../core/logger.js';
import {
    buildAutoLayoutPlan,
    calculateNodeSize,
    createCenteredPoints
} from './drawnix-board-utils.js';
import { handleBoardOperations, syncMindmapSelection } from './drawnix-board-state.js';
import {
    createViewportCenterResolver,
    dispatchJumpToSourceFromSelection,
    focusBoardCard,
    handleGlobalBoardDrop,
    insertCardIntoBoard
} from './drawnix-board-interactions.js';

const logger = createLogger('DrawnixBoard');

function parseDateOrder(value) {
    if (!value) {
        return Number.POSITIVE_INFINITY;
    }

    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function buildLocationOrder(location) {
    if (!location) {
        return null;
    }

    const page = typeof location.page === 'number' ? location.page : Number.POSITIVE_INFINITY;
    const firstRect = Array.isArray(location.rects) && location.rects.length > 0 ? location.rects[0] : null;
    const rectPage = typeof firstRect?.page === 'number' ? firstRect.page : page;
    const rectTop = typeof firstRect?.top === 'number' ? firstRect.top : Number.POSITIVE_INFINITY;
    const rectLeft = typeof firstRect?.left === 'number' ? firstRect.left : Number.POSITIVE_INFINITY;
    const index = typeof location.index === 'number' ? location.index : Number.POSITIVE_INFINITY;
    const cfi = typeof location.cfi === 'string' ? location.cfi : '';

    if (Number.isFinite(rectPage) || Number.isFinite(rectTop) || Number.isFinite(index) || cfi) {
        return [rectPage, rectTop, rectLeft, index, cfi];
    }

    return null;
}

function createNodeOrderResolver() {
    return (element) => {
        const cardId = element?.data?.cardId;
        if (!cardId) {
            return null;
        }

        const appContext = getAppContext();
        const card = appContext.cardSystem?.cards?.get?.(cardId);
        if (!card) {
            return null;
        }

        const highlight = card.highlightId
            ? appContext.highlightManager?.getHighlight?.(card.highlightId)
            : null;
        const locationOrder = buildLocationOrder(highlight?.location || card.location);

        return [
            card.sourceId || '',
            ...(locationOrder || []),
            parseDateOrder(card.createdAt),
            card.id
        ];
    };
}

export const DrawnixBoardComponent = () => {
    const [board, setBoard] = useState(null);
    const boardRef = useRef(null); // Use ref to access board in callbacks without stale closures
    const [value, setValue] = useState([]);
    const [viewport, setViewport] = useState(null);
    const [flashOverlay, setFlashOverlay] = useState(null);
    const containerRef = useRef(null);
    const processingCardIds = useRef(new Set()); // Track cards being processed to avoid loops

    // Initialize with existing cards once board is ready
    useEffect(() => {
        if (!board) return;

        // Load existing cards with batching to prevent UI freeze
        const cards = Array.from(cardSystem.cards.values());
        const BATCH_SIZE = 50;
        let currentIndex = 0;

        const processBatch = () => {
            if (!board) return; // Safety check

            const end = Math.min(currentIndex + BATCH_SIZE, cards.length);
            let addedCount = 0;

            for (let i = currentIndex; i < end; i++) {
                const card = cards[i];
                // Check if already exists to avoid duplicates on re-render
                const exists = board.children.some(c => c.data?.cardId === card.id);
                if (!exists && card.isOnBoard !== false) {
                    addCardNode(board, card, i);
                    addedCount++;
                }
            }
            // Removed dead handleBoardDrop code

            // Handle node removal to sync with PDF


            currentIndex = end;

            if (currentIndex < cards.length) {
                requestAnimationFrame(processBatch);
            } else {
                if (addedCount > 0) {

                }
            }
        };

        processBatch();
    }, [board]);

    // Handle card sync
    useEffect(() => {
        if (!board) return;

        // REMOVED auto-listener for 'card-added' to prevent automatic node creation.
        // Nodes are now ONLY created via Drag & Drop from the annotation list.
        /*
        const handleCardAdded = (e) => { ... }
        window.addEventListener('card-added', handleCardAdded);
        */

        // Premature return removed to allow handler initialization

        const resolveViewportCenter = createViewportCenterResolver(boardRef, board, containerRef);
        const insertCard = (data) => insertCardIntoBoard({
            data,
            boardRef,
            board,
            cardSystem,
            resolveViewportCenter: () => ({
                boardX: data.boardX,
                boardY: data.boardY
            })
        });

        const globalDropHandler = (e) => {
            handleGlobalBoardDrop({
                event: e,
                boardRef,
                board,
                resolveViewportCenter,
                insertCard,
                logger
            });
        };

        const globalDragOverHandler = (e) => {
            e.preventDefault(); // Necessary to allow dropping
        };

        const handleAddCardToBoard = (e) => {
            const position = resolveViewportCenter();
            insertCard({
                ...e.detail,
                boardX: position.boardX,
                boardY: position.boardY
            });
        };

        const handleCardSoftDeleted = (e) => {
            const { id } = e.detail;


            const node = board.children.find(c => c.data?.cardId === id);
            if (node) {
                const path = [board.children.indexOf(node)];
                // Remove the node from board (this will trigger remove_node operation)
                // But the card data is preserved with deleted:true flag
                Transforms.removeNode(board, path);
            }
        };

        const handleCardRestored = (e) => {
            const { id } = e.detail;


            // Check if node already exists in board
            const existingNode = board.children.find(c => c.data?.cardId === id);
            if (!existingNode) {
                // Re-add the node to the board
                const card = cardSystem.cards.get(id);
                if (card) {
                    addCardNode(board, card, board.children.length);
                }
            }
        };

        const cleanupListeners = registerEventListeners([
            { target: window, event: 'drop', handler: globalDropHandler, options: true },
            { target: window, event: 'dragover', handler: globalDragOverHandler, options: true },
            { target: window, event: 'add-card-to-board', handler: handleAddCardToBoard },
            { target: window, event: 'card-soft-deleted', handler: handleCardSoftDeleted },
            { target: window, event: 'card-restored', handler: handleCardRestored }
        ]);

        return () => {
            cleanupListeners();
        };
    }, [board]);

    // Handle highlight selection from PDF
    useEffect(() => {
        if (!board) return;

        const handleHighlightSelected = (e) => {
            const { cardId } = e.detail;
            focusBoardCard({ board, cardId, setFlashOverlay });
        };

        const handleHighlightUpdated = (e) => {
            const { id, color } = e.detail;


            // Find card by highlight ID
            const card = Array.from(cardSystem.cards.values()).find(c => c.highlightId === id);
            if (card) {
                const node = board.children.find(c => c.data?.cardId === card.id);
                if (node) {
                    const path = [board.children.indexOf(node)];
                    // Update node style
                    // For basic shapes/cards, we usually update stroke or fill
                    Transforms.setNode(board, {
                        strokeColor: color,
                        fillColor: color + '1A' // 10% opacity
                    }, path);
                }
            }
        };
        const cleanupListeners = registerEventListeners([
            { target: window, event: 'highlight-selected', handler: handleHighlightSelected },
            { target: window, event: 'highlight-updated', handler: handleHighlightUpdated }
        ]);

        return () => {
            cleanupListeners();
        };
    }, [board]);

    const addCardNode = (boardInstance, card, index) => {
        const x = 50 + (index % 3) * 220;
        const y = 50 + Math.floor(index / 3) * 160;

        let node;

        if (card.type === 'image' && card.imageData) {
            // Load image to get natural dimensions
            const img = new Image();
            img.onload = () => {
                const aspectRatio = img.width / img.height;
                const MAX_WIDTH = 400;
                const MAX_HEIGHT = 300;

                let nodeWidth = img.width;
                let nodeHeight = img.height;

                // Scale down if too large, preserving aspect ratio
                if (nodeWidth > MAX_WIDTH) {
                    nodeWidth = MAX_WIDTH;
                    nodeHeight = MAX_WIDTH / aspectRatio;
                }
                if (nodeHeight > MAX_HEIGHT) {
                    nodeHeight = MAX_HEIGHT;
                    nodeWidth = MAX_HEIGHT * aspectRatio;
                }

                // Create Image Node with dynamic dimensions
                const imageNode = {
                    id: card.id,
                    type: 'image',
                    url: card.imageData,
                    points: [[x, y], [x + nodeWidth, y + nodeHeight]],
                    data: { cardId: card.id, cardType: card.type, sourceName: card.sourceName },
                    strokeColor: card.color || '#4f46e5', // Add stroke color for image nodes too if supported
                    strokeWidth: 2
                };

                Transforms.insertNode(boardInstance, imageNode, [boardInstance.children.length]);
            };
            img.src = card.imageData;
            return; // Don't insert immediately, wait for onload
        } else {
            // Create Text Node (Geometry)
            let title = 'Untitled Card';
            if (card.type === 'text') {
                // Show full text, no truncation
                title = card.content || 'Empty Text';
            }

            // Calculate dynamic size
            const { width, height } = calculateNodeSize(title);

            node = {
                id: card.id,
                type: 'geometry',
                shape: 'rectangle',
                points: [[x, y], [x + width, y + height]],
                text: { children: [{ text: title }] },
                data: { cardId: card.id, cardType: card.type, sourceName: card.sourceName },
                strokeColor: card.color || '#4f46e5',
                strokeWidth: 2
            };

            Transforms.insertNode(boardInstance, node, [boardInstance.children.length]);
        }
    };

    const handleBoardInit = (b) => {
        setBoard(b);
        boardRef.current = b; // Store ref for callbacks
        setAppService('board', b);

        // Signal that board is ready for restoring data
        logger.debug('Board initialized and ready');
        window.dispatchEvent(new CustomEvent('board-ready'));

        // Add click listener for jump-to-source
        const container = PlaitBoard.getBoardContainer(b);
        const handleBoardClick = () => {
            dispatchJumpToSourceFromSelection(b, cardSystem);
        };
        container.addEventListener('click', handleBoardClick);
        b.__inksightCleanup = () => {
            container.removeEventListener('click', handleBoardClick);
        };


        // Expose auto-layout function globally
        window.applyAutoLayout = () => applyAutoLayout(b);
    };
    const applyAutoLayout = async (boardInstance) => {
        if (!boardInstance || !boardInstance.children) return;
        try {
            const { nodeRects, edgeRoutes } = buildAutoLayoutPlan(boardInstance.children, {
                getNodeOrder: createNodeOrderResolver()
            });

            nodeRects.forEach((rect, nodeId) => {
                const path = [boardInstance.children.findIndex(c => c.id === nodeId)];
                if (path[0] === -1) {
                    return;
                }

                Transforms.setNode(boardInstance, {
                    points: [[rect.x, rect.y], [rect.x + rect.width, rect.y + rect.height]]
                }, path);
            });

            edgeRoutes.forEach((route, edgeId) => {
                const path = [boardInstance.children.findIndex(c => c.id === edgeId)];
                if (path[0] === -1) {
                    return;
                }

                const edgeNode = boardInstance.children[path[0]];
                Transforms.setNode(boardInstance, {
                    shape: 'curve',
                    points: route.points,
                    source: {
                        ...edgeNode?.source,
                        connection: route.sourceConnection
                    },
                    target: {
                        ...edgeNode?.target,
                        connection: route.targetConnection
                    },
                    texts: edgeNode?.texts ?? []
                }, path);
            });
        } catch (error) {
            logger.error('Auto layout failed', error);
        }
    };

    const handleBoardDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    // Auto-Restore Listener
    useEffect(() => {
        const handleRestore = (e) => {
            const data = e.detail;
            if (data.elements) {
                logger.debug('Restoring board state from event');
                setValue(data.elements);
                if (data.viewport) {
                    setViewport(data.viewport);
                }
            }
        };
        const cleanupListeners = registerEventListeners([
            { target: window, event: 'restore-board-state', handler: handleRestore }
        ]);
        return () => cleanupListeners();
    }, []);

    useEffect(() => {
        return () => {
            boardRef.current?.__inksightCleanup?.();
        };
    }, []);

    return (
        <div
            ref={containerRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleBoardDrop}
            style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none', overscrollBehavior: 'none', userSelect: 'none' }}>
            <Drawnix
                value={value}
                viewport={viewport}
                onViewportChange={setViewport}
                onSelectionChange={(selection) => {
                    const currentBoard = boardRef.current;
                    if (selection && selection.anchor && selection.focus && currentBoard) {
                        syncMindmapSelection(currentBoard, cardSystem, logger);
                        return;
                    }
                    syncMindmapSelection(null, cardSystem, logger);
                }}
                onChange={(data) => {
                    setValue(data.children);
                    handleBoardOperations({ data, boardRef, processingCardIds, cardSystem, logger });

                    // Fallback: Check selection on every change (since onSelectionChange might be unreliable)
                    const currentBoard = boardRef.current;
                    syncMindmapSelection(currentBoard, cardSystem, logger);
                }}
                onThemeChange={(themeMode) => {
                    const themeMap = {
                        'default': 'default',
                        'colorful': 'colorful',
                        'soft': 'soft',
                        'retro': 'retro',
                        'dark': 'dark',
                        'starry': 'starry'
                    };
                    const themeName = themeMap[themeMode] || 'default';
                    themeManager.setTheme(themeName);
                }}
                afterInit={handleBoardInit}
            />
            {flashOverlay && (
                <div style={{
                    position: 'absolute',
                    left: flashOverlay.left,
                    top: flashOverlay.top,
                    width: flashOverlay.width,
                    height: flashOverlay.height,
                    border: '4px solid #FF0000',
                    backgroundColor: 'rgba(255, 0, 0, 0.2)',
                    boxShadow: '0 0 15px rgba(255, 0, 0, 0.5)',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    animation: 'pulse 0.8s ease-out'
                }} />
            )}
            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.05); }
                    100% { opacity: 0; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};
