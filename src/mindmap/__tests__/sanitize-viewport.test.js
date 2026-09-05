import { describe, expect, it } from 'vitest';
import { sanitizeViewport } from '../drawnix-board-state.js';

describe('sanitizeViewport', () => {
    it('keeps a healthy viewport untouched', () => {
        const vp = { zoom: 1.5, x: 10, y: -20 };
        expect(sanitizeViewport(vp)).toEqual(vp);
    });

    it('resets a corrupted zoom (Infinity) to 1', () => {
        expect(sanitizeViewport({ zoom: Infinity, x: 5 }).zoom).toBe(1);
        expect(sanitizeViewport({ zoom: -Infinity }).zoom).toBe(1);
        expect(sanitizeViewport({ zoom: NaN }).zoom).toBe(1);
        expect(sanitizeViewport({ zoom: 999 }).zoom).toBe(1);
    });

    it('resets non-finite coordinates to 0', () => {
        expect(sanitizeViewport({ zoom: 1, x: Infinity, y: NaN })).toEqual({ zoom: 1, x: 0, y: 0 });
    });

    it('returns null for invalid input', () => {
        expect(sanitizeViewport(null)).toBeNull();
        expect(sanitizeViewport('nope')).toBeNull();
    });
});
