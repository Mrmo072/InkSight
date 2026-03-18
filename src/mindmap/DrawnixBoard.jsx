import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Drawnix } from '@drawnix/drawnix';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Transforms, PlaitBoard, getSelectedElements, BoardTransforms, toViewBoxPoint, toHostPoint } from '@plait/core';
import { setAppService } from '../app/app-context.js';
import { registerEventListeners } from '../app/event-listeners.js';
import { cardSystem } from '../core/card-system.js';
import { themeManager } from '../core/theme-manager.js';
import {
    calculateNodeSize,
    createCenteredPoints,
    createLayoutGraph,
    extractEdgeSectionPoints,
    simplifyOrthogonalPoints
} from './drawnix-board-utils.js';

export const DrawnixBoardComponent = () => {
    const [board, setBoard] = useState(null);
    const boardRef = useRef(null); // Use ref to access board in callbacks without stale closures
    const [value, setValue] = useState([]);
    const [viewport, setViewport] = useState(null);
    const [flashOverlay, setFlashOverlay] = useState(null);
    const containerRef = useRef(null);
    const processingCardIds = useRef(new Set()); // Track cards being processed to avoid loops
    const elkRef = useRef(new ELK()); // Reuse ELK instance

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


        const resolveViewportCenter = () => {
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

        const insertCardIntoBoard = (data, position = resolveViewportCenter()) => {
            if (!data?.id) return;

            const targetBoard = boardRef.current || board;
            const { boardX, boardY } = position;
            const existingNode = targetBoard.children.find(c => c.data?.cardId === data.id);

            if (existingNode) {
                const path = [targetBoard.children.indexOf(existingNode)];
                const w = existingNode.width || Math.abs((existingNode.points?.[1]?.[0] || 0) - (existingNode.points?.[0]?.[0] || 0)) || 200;
                const h = existingNode.height || Math.abs((existingNode.points?.[1]?.[1] || 0) - (existingNode.points?.[0]?.[1] || 0)) || 100;
                Transforms.setNode(targetBoard, {
                    points: createCenteredPoints(boardX, boardY, w, h)
                }, path);
                return;
            }

            const card = cardSystem.cards.get(data.id);
            if (!card) return;

            cardSystem.updateCard(card.id, { isOnBoard: true });

            if (data.type === 'image' && data.imageData) {
                const img = new Image();
                img.onload = () => {
                    let width = img.naturalWidth;
                    let height = img.naturalHeight;
                    const MAX_WIDTH = 300;
                    if (width > MAX_WIDTH) {
                        const scale = MAX_WIDTH / width;
                        width = MAX_WIDTH;
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
        };

        const globalDropHandler = (e) => {
            const dataStr = e.dataTransfer.getData('application/json');
            if (!dataStr) return;

            try {
                const data = JSON.parse(dataStr);
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const currentBoard = boardRef.current || board;
                const host = PlaitBoard.getHost(currentBoard);
                const hostRect = host.getBoundingClientRect();

                let boardX;
                let boardY;
                if (host) {
                    const hostPoint = toHostPoint(currentBoard, e.clientX, e.clientY);
                    const viewBoxPoint = toViewBoxPoint(currentBoard, hostPoint);
                    boardX = viewBoxPoint[0];
                    boardY = viewBoxPoint[1];
                } else {
                    ({ boardX, boardY } = resolveViewportCenter());
                }

                insertCardIntoBoard(data, { boardX, boardY, hostRect });
            } catch (err) {
                console.error('[DrawnixBoard] Drop error:', err);
            }
        };

        const globalDragOverHandler = (e) => {
            e.preventDefault(); // Necessary to allow dropping
        };

        const handleAddCardToBoard = (e) => {
            insertCardIntoBoard(e.detail);
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


            const node = board.children.find(c => c.data?.cardId === cardId);
            if (node) {
                // Select the node
                const path = [board.children.indexOf(node)];
                Transforms.setSelection(board, {
                    anchor: { path, offset: 0 },
                    focus: { path, offset: 0 }
                });

                // Scroll node into view
                if (node.points && node.points.length >= 2) {
                    const [p1, p2] = node.points;
                    // Calculate center of the node
                    const nodeCenterX = (p1[0] + p2[0]) / 2;
                    const nodeCenterY = (p1[1] + p2[1]) / 2;

                    // Get current container dimensions
                    const container = document.getElementById('mindmap-container');
                    const containerWidth = container?.clientWidth || window.innerWidth / 2;
                    const containerHeight = container?.clientHeight || window.innerHeight;

                    // Calculate new scroll position to center the node
                    // Viewport origination represents the top-left of the view in board coordinates
                    const currentZoom = board.viewport?.zoom || 1;
                    const newScrollX = nodeCenterX - (containerWidth / 2) / currentZoom;
                    const newScrollY = nodeCenterY - (containerHeight / 2) / currentZoom;

                    // console.log('[DrawnixBoard] Scrolling to:', { newScrollX, newScrollY, currentZoom });

                    // Use BoardTransforms to update viewport directly
                    BoardTransforms.updateViewport(board, [newScrollX, newScrollY], currentZoom);

                    // Visual Flash Effect (DOM Overlay)


                    // Calculate overlay dimensions and position
                    // The node coordinates are in board space. We need to convert them to screen space relative to the container.
                    // Or simpler: since we just centered the node, we can just place the overlay in the center of the container!

                    const nodeWidth = Math.abs(p2[0] - p1[0]);
                    const nodeHeight = Math.abs(p2[1] - p1[1]);

                    const screenWidth = nodeWidth * currentZoom;
                    const screenHeight = nodeHeight * currentZoom;

                    // Since we centered the node, the top-left of the node in the container should be:
                    // (containerWidth - screenWidth) / 2
                    // (containerHeight - screenHeight) / 2

                    const left = (containerWidth - screenWidth) / 2;
                    const top = (containerHeight - screenHeight) / 2;

                    setFlashOverlay({
                        left,
                        top,
                        width: screenWidth,
                        height: screenHeight
                    });

                    // Remove overlay after 800ms
                    setTimeout(() => {
                        setFlashOverlay(null);
                    }, 800);
                }
            }
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
        console.log('[DrawnixBoard] Board initialized and ready');
        window.dispatchEvent(new CustomEvent('board-ready'));

        // Add click listener for jump-to-source
        const container = PlaitBoard.getBoardContainer(b);
        const handleBoardClick = () => {
            const selection = b.selection;
            if (selection && selection.anchor && selection.focus) {
                const selectedElements = getSelectedElements(b);
                if (selectedElements.length > 0) {
                    const node = selectedElements[0];
                    if (node.data && node.data.cardId) {
                        const card = cardSystem.cards.get(node.data.cardId);
                        if (card && card.highlightId) {
                            const event = new CustomEvent('jump-to-source', {
                                detail: {
                                    sourceId: card.sourceId,
                                    highlightId: card.highlightId,
                                    cardId: card.id
                                }
                            });
                            window.dispatchEvent(event);
                        }
                    }
                }
            }
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

        const elk = elkRef.current;
        const { graph, nodeMap } = createLayoutGraph(boardInstance.children);

        if (graph.children.length === 0) return;

        try {
            const layoutedGraph = await elk.layout(graph);

            // Update Nodes
            layoutedGraph.children.forEach(node => {
                const originalNode = nodeMap.get(node.id);
                if (originalNode) {
                    const newX = node.x;
                    const newY = node.y;
                    const width = node.width;
                    const height = node.height;

                    const path = [boardInstance.children.findIndex(c => c.id === node.id)];
                    if (path[0] !== -1) {
                        Transforms.setNode(boardInstance, {
                            points: [[newX, newY], [newX + width, newY + height]]
                        }, path);
                    }
                }
            });

            // Update Edges
            if (layoutedGraph.edges) {
                layoutedGraph.edges.forEach(edge => {
                    if (edge.sections && edge.sections.length > 0) {
                        const section = edge.sections[0];
                        const points = simplifyOrthogonalPoints(extractEdgeSectionPoints(section));

                        const path = [boardInstance.children.findIndex(c => c.id === edge.id)];
                        if (path[0] !== -1) {
                            Transforms.setNode(boardInstance, {
                                points: points
                            }, path);
                        }
                    }
                });
            }

        } catch (error) {
            console.error('[DrawnixBoard] ELK layout failed:', error);
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
                console.log('[DrawnixBoard] Restoring board state from event');
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
                    // console.log('[DrawnixBoard] onSelectionChange triggered', selection, 'Board ref:', !!currentBoard);

                    if (selection && selection.anchor && selection.focus && currentBoard) {
                        const selectedElements = getSelectedElements(currentBoard);
                        // console.log('[DrawnixBoard] Selected elements:', selectedElements);
                        if (selectedElements.length === 1) {
                            const node = selectedElements[0];
                            // console.log('[DrawnixBoard] Selected node:', node);
                            if (node.data && node.data.cardId) {
                                // console.log('[DrawnixBoard] Node has cardId:', node.data.cardId);
                                const card = cardSystem.cards.get(node.data.cardId);
                                // console.log('[DrawnixBoard] Retrieved card:', card);
                                if (card) {
                                    // console.log('[DrawnixBoard] Selection changed, sourceId:', card.sourceId);
                                    window.dispatchEvent(new CustomEvent('mindmap-selection-changed', {
                                        detail: {
                                            sourceId: card.sourceId,
                                            sourceName: card.sourceName || (node.data && node.data.sourceName) // Use card sourceName or fallback to node data
                                        }
                                    }));
                                    return;
                                } else {
                                    console.warn('[DrawnixBoard] Card not found in cardSystem for ID:', node.data.cardId);
                                }
                            } else {
                                // console.log('[DrawnixBoard] Node missing cardId in data');
                            }
                        }
                    }
                    // If no selection or multiple selection or no card associated
                    // console.log('[DrawnixBoard] Clearing selection (no valid single card selected)');
                    window.dispatchEvent(new CustomEvent('mindmap-selection-changed', {
                        detail: { sourceId: null }
                    }));
                }}
                onChange={(data) => {
                    setValue(data.children);
                    // Handle node removal to sync with PDF
                    if (data.operations) {
                        data.operations.forEach(op => {


                            if (op.type === 'insert_node') {
                                // Handle node insertion (undo delete / redo add / paste)
                                const node = op.node;

                                if (node.data && node.data.cardId) {
                                    const card = cardSystem.cards.get(node.data.cardId);
                                    if (card) {
                                        // Check if this is a genuine copy (duplicate on board) or just a restore/move
                                        // Count occurrences of this cardId in the new state
                                        const occurrenceCount = data.children.filter(c => c.data?.cardId === node.data.cardId).length;

                                        if (occurrenceCount > 1) {
                                            // CASE: Copy/Paste (Duplicate exists)


                                            const newCardId = uuidv4();
                                            const newCard = {
                                                ...card,
                                                id: newCardId,
                                                sourceId: null, // Decouple from document
                                                sourceName: null, // Decouple from document
                                                highlightId: null, // Decouple from document
                                                position: {
                                                    x: node.points ? node.points[0][0] : 100,
                                                    y: node.points ? node.points[0][1] : 100
                                                },
                                                createdAt: new Date().toISOString()
                                            };

                                            // Add to processing set before triggering event
                                            processingCardIds.current.add(newCardId);

                                            // Add new card to system
                                            cardSystem.addCard(newCard);

                                            // Update the board node to reference the new card
                                            // Must be done asynchronously to avoid conflict with current change cycle
                                            setTimeout(() => {
                                                const currentBoard = boardRef.current;
                                                if (currentBoard) {
                                                    Transforms.setNode(currentBoard, {
                                                        data: {
                                                            ...node.data,
                                                            cardId: newCardId,
                                                            sourceName: null
                                                        }
                                                    }, op.path);
                                                }
                                            }, 0);
                                        } else {
                                            // CASE: Undo Delete / Cut+Paste (Original was deleted or moved)
                                            // Only restore if it was marked as deleted
                                            if (card.deleted) {

                                                // Mark card as not deleted (restore it)
                                                cardSystem.markCardAsDeleted(node.data.cardId, false);
                                            } else {

                                            }
                                        }
                                    } else {
                                        console.warn('[DrawnixBoard] Card not found for node:', node.data.cardId);
                                    }
                                }
                            } else if (op.type === 'remove_node') {
                                const node = op.node;

                                if (node.data && node.data.cardId) {
                                    // Only remove from board view, do NOT delete card/highlight
                                    cardSystem.updateCard(node.data.cardId, { isOnBoard: false });
                                    // cardSystem.markCardAsDeleted(node.data.cardId, true);
                                } else {
                                    console.warn('[DrawnixBoard] Removed node missing cardId:', node);
                                }
                            } else if (op.type === 'set_node') {
                                // Handle node property updates (including color changes)
                                const props = op.newProperties;
                                const path = op.path;



                                // Check if this is a color change
                                if (props && (props.strokeColor || props.stroke)) {
                                    const newColor = props.strokeColor || props.stroke;


                                    // Get the target node using the path from data.children (updated state)
                                    if (data && data.children && path && path.length > 0) {
                                        const targetNode = data.children[path[0]];

                                        if (targetNode && targetNode.data && targetNode.data.cardId) {


                                            // Find the card and its highlight ID
                                            const card = cardSystem.cards.get(targetNode.data.cardId);
                                            if (card && card.highlightId) {


                                                window.dispatchEvent(new CustomEvent('mindmap-node-updated', {
                                                    detail: {
                                                        highlightId: card.highlightId,
                                                        color: newColor
                                                    }
                                                }));
                                            } else {
                                                console.warn('[DrawnixBoard] Card or highlightId not found for cardId:', targetNode.data.cardId);
                                            }
                                        } else {
                                            console.warn('[DrawnixBoard] No valid target node found at path:', path);
                                        }
                                    } else {
                                        console.warn('[DrawnixBoard] Invalid data state or path:', { hasData: !!data, hasChildren: !!data?.children, path });
                                    }
                                }
                            }
                        });
                    }

                    // Fallback: Check selection on every change (since onSelectionChange might be unreliable)
                    const currentBoard = boardRef.current;
                    if (currentBoard && currentBoard.selection) {
                        const selectedElements = getSelectedElements(currentBoard);
                        if (selectedElements.length === 1) {
                            const node = selectedElements[0];
                            if (node.data && node.data.cardId) {
                                const card = cardSystem.cards.get(node.data.cardId);
                                if (card) {
                                    window.dispatchEvent(new CustomEvent('mindmap-selection-changed', {
                                        detail: {
                                            sourceId: card.sourceId,
                                            sourceName: card.sourceName || (node.data && node.data.sourceName)
                                        }
                                    }));
                                }
                            }
                        } else {
                            // If no selection or multiple selection
                            window.dispatchEvent(new CustomEvent('mindmap-selection-changed', {
                                detail: { sourceId: null }
                            }));
                        }
                    }
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
