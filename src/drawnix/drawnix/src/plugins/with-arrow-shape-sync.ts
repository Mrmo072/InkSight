import { PlaitBoard, PlaitElement, PlaitPlugin, PlaitPointerType, Transforms } from '@plait/core';
import { ArrowLineShape } from '@plait/draw';

export const withArrowShapeSync = (board: PlaitBoard) => {
    const { apply } = board;

    board.apply = (op) => {
        if (op.type === 'insert_node') {
            const node = op.node as any;
            const hasSourceTarget = node.source && node.target;
            const isArrowLine = node.type === 'arrow-line' || node.type === 'line';

            if (hasSourceTarget || isArrowLine) {
                const storedShape = localStorage.getItem('drawnix-arrow-shape');
                // Allow 'straight', 'elbow', 'curve'
                if (storedShape && ['straight', 'elbow', 'curve'].includes(storedShape)) {
                    /* eslint-disable no-param-reassign */
                    node.shape = storedShape;
                }
            }
        }
        apply(op);
    };

    return board;
};
