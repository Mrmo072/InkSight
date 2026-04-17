import { describe, expect, it, vi } from 'vitest';
import { resolveImportDecision } from '../import-decision.js';

function createDocumentManager() {
    return {
        normalizeDocumentName: vi.fn((value) => String(value ?? '').trim().toLowerCase()),
        isTypeCompatible: vi.fn((left, right) => left === right),
        getDocumentInfo: vi.fn((id) => ({
            'missing-1': { id: 'missing-1', name: 'Draft.pdf', type: 'application/pdf', loaded: false }
        }[id] ?? null)),
        findRestorableMatch: vi.fn(({ name }) => name === 'Draft.pdf'
            ? { id: 'missing-1', name: 'Draft.pdf', type: 'application/pdf', loaded: false }
            : null)
    };
}

describe('import-decision', () => {
    it('prefers relink-only when a pending relink exists', () => {
        const decision = resolveImportDecision({
            file: { name: 'Draft.pdf', type: 'application/pdf' },
            pendingDocumentImport: { id: 'missing-1', type: 'application/pdf' },
            documentManager: createDocumentManager(),
            currentFiles: []
        });

        expect(decision).toEqual({
            mode: 'relink-only',
            targetDocumentId: 'missing-1',
            reason: 'pending-relink'
        });
    });

    it('supports replace mode for loaded duplicates', () => {
        const decision = resolveImportDecision({
            file: { name: 'Draft.pdf', type: 'application/pdf' },
            documentManager: createDocumentManager(),
            currentFiles: [{ id: 'doc-1', name: 'Draft.pdf', type: 'application/pdf' }],
            prompt: vi.fn(() => 'replace')
        });

        expect(decision).toEqual({
            mode: 'replace',
            targetDocumentId: 'doc-1',
            reason: 'loaded-duplicate'
        });
    });

    it('supports relink-only mode when matching an unloaded saved document', () => {
        const decision = resolveImportDecision({
            file: { name: 'Draft.pdf', type: 'application/pdf' },
            documentManager: createDocumentManager(),
            currentFiles: [],
            prompt: vi.fn(() => 'relink-only')
        });

        expect(decision).toEqual({
            mode: 'relink-only',
            targetDocumentId: 'missing-1',
            reason: 'missing-document-match'
        });
    });
});
