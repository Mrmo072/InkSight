import React from 'react';
import { Check, NoColorIcon } from './icons';
import Stack from '../components/stack';
import './color-picker.scss';
import { splitRows } from '../utils/common';
import {
    isDefaultStroke,
    isNoColor,
} from '../utils/color';
import {
    DEFAULT_COLOR,
    PlaitHistoryBoard,
} from '@plait/core';
import {
    CLASSIC_COLORS,
    NO_COLOR,
    TRANSPARENT,
    WHITE,
} from '../constants/color';
import { Translations } from '../i18n';

const ROWS_CLASSIC_COLORS = splitRows(CLASSIC_COLORS, 5);

export type ColorPaletteProps = {
    selectedColor: string;
    onColorChange: (color: string) => void;
    t: (key: keyof Translations) => string;
};

export const ColorPalette: React.FC<ColorPaletteProps> = ({ selectedColor, onColorChange, t }) => {
    return (
        <Stack.Col gap={2}>
            {ROWS_CLASSIC_COLORS.map((colors, index) => (
                <Stack.Row key={index} gap={2}>
                    {colors.map((color) => {
                        return (
                            <button
                                key={color.value}
                                className={`color-select-item ${selectedColor === color.value ? 'active' : ''
                                    } ${isNoColor(color.value) ? 'no-color' : ''}`}
                                style={{
                                    backgroundColor: isNoColor(color.value)
                                        ? TRANSPARENT
                                        : color.value,
                                    color: isDefaultStroke(color.value)
                                        ? WHITE
                                        : DEFAULT_COLOR,
                                }}
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent bubbling
                                    onColorChange(color.value);
                                }}
                                title={t((color.name || 'color.unknown') as keyof Translations)}
                                aria-label={t((color.name || 'color.unknown') as keyof Translations)}
                            >
                                {isNoColor(color.value) && NoColorIcon}
                                {selectedColor === color.value && Check}
                            </button>
                        );
                    })}
                </Stack.Row>
            ))}
        </Stack.Col>
    );
};
