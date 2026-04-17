import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildCitationList,
    buildMarkdownOutline,
    buildReadingNotesPackage,
    exportWorkspaceArtifact
} from '../workspace-export.js';

describe('workspace-export', () => {
    let appContext;

    beforeEach(() => {
        appContext = {
            currentBook: { name: '研究项目.pdf' },
            cardSystem: {
                cards: new Map([
                    ['card-1', {
                        id: 'card-1',
                        content: '核心论点',
                        note: '需要展开',
                        sourceName: '研究项目.pdf',
                        highlightId: 'highlight-1',
                        isOnBoard: true
                    }],
                    ['card-2', {
                        id: 'card-2',
                        content: '孤立摘录',
                        note: '',
                        sourceName: '补充材料.md',
                        isOnBoard: false
                    }]
                ]),
                connections: []
            },
            highlightManager: {
                highlights: [{
                    id: 'highlight-1',
                    text: '一段关键引文',
                    sourceId: 'doc-1',
                    sourceName: '研究项目.pdf',
                    location: { page: 12 }
                }]
            },
            documentManager: {
                getAllDocuments: () => [
                    { id: 'doc-1', name: '研究项目.pdf', type: 'application/pdf', loaded: true },
                    { id: 'doc-2', name: '补充材料.md', type: 'text/markdown', loaded: true }
                ],
                getDocumentInfo: () => ({ name: '研究项目.pdf' })
            }
        };
    });

    it('builds a markdown outline with loose cards', () => {
        const content = buildMarkdownOutline(appContext);

        expect(content).toContain('# Markdown Outline');
        expect(content).toContain('## Loose Cards');
        expect(content).toContain('孤立摘录');
    });

    it('builds a citation list with location and linked card title', () => {
        const content = buildCitationList(appContext);

        expect(content).toContain('# Citation List');
        expect(content).toContain('Location: Page 12');
        expect(content).toContain('Linked card');
    });

    it('builds a reading notes package with overview and unmapped notes', () => {
        const content = buildReadingNotesPackage(appContext);

        expect(content).toContain('## Project Overview');
        expect(content).toContain('## Documents');
        expect(content).toContain('## Unmapped Notes');
    });

    it('skips export when there is no workspace content', () => {
        const notify = vi.fn();
        const result = exportWorkspaceArtifact({
            type: 'outline',
            appContext: {
                currentBook: { name: 'Empty' },
                cardSystem: { cards: new Map(), connections: [] },
                highlightManager: { highlights: [] },
                documentManager: { getAllDocuments: () => [] }
            },
            notify
        });

        expect(result).toBe(false);
        expect(notify).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Export Skipped'
        }));
    });
});
