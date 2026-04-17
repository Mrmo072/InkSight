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
        expect(content).toContain('--《研究项目》');
        expect(content).not.toContain('Excerpt: 核心论点');
        expect(content).not.toContain('Source: 研究项目.pdf');
    });

    it('builds a citation list in excerpt-plus-title format', () => {
        const content = buildCitationList(appContext);

        expect(content).toContain('# Citation List');
        expect(content).toContain('1. 一段关键引文');
        expect(content).toContain('--《研究项目》');
        expect(content).not.toContain('Location:');
        expect(content).not.toContain('Linked card');
    });

    it('skips deleted cards and orphaned highlights when building citation exports', () => {
        appContext.cardSystem.cards.set('card-3', {
            id: 'card-3',
            content: '已删除摘录',
            sourceName: '研究项目.pdf',
            highlightId: 'highlight-deleted',
            deleted: true
        });
        appContext.highlightManager.highlights.push({
            id: 'highlight-deleted',
            text: '已删除摘录',
            sourceId: 'doc-1',
            sourceName: '研究项目.pdf',
            location: { page: 99 }
        });
        appContext.highlightManager.highlights.push({
            id: 'highlight-orphan',
            text: '孤立高亮',
            sourceId: 'doc-1',
            sourceName: '研究项目.pdf',
            location: { page: 100 }
        });

        const content = buildCitationList(appContext);

        expect(content).toContain('一段关键引文');
        expect(content).not.toContain('已删除摘录');
        expect(content).not.toContain('孤立高亮');
    });

    it('formats line-based locations when validation status is shown', () => {
        appContext.cardSystem.cards.set('card-text', {
            id: 'card-text',
            content: '文本摘录',
            sourceName: 'notes.md',
            highlightId: 'highlight-text',
            isOnBoard: false
        });
        appContext.highlightManager.highlights.push({
            id: 'highlight-text',
            text: '文本摘录',
            sourceId: 'doc-2',
            sourceName: 'notes.md',
            location: { lineStart: 3, lineEnd: 5 },
            needsValidation: true
        });

        const content = buildCitationList(appContext);

        expect(content).toContain('Lines 3-5');
    });

    it('builds a reading notes package with overview and unmapped notes', () => {
        const content = buildReadingNotesPackage(appContext);

        expect(content).toContain('## Project Overview');
        expect(content).toContain('## Documents');
        expect(content).toContain('## Unmapped Notes');
        expect(content).toContain('--《研究项目》');
    });

    it('exports image cards with a project-relative markdown image link when available', () => {
        appContext.cardSystem.cards.set('card-image', {
            id: 'card-image',
            type: 'image',
            imageData: 'data:image/png;base64,AAA',
            projectAssetPath: 'assets/0001-card-image.png',
            sourceName: '图像材料.pdf',
            highlightType: 'rectangle',
            location: { page: 4 },
            isOnBoard: false
        });

        const content = buildReadingNotesPackage(appContext);

        expect(content).toContain('Rectangle capture (Page 4) - 图像材料');
        expect(content).toContain('![](./assets/0001-card-image.png)');
        expect(content).toContain('Image link works when this Markdown file is placed in the project root folder.');
        expect(content).not.toContain('data:image/png;base64,AAA');
        expect(content).not.toContain('Untitled card');
    });

    it('falls back to compact image export text when no saved project asset path exists', () => {
        appContext.cardSystem.cards.set('card-image', {
            id: 'card-image',
            type: 'image',
            imageData: 'data:image/png;base64,AAA',
            sourceName: '图像材料.pdf',
            highlightType: 'rectangle',
            location: { page: 4 },
            isOnBoard: false
        });

        const content = buildReadingNotesPackage(appContext);

        expect(content).toContain('Image omitted from Markdown export to keep the file compact.');
        expect(content).not.toContain('![](./assets/');
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

    it('blocks markdown export when image cards have not been saved into the project folder', () => {
        const notify = vi.fn();
        appContext.cardSystem.cards.set('card-image', {
            id: 'card-image',
            type: 'image',
            imageData: 'data:image/png;base64,AAA',
            sourceName: '图像材料.pdf',
            highlightType: 'rectangle',
            location: { page: 4 },
            isOnBoard: false
        });

        const result = exportWorkspaceArtifact({
            type: 'notes-package',
            appContext,
            notify
        });

        expect(result).toBe(false);
        expect(notify).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Save Project Before Export',
            level: 'warning'
        }));
    });
});
