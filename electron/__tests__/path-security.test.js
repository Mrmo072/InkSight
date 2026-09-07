import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { assertSafePathSegment, resolvePathWithin } = require('../path-security.cjs');

describe('Electron path security', () => {
    const root = path.resolve('runtime-data', 'project');

    it('resolves ordinary child paths inside the root', () => {
        expect(resolvePathWithin(root, 'documents/book.epub')).toBe(
            path.join(root, 'documents', 'book.epub')
        );
    });

    it('rejects traversal and absolute paths', () => {
        expect(() => resolvePathWithin(root, '../../outside.txt')).toThrow('escapes');
        expect(() => resolvePathWithin(root, path.resolve('outside.txt'))).toThrow('escapes');
    });

    it('only accepts a single safe snapshot segment', () => {
        expect(assertSafePathSegment('1730000000000-workspace')).toBe('1730000000000-workspace');
        expect(() => assertSafePathSegment('../snapshot')).toThrow('invalid');
        expect(() => assertSafePathSegment('folder/snapshot')).toThrow('invalid');
    });
});
