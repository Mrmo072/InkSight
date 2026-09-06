import { describe, expect, it, vi } from 'vitest';
import { buildRecoveryDiagnostics, chooseDocumentTarget, findLoadedDocumentMatch, reconcileDocumentRegistrationState } from '../document-relink.js';

function createDocumentManager(overrides = {}) {
    const documents = overrides.documents ?? [
        { id: 'doc-1', name: 'Book.pdf', type: 'application/pdf', loaded: false },
        { id: 'doc-2', name: 'Notes.md', type: 'text/markdown', loaded: false }
    ];

    const manager = {
        getDocumentInfo: vi.fn((id) => documents.find((doc) => doc.id === id) ?? null),
        findRestorableMatch: vi.fn(({ name, type }) => documents.find((doc) => doc.name === name && doc.type === type && !doc.loaded) ?? null),
        isTypeCompatible: vi.fn((expected, actual) => !expected || !actual || expected === actual),
        getAllDocuments: vi.fn(() => documents),
        getMissingDocuments: vi.fn(() => documents.filter((doc) => !doc.loaded)),
        markDocumentLoaded: vi.fn((id, loaded) => {
            const doc = documents.find((item) => item.id === id);
            if (doc) {
                doc.loaded = loaded;
            }
        }),
        registerDocument: vi.fn((id, name, type, loaded) => {
            documents.push({ id, name, type, loaded });
        }),
        ...overrides
    };
    return manager;
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

    it('reconciles stale unloaded flags against the file library', () => {
        const documentManager = createDocumentManager({
            documents: [
                { id: 'doc-1', name: 'Book.pdf', type: 'application/pdf', loaded: false },
                { id: 'doc-2', name: 'Notes.md', type: 'text/markdown', loaded: true }
            ]
        });

        const repaired = reconcileDocumentRegistrationState({
            files: [
                { id: 'doc-1', name: 'Book.pdf', type: 'application/pdf' },
                { id: 'doc-2', name: 'Notes.md', type: 'text/markdown' }
            ],
            documentManager
        });

        expect(repaired).toBe(1);
        expect(documentManager.markDocumentLoaded).toHaveBeenCalledWith('doc-1', true);
        expect(documentManager.getMissingDocuments()).toHaveLength(0);
    });

    it('registers library files that are missing from the document registry', () => {
        const documentManager = createDocumentManager({
            documents: []
        });

        const repaired = reconcileDocumentRegistrationState({
            files: [{ id: 'doc-9', name: 'New.pdf', type: 'application/pdf' }],
            documentManager
        });

        expect(repaired).toBe(1);
        expect(documentManager.registerDocument).toHaveBeenCalledWith('doc-9', 'New.pdf', 'application/pdf', true);
    });

    it('ignores empty inputs', () => {
        expect(reconcileDocumentRegistrationState({ files: [], documentManager: null })).toBe(0);
        expect(reconcileDocumentRegistrationState({ files: null })).toBe(0);
    });
});
