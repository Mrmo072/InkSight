import React, { useState, useEffect } from 'react';
import { ToolButton } from '../../tool-button';
import { PlaitBoard, Transforms, getSelectedElements } from '@plait/core';
import { StraightLineIcon } from '../../icons';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { useI18n } from '../../../i18n';
import { ArrowPicker, LINE_SHAPES } from '../../arrow-picker';
import { ArrowLineShape } from '@plait/draw';

export interface PopupArrowShapeButtonProps {
    board: PlaitBoard;
    currentPointer?: string;
}

export const PopupArrowShapeButton: React.FC<PopupArrowShapeButtonProps> = ({
    board,
    currentPointer
}) => {
    const [isPopoverOpen, setIsPopoverrOpen] = useState(false);
    const container = PlaitBoard.getBoardContainer(board);
    const { t } = useI18n();

    // Determine current icon
    // Use LINE_SHAPES for lookup
    const selectedIcon = LINE_SHAPES.find(a => a.pointer === currentPointer)?.icon || StraightLineIcon;
    const title = t('toolbar.lineShape' as any);

    return (
        <Popover
            sideOffset={12}
            open={isPopoverOpen}
            onOpenChange={(open) => {
                setIsPopoverrOpen(open);
            }}
            placement={'top'}
        >
            <PopoverTrigger asChild>
                <ToolButton
                    className="property-button"
                    visible={true}
                    icon={selectedIcon}
                    type="button"
                    title={title}
                    aria-label={title}
                    selected={isPopoverOpen}
                    onPointerUp={() => {
                        setIsPopoverrOpen(!isPopoverOpen);
                    }}
                ></ToolButton>
            </PopoverTrigger>
            <PopoverContent container={container}>
                <ArrowPicker
                    items={LINE_SHAPES}
                    noSwitchTool={true}
                    onPointerUp={(pointer) => {
                        // 1. Update Selected Elements
                        const selectedElements = getSelectedElements(board);
                        const arrowElements = selectedElements.filter(el =>
                            // Ideally check PlaitDrawElement.isArrowLine(el)
                            // But we can just try to update 'shape' property
                            (el as any).type === 'arrow-line' || (el as any).type === 'line'
                        );

                        if (arrowElements.length > 0) {
                            // Apply new shape
                            // Transforms.setNode(board, { shape: pointer }, arrowElements);
                            // We need path for setNode.
                            // Or use BoardTransforms if available for bulk update?
                            // Standard `Transforms.setNode` accepts path.
                            // Let's iterate or find a bulk method.
                            arrowElements.forEach(el => {
                                const path = PlaitBoard.findPath(board, el);
                                Transforms.setNode(board, { shape: pointer as ArrowLineShape }, path);
                            });
                        }

                        // 2. Sync Global Toolbar & Persistence
                        localStorage.setItem('drawnix-arrow-shape', pointer as string);
                        window.dispatchEvent(new CustomEvent('drawnix-arrow-shape-changed', { detail: pointer }));

                        // 3. Close popover
                        setIsPopoverrOpen(false);
                    }}
                />
            </PopoverContent>
        </Popover>
    );
};
