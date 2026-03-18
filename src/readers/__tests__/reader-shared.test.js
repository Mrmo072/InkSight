import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    applyReaderSelectionMode,
    clearSelectedHighlightState,
    deleteSelectedReaderHighlight,
    handleReaderHighlightClick,
    registerHighlightToolbarDeletionHandler
} from '../reader-shared.js';

describe('reader-shared', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('clears selected highlight state and hides the toolbar', () => {
        const reader = {
            selectedHighlightId: 'h-1',
            toolbar: { hide: vi.fn() }
        };

        clearSelectedHighlightState(reader);

        expect(reader.selectedHighlightId).toBeNull();
        expect(reader.toolbar.hide).toHaveBeenCalled();
    });

    it('routes highlight click through the toolbar and optional callback', () => {
        const reader = {
            selectedHighlightId: null,
            toolbar: { handleHighlightClick: vi.fn() }
        };
        const afterClick = vi.fn();
        const event = { target: document.createElement('div') };

        handleReaderHighlightClick(reader, event, 'h-1', 'c-1', afterClick);

        expect(reader.selectedHighlightId).toBe('h-1');
        expect(reader.toolbar.handleHighlightClick).toHaveBeenCalledWith(event, 'h-1', 'c-1');
        expect(afterClick).toHaveBeenCalledWith({ highlightId: 'h-1', cardId: 'c-1' });
    });

    it('applies reader selection mode styles for text and pan modes', () => {
        const container = document.createElement('div');
        const content = document.createElement('div');

        applyReaderSelectionMode({ container, mode: 'text', targetElements: [content] });
        expect(container.classList.contains('disable-selection')).toBe(false);
        expect(container.style.cursor).toBe('text');
        expect(container.style.touchAction).toBe('pan-x pan-y pinch-zoom');
        expect(content.style.userSelect).toBe('text');

        applyReaderSelectionMode({ container, mode: 'pan', targetElements: [content] });
        expect(container.classList.contains('disable-selection')).toBe(true);
        expect(container.style.cursor).toBe('grab');
        expect(container.style.touchAction).toBe('none');
        expect(content.style.userSelect).toBe('none');
    });

    it('deletes the selected reader highlight and clears selection state', () => {
        const reader = {
            selectedHighlightId: 'h-1',
            toolbar: { hide: vi.fn() },
            getCardSystem: () => ({
                cards: new Map([
                    ['c-1', { id: 'c-1', highlightId: 'h-1' }]
                ])
            }),
            deleteHighlight: vi.fn()
        };

        const deleted = deleteSelectedReaderHighlight(reader);

        expect(deleted).toBe(true);
        expect(reader.deleteHighlight).toHaveBeenCalledWith('h-1', 'c-1');
        expect(reader.selectedHighlightId).toBeNull();
        expect(reader.toolbar.hide).toHaveBeenCalled();
    });

    it('creates a toolbar deletion handler that respects before/after hooks', () => {
        const reader = {
            selectedHighlightId: null,
            deleteHighlight: vi.fn()
        };
        const beforeDelete = vi.fn(() => true);
        const afterDelete = vi.fn();

        const handler = registerHighlightToolbarDeletionHandler(reader, {
            getSelectedHighlightId: () => 'h-9',
            getSelectedCardId: () => 'c-9',
            beforeDelete,
            afterDelete
        });

        const event = {
            key: 'Delete',
            preventDefault: vi.fn()
        };

        handler(event);

        expect(beforeDelete).toHaveBeenCalledWith(event);
        expect(reader.deleteHighlight).toHaveBeenCalledWith('h-9', 'c-9');
        expect(afterDelete).toHaveBeenCalledWith('h-9', 'c-9');
    });
});
