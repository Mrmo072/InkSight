import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Drawnix } from '@drawnix/drawnix';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Transforms, PlaitBoard, getSelectedElements, BoardTransforms } from '@plait/core';
import { cardSystem } from '../core/card-system.js';
import { themeManager } from '../core/theme-manager.js';

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
                if (!exists) {
                    addCardNode(board, card, i);
                    addedCount++;
                }
            }

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

        const handleCardAdded = (e) => {
            const card = e.detail;

            // Check if we are already processing this card (self-triggered)
            if (processingCardIds.current.has(card.id)) {

                processingCardIds.current.delete(card.id);
                return;
            }

            // Check if node already exists to avoid duplicates
            const exists = board.children.some(c => c.data?.cardId === card.id);
            if (!exists) {
                addCardNode(board, card, board.children.length);
            } else {

            }
        };

        window.addEventListener('card-added', handleCardAdded);

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

        window.addEventListener('card-soft-deleted', handleCardSoftDeleted);
        window.addEventListener('card-restored', handleCardRestored);

        return () => {
            window.removeEventListener('card-added', handleCardAdded);
            window.removeEventListener('card-soft-deleted', handleCardSoftDeleted);
            window.removeEventListener('card-restored', handleCardRestored);
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

        window.addEventListener('highlight-selected', handleHighlightSelected);

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
        window.addEventListener('highlight-updated', handleHighlightUpdated);

        return () => {
            window.removeEventListener('highlight-selected', handleHighlightSelected);
            window.removeEventListener('highlight-updated', handleHighlightUpdated);
        };
    }, [board]);

    const calculateNodeSize = (text) => {
        if (!text) return { width: 200, height: 120 };

        const MIN_WIDTH = 120;
        const MAX_WIDTH = 320;
        const PADDING_X = 32; // Left + Right padding
        const PADDING_Y = 32; // Top + Bottom padding
        const LINE_HEIGHT = 24;
        const CHAR_WIDTH_CN = 16;
        const CHAR_WIDTH_EN = 9;

        // Calculate visual length in pixels
        let visualLength = 0;
        for (let char of text) {
            visualLength += char.charCodeAt(0) > 255 ? CHAR_WIDTH_CN : CHAR_WIDTH_EN;
        }

        let width, height;

        if (visualLength + PADDING_X <= MAX_WIDTH) {
            // Text fits in one line (or is short)
            width = Math.max(MIN_WIDTH, visualLength + PADDING_X);
            height = LINE_HEIGHT + PADDING_Y;
        } else {
            // Text needs wrapping
            width = MAX_WIDTH;
            // Estimate lines: visualLength / (available width for text)
            const textWidth = MAX_WIDTH - PADDING_X;
            const lines = Math.ceil(visualLength / textWidth);
            height = lines * LINE_HEIGHT + PADDING_Y;
        }

        // Ensure reasonable minimums
        return {
            width: Math.round(width),
            height: Math.round(Math.max(height, 60))
        };
    };

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

        // Add click listener for jump-to-source
        const container = PlaitBoard.getBoardContainer(b);
        container.addEventListener('click', (e) => {
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
                                    highlightId: card.highlightId
                                }
                            });
                            window.dispatchEvent(event);
                        }
                    }
                }
            }
        });

        // Expose auto-layout function globally
        window.applyAutoLayout = () => applyAutoLayout(b);
    };
    const applyAutoLayout = async (boardInstance) => {
        if (!boardInstance || !boardInstance.children) return;

        const elk = elkRef.current;

        // Helper: De-zigzag / Simplify Points
        const simplifyPoints = (points) => {
            if (!points || points.length < 2) return points;

            const len = points.length;
            // 1. Threshold Alignment (Snap to orthogonal)
            // In-place modification for performance since we just created these points from ELK
            // But ELK returns new objects, so we should be careful. 
            // Let's map to new arrays to be safe but avoid excessive allocation.

            const snapped = new Array(len);
            for (let i = 0; i < len; i++) {
                snapped[i] = [points[i][0], points[i][1]];
            }

            for (let i = 0; i < len - 1; i++) {
                const p1 = snapped[i];
                const p2 = snapped[i + 1];

                // If X difference is small, snap p2.x to p1.x
                if (Math.abs(p1[0] - p2[0]) < 5) {
                    p2[0] = p1[0];
                }
                // If Y difference is small, snap p2.y to p1.y
                if (Math.abs(p1[1] - p2[1]) < 5) {
                    p2[1] = p1[1];
                }
            }

            // 2. Collinear Merge
            const result = [snapped[0]];
            for (let i = 1; i < len - 1; i++) {
                const prev = result[result.length - 1];
                const curr = snapped[i];
                const next = snapped[i + 1];

                // Check if horizontal or vertical collinear
                const isHorizontal = Math.abs(prev[1] - curr[1]) < 1 && Math.abs(curr[1] - next[1]) < 1;
                const isVertical = Math.abs(prev[0] - curr[0]) < 1 && Math.abs(curr[0] - next[0]) < 1;

                if (isHorizontal || isVertical) {
                    continue;
                }
                result.push(curr);
            }
            result.push(snapped[len - 1]);

            return result;
        };

        // 1. Filter Nodes and Edges
        const nodes = [];
        const edges = [];
        const nodeMap = new Map();

        boardInstance.children.forEach((element, index) => {
            if (element.type === 'geometry' || element.type === 'image') {
                const width = Math.abs(element.points[1][0] - element.points[0][0]);
                const height = Math.abs(element.points[1][1] - element.points[0][1]);
                nodes.push({
                    id: element.id,
                    width: width,
                    height: height,
                    // Keep track of original index for updating later
                    _originalIndex: index
                });
                nodeMap.set(element.id, element);
            } else if (element.type === 'arrow-line') {
                // Ensure source and target exist
                if (element.source && element.source.boundId && element.target && element.target.boundId) {
                    edges.push({
                        id: element.id,
                        sources: [element.source.boundId],
                        targets: [element.target.boundId],
                        _originalIndex: index
                    });
                }
            }
        });

        if (nodes.length === 0) return;

        // 2. Construct ELK Graph
        const graph = {
            id: 'root',
            layoutOptions: {
                'elk.algorithm': 'layered',
                'elk.direction': 'RIGHT',
                'elk.edgeRouting': 'ORTHOGONAL',
                'elk.spacing.nodeNode': '80',
                'elk.layered.spacing.nodeNodeBetweenLayers': '100',
                // Optimization: Straighten lines
                'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
                'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
                'elk.portConstraints': 'FIXED_SIDE',
                'elk.layered.mergeEdges': 'true',
                'elk.spacing.edgeNode': '20'
            },
            children: nodes,
            edges: edges
        };

        try {
            // 3. Run Layout

            const layoutedGraph = await elk.layout(graph);


            // 4. Apply Changes to Board

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
                        let points = [];

                        // Start point
                        points.push([section.startPoint.x, section.startPoint.y]);

                        // Bend points
                        if (section.bendPoints) {
                            section.bendPoints.forEach(bp => {
                                points.push([bp.x, bp.y]);
                            });
                        }

                        // End point
                        points.push([section.endPoint.x, section.endPoint.y]);

                        // Apply De-zigzag / Simplification
                        points = simplifyPoints(points);

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

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none', overscrollBehavior: 'none', userSelect: 'none' }}>
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

                                    // Mark card as deleted (soft delete)
                                    cardSystem.markCardAsDeleted(node.data.cardId, true);
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
