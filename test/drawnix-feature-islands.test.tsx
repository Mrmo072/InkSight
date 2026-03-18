import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mermaidModuleLoadCount = 0;
let markdownModuleLoadCount = 0;

const parseMermaidToDrawnix = vi.fn(async () => ({ elements: [{ id: 'mermaid-node', points: [[0, 0], [10, 10]] }] }));
const parseMarkdownToDrawnix = vi.fn(async () => ({ id: 'markdown-node', points: [[0, 0]], children: [] }));
const setAppState = vi.fn();
const insertFragment = vi.fn();

vi.mock('@plait-board/mermaid-to-drawnix', async () => {
    mermaidModuleLoadCount += 1;
    return {
        parseMermaidToDrawnix
    };
});

vi.mock('@plait-board/markdown-to-drawnix', async () => {
    markdownModuleLoadCount += 1;
    return {
        parseMarkdownToDrawnix
    };
});

vi.mock('../src/drawnix/drawnix/src/hooks/use-drawnix', () => ({
    useDrawnix: () => ({
        appState: { openDialogType: 'test' },
        setAppState
    })
}));

vi.mock('../src/drawnix/drawnix/src/i18n', () => ({
    useI18n: () => ({
        language: 'en',
        t: (key: string) => key
    })
}));

vi.mock('@plait-board/react-board', () => ({
    useBoard: () => ({
        viewport: { zoom: 1 },
        insertFragment
    })
}));

vi.mock('@plait/core', async () => {
    const actual = await vi.importActual<object>('@plait/core');
    return {
        ...actual,
        getViewportOrigination: () => [0, 0],
        PlaitBoard: {
            getBoardContainer: () => ({
                getBoundingClientRect: () => ({ width: 800, height: 600 })
            })
        },
        PlaitGroupElement: {
            isGroup: () => false
        },
        RectangleClient: {
            getBoundingRectangle: () => ({ width: 10, height: 10 }),
            getRectangleByPoints: () => ({})
        },
        WritableClipboardOperationType: {
            paste: 'paste'
        }
    };
});

vi.mock('../src/drawnix/drawnix/src/components/ttd-dialog/ttd-dialog-output.tsx', () => ({
    TTDDialogOutput: ({ loaded, error }: { loaded: boolean; error: Error | null }) => (
        <div data-testid="ttd-output">
            {loaded ? 'loaded' : 'idle'}
            {error ? error.message : ''}
        </div>
    )
}));

describe('Drawnix feature islands', () => {
    beforeEach(() => {
        vi.resetModules();
        mermaidModuleLoadCount = 0;
        markdownModuleLoadCount = 0;
        parseMermaidToDrawnix.mockClear();
        parseMarkdownToDrawnix.mockClear();
        setAppState.mockClear();
        insertFragment.mockClear();
    });

    it('loads mermaid conversion only after preview is requested', async () => {
        const { default: MermaidToDrawnix } = await import('../src/drawnix/drawnix/src/components/ttd-dialog/mermaid-to-drawnix.tsx');

        render(<MermaidToDrawnix />);

        expect(mermaidModuleLoadCount).toBe(0);
        expect(parseMermaidToDrawnix).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('dialog.mermaid.insert'));

        await waitFor(() => {
            expect(mermaidModuleLoadCount).toBe(1);
            expect(parseMermaidToDrawnix).toHaveBeenCalled();
        });
    });

    it('loads markdown conversion only after preview is requested', async () => {
        const { default: MarkdownToDrawnix } = await import('../src/drawnix/drawnix/src/components/ttd-dialog/markdown-to-drawnix.tsx');

        render(<MarkdownToDrawnix />);

        expect(markdownModuleLoadCount).toBe(0);
        expect(parseMarkdownToDrawnix).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('dialog.markdown.insert'));

        await waitFor(() => {
            expect(markdownModuleLoadCount).toBe(1);
            expect(parseMarkdownToDrawnix).toHaveBeenCalled();
        });
    });
});
