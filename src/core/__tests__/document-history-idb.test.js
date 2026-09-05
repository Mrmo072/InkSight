import { describe, expect, it } from 'vitest';
import { extractMd5FromContent } from '../document-history-idb.js';

describe('document-history-idb', () => {
    describe('extractMd5FromContent', () => {
        it('reads bookMd5 from an auto-save payload', () => {
            expect(extractMd5FromContent(JSON.stringify({ bookMd5: 'abc123', elements: [] }))).toBe('abc123');
        });

        it('falls back to the top-level md5 field', () => {
            expect(extractMd5FromContent(JSON.stringify({ md5: 'top-level' }))).toBe('top-level');
        });

        it('returns null for invalid JSON or missing fields', () => {
            expect(extractMd5FromContent('not-json{')).toBeNull();
            expect(extractMd5FromContent(JSON.stringify({ elements: [] }))).toBeNull();
        });
    });
});
