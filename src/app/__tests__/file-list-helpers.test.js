import { describe, expect, it } from 'vitest';
import { buildDocumentRemovalPrompt, reorderFilesById } from '../file-list-helpers.js';

describe('file list helpers', () => {
    it('reorders files by target index', () => {
        const files = [
            { id: 'a', name: 'A.pdf' },
            { id: 'b', name: 'B.pdf' },
            { id: 'c', name: 'C.pdf' }
        ];

        expect(reorderFilesById(files, 'c', 0).map((file) => file.id)).toEqual(['c', 'a', 'b']);
        expect(reorderFilesById(files, 'a', 2).map((file) => file.id)).toEqual(['b', 'c', 'a']);
    });

    it('builds a detailed removal prompt when references exist', () => {
        const prompt = buildDocumentRemovalPrompt({
            name: 'Sample.pdf',
            cardCount: 2,
            highlightCount: 1,
            isCurrentDocument: true
        });

        expect(prompt).toContain('Sample.pdf');
        expect(prompt).toContain('2 linked cards');
        expect(prompt).toContain('1 linked highlight');
        expect(prompt).toContain('currently open document');
    });
});
