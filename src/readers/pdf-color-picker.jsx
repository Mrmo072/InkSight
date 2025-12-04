import React from 'react';
import { ColorPalette } from '../drawnix/drawnix/src/components/color-palette';
import { i18nInsidePlaitHook } from '../drawnix/drawnix/src/i18n';

export const PDFColorPicker = ({ selectedColor, onColorChange }) => {
    try {
        const { t } = i18nInsidePlaitHook();
        console.log('[PDFColorPicker] Rendering with color:', selectedColor);

        return (
            <div className="pdf-color-picker-wrapper" style={{ padding: '8px' }}>
                <ColorPalette
                    selectedColor={selectedColor}
                    onColorChange={onColorChange}
                    t={t}
                />
            </div>
        );
    } catch (error) {
        console.error('[PDFColorPicker] Error rendering:', error);
        return <div style={{ color: 'red', padding: '10px' }}>Error: {error.message}</div>;
    }
};
