import React, { useEffect, useRef, useState } from 'react';
import { createBoard, Transforms } from '@plait/core';
import rough from 'roughjs';
import { cardSystem } from '../core/card-system.js';

export const PlaitBoardComponent = () => {
    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const [board, setBoard] = useState(null);
    const [dragState, setDragState] = useState(null);
    const [tool, setTool] = useState('select'); // select, rectangle, pen
    const [drawingState, setDrawingState] = useState(null);

    // Initialize Board
    useEffect(() => {
        const newBoard = createBoard([], {
            readonly: false,
            hideScrollbar: false
        });
        newBoard.children = [];
        setBoard(newBoard);

        // Load existing cards
        const cards = Array.from(cardSystem.cards.values());
        cards.forEach((card, index) => {
            addCardNode(newBoard, card, index);
        });

        // Listen for new cards
        const handleCardAdded = (e) => {
            const card = e.detail;
            addCardNode(newBoard, card, newBoard.children.length);
            renderBoard(newBoard);
        };

        window.addEventListener('card-added', handleCardAdded);
        return () => {
            window.removeEventListener('card-added', handleCardAdded);
        };
    }, []);

    // Render on board change
    useEffect(() => {
        if (board) {
            renderBoard(board);
        }
    }, [board]);

    const addCardNode = (boardInstance, card, index) => {
        const x = 50 + (index % 3) * 220;
        const y = 50 + Math.floor(index / 3) * 160;

        let title = 'Untitled Card';
        if (card.type === 'text') {
            title = card.content ? (card.content.length > 20 ? card.content.substring(0, 20) + '...' : card.content) : 'Empty Text';
        } else if (card.type === 'image') {
            title = 'Image Card';
        }

        const node = {
            id: card.id,
            type: 'geometry',
            shape: 'rectangle',
            points: [[x, y], [x + 200, y + 120]],
            text: { children: [{ text: title }] },
            data: { cardId: card.id, cardType: card.type, imageData: card.imageData }
        };

        // Check if node already exists
        const exists = boardInstance.children.some(c => c.data?.cardId === card.id);
        if (!exists) {
            boardInstance.children.push(node);
        }
    };

    const renderBoard = (boardInstance) => {
        if (!svgRef.current) return;
        const rc = rough.svg(svgRef.current);
        svgRef.current.innerHTML = ''; // Clear

        boardInstance.children.forEach(node => {
            if (node.shape === 'rectangle') {
                const [p1, p2] = node.points;
                const width = p2[0] - p1[0];
                const height = p2[1] - p1[1];

                // Draw rectangle
                const rect = rc.rectangle(p1[0], p1[1], width, height, {
                    fill: node.data?.cardId ? 'rgba(37, 99, 235, 0.1)' : 'rgba(0,0,0,0)',
                    fillStyle: 'solid',
                    stroke: node.data?.cardId ? '#2563eb' : '#000000',
                    strokeWidth: 2,
                    roughness: 1.5
                });

                rect.setAttribute('data-node-id', node.id);
                svgRef.current.appendChild(rect);

                // Draw Image if available
                if (node.data && node.data.cardType === 'image' && node.data.imageData) {
                    const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
                    image.setAttribute("x", p1[0] + 10);
                    image.setAttribute("y", p1[1] + 10);
                    image.setAttribute("width", width - 20);
                    image.setAttribute("height", height - 40); // Leave space for text
                    image.setAttribute("href", node.data.imageData);
                    image.setAttribute("preserveAspectRatio", "xMidYMid slice");
                    image.style.pointerEvents = "none";
                    svgRef.current.appendChild(image);
                }

                // Draw text
                if (node.text) {
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("x", p1[0] + 10);
                    text.setAttribute("y", node.data?.cardType === 'image' ? p2[1] - 15 : p1[1] + 25);
                    text.setAttribute("font-family", "Inter, sans-serif");
                    text.setAttribute("font-size", "14");
                    text.setAttribute("fill", "#1e293b");
                    text.style.pointerEvents = "none";

                    let content = node.text.children[0].text;
                    text.textContent = content;

                    svgRef.current.appendChild(text);
                }
            } else if (node.shape === 'scribble') {
                // Render pen path
                const path = rc.linearPath(node.points, {
                    stroke: '#000000',
                    strokeWidth: 2,
                    roughness: 1.5
                });
                path.setAttribute('data-node-id', node.id);
                svgRef.current.appendChild(path);
            }
        });
    };

    const handleMouseDown = (e) => {
        if (!board) return;

        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (tool === 'select') {
            // Hit test
            const hitNode = board.children.slice().reverse().find(node => {
                if (node.shape === 'rectangle') {
                    const [p1, p2] = node.points;
                    return x >= p1[0] && x <= p2[0] && y >= p1[1] && y <= p2[1];
                }
                if (node.shape === 'scribble') {
                    const xs = node.points.map(p => p[0]);
                    const ys = node.points.map(p => p[1]);
                    return x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys);
                }
                return false;
            });

            if (hitNode) {
                setDragState({
                    nodeId: hitNode.id,
                    startX: x,
                    startY: y,
                    originalPoints: JSON.parse(JSON.stringify(hitNode.points))
                });
            }
        } else if (tool === 'rectangle') {
            const newNode = {
                id: crypto.randomUUID(),
                type: 'geometry',
                shape: 'rectangle',
                points: [[x, y], [x, y]],
                text: null,
                data: {}
            };
            board.children.push(newNode);
            setDrawingState({ nodeId: newNode.id, startX: x, startY: y });
            renderBoard(board);
        } else if (tool === 'pen') {
            const newNode = {
                id: crypto.randomUUID(),
                type: 'geometry',
                shape: 'scribble',
                points: [[x, y]],
                data: {}
            };
            board.children.push(newNode);
            setDrawingState({ nodeId: newNode.id });
            renderBoard(board);
        }
    };

    const handleMouseMove = (e) => {
        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (dragState) {
            const dx = x - dragState.startX;
            const dy = y - dragState.startY;
            const nodeIndex = board.children.findIndex(n => n.id === dragState.nodeId);
            if (nodeIndex !== -1) {
                const node = board.children[nodeIndex];
                if (node.shape === 'rectangle') {
                    const [op1, op2] = dragState.originalPoints;
                    node.points = [[op1[0] + dx, op1[1] + dy], [op2[0] + dx, op2[1] + dy]];
                } else if (node.shape === 'scribble') {
                    node.points = dragState.originalPoints.map(p => [p[0] + dx, p[1] + dy]);
                }
                renderBoard(board);
            }
        } else if (drawingState) {
            const node = board.children.find(n => n.id === drawingState.nodeId);
            if (!node) return;

            if (tool === 'rectangle') {
                const startX = drawingState.startX;
                const startY = drawingState.startY;
                node.points = [
                    [Math.min(startX, x), Math.min(startY, y)],
                    [Math.max(startX, x), Math.max(startY, y)]
                ];
            } else if (tool === 'pen') {
                node.points.push([x, y]);
            }
            renderBoard(board);
        }
    };

    const handleMouseUp = (e) => {
        if (dragState) {
            const rect = svgRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const dist = Math.sqrt(Math.pow(x - dragState.startX, 2) + Math.pow(y - dragState.startY, 2));

            if (dist < 5) {
                handleNodeClick(dragState.nodeId);
            }
            setDragState(null);
        }
        if (drawingState) {
            setDrawingState(null);
            if (tool === 'rectangle') setTool('select');
        }
    };

    const handleNodeClick = (nodeId) => {
        const node = board.children.find(n => n.id === nodeId);
        if (node && node.data && node.data.cardId) {
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
    };

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
            {/* Toolbar */}
            <div style={{
                position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                background: 'white', padding: '5px 10px', borderRadius: 8,
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)', display: 'flex', gap: 10, zIndex: 10
            }}>
                <button onClick={() => setTool('select')} style={{
                    fontWeight: tool === 'select' ? 'bold' : 'normal',
                    color: tool === 'select' ? '#2563eb' : '#333',
                    border: 'none', background: 'none', cursor: 'pointer'
                }}>Select</button>
                <button onClick={() => setTool('rectangle')} style={{
                    fontWeight: tool === 'rectangle' ? 'bold' : 'normal',
                    color: tool === 'rectangle' ? '#2563eb' : '#333',
                    border: 'none', background: 'none', cursor: 'pointer'
                }}>Rectangle</button>
                <button onClick={() => setTool('pen')} style={{
                    fontWeight: tool === 'pen' ? 'bold' : 'normal',
                    color: tool === 'pen' ? '#2563eb' : '#333',
                    border: 'none', background: 'none', cursor: 'pointer'
                }}>Pen</button>
            </div>

            <svg
                ref={svgRef}
                style={{ width: '100%', height: '100%', cursor: tool === 'select' ? (dragState ? 'grabbing' : 'default') : 'crosshair' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            ></svg>
            <div style={{ position: 'absolute', bottom: 10, right: 10, fontSize: 12, color: '#94a3b8' }}>
                Powered by @plait/core
            </div>
        </div>
    );
};
