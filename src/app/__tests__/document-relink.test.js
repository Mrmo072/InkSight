import { describe, expect, it, vi } from 'vitest';
import { buildRecoveryDiagnostics, chooseDocumentTarget, findLoadedDocumentMatch } from '../document-relink.js';

function createDocumentManager(overrides = {}) {
    const documents = overrides.documents ?? [
        { id: 'doc-1', name: 'Book.pdf', type: 'application/pdf', loaded: false },
        { id: 'doc-2', name: 'Notes.md', type: 'text/markdown', loaded: false }
    ];

    return {
        getDocumentInfo: vi.fn((id) => documents.find((doc) => doc.id === id) ?? null),
        findRestorableMatch: vi.fn(({ name, type }) => documents.find((doc) => doc.name === name && doc.type === type && !doc.loaded) ?? null),
        isTypeCompatible: vi.fn((expected, actual) => !expected || !actual || expected === actual),
        getAllDocuments: vi.fn(() => documents),
        getMissingDocuments: vi.fn(() => documents.filter((doc) => !doc.loaded)),
        ...overrides
    };
}

describe('document relink helpers', () => {
    it('prefers the explicitly pending document when relinking a chosen source file', () => {
        const documentManager = createDocumentManager();
        const target = chooseDocumentTarget({
            file: { name: 'Something Else.pdf', type: 'application/pdf' },
            pendingDocumentImport: { id: 'doc-1', type: 'application/pdf' },
            documentManager
        });

        expect(target).toEqual(expect.objectContaining({ id: 'doc-1' }));
    });

    it('matches missing documents by name and type while avoiding already reserved ids', () => {
        const documentManager = createDocumentManager();

        expect(chooseDocumentTarget({
            file: { name: 'Book.pdf', type: 'application/pdf' },
            documentManager,
            reservedIds: new Set()
        })).toEqual(expect.objectContaining({ id: 'doc-1' }));

        expect(chooseDocumentTarget({
            file: { name: 'Book.pdf', type: 'application/pdf' },
            documentManager,
            reservedIds: new Set(['doc-1'])
        })).toBeNull();
    });

    it('builds recovery diagnostics for unresolved cards and highlights', () => {
        const diagnostics = buildRecoveryDiagnostics({
            documentManager: createDocumentManager({
                documents: [
                    { id: 'doc-1', name: 'Book.pdf', type: 'application/pdf', loaded: false },
                    { id: 'doc-2', name: 'Loaded.pdf', type: 'application/pdf', loaded: true }
                ]
            }),
            cardSystem: {
                cards: new Map([
                    ['card-1', { id: 'card-1', sourceId: 'doc-1' }],
                    ['card-2', { id: 'card-2', sourceId: 'doc-2' }],
                    ['card-3', { id: 'card-3', sourceId: 'doc-1', deleted: true }]
                ])
            },
            highlightManager: {
                highlights: [
                    { id: 'hl-1', sourceId: 'doc-1' },
                    { id: 'hl-2', sourceId: 'doc-2' }
                ]
            }
        });

        expect(diagnostics.totalDocuments).toBe(2);
        expect(diagnostics.missingDocuments).toHaveLength(1);
        expect(diagnostics.readyCards).toBe(1);
        expect(diagnostics.readyHighlights).toBe(1);
        expect(diagnostics.unresolvedCards).toEqual([{ id: 'card-1', sourceId: 'doc-1' }]);
        expect(diagnostics.unresolvedHighlights).toEqual([{ id: 'hl-1', sourceId: 'doc-1' }]);
    });

    it('finds a loaded document match for an unresolved restored source', () => {
        const documentManager = createDocumentManager();
        const match = findLoadedDocumentMatch({
            document: { id: 'doc-1', name: 'Book.pdf', type: 'application/pdf', loaded: false },
            loadedDocuments: [
                { id: 'loaded-1', name: 'Book.pdf', type: 'application/pdf', loaded: true },
                { id: 'loaded-2', name: 'Other.pdf', type: 'application/pdf', loaded: true }
            ],
            documentManager
        });

        expect(match).toEqual(expect.objectContaining({ id: 'loaded-1' }));
    });
});
