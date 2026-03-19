import { describe, expect, it, vi, beforeEach } from 'vitest';

const boardToImage = vi.fn();
const base64ToBlob = vi.fn(() => new Blob(['image']));
const download = vi.fn();
const getSelectedElements = vi.fn(() => []);
const getBackgroundColor = vi.fn(() => '#123456');
const isWhite = vi.fn(() => false);
const setFontSize = vi.fn();
const saveInksightFile = vi.fn();
const getAppContext = vi.fn(() => ({
  currentBook: {
    name: 'Example.pdf',
  },
}));

vi.mock('../src/drawnix/drawnix/src/utils/common', () => ({
  boardToImage,
  base64ToBlob,
  download,
}));

vi.mock('../src/drawnix/drawnix/src/utils/color', () => ({
  getBackgroundColor,
  isWhite,
}));

vi.mock('@plait/core', () => ({
  DEFAULT_COLOR: '#000000',
  getSelectedElements,
  ThemeColorMode: {
    default: 'default',
  },
  PlaitPointerType: {
    hand: 'hand',
    selection: 'selection',
  },
  BoardTransforms: {
    updatePointerType: vi.fn(),
  },
  PlaitBoard: {
    getThemeColors: vi.fn(() => []),
    getMovingPointInBoard: vi.fn(() => true),
    isMovingPointInBoard: vi.fn(() => false),
    hasBeenTextEditing: vi.fn(() => false),
    getHost: vi.fn((board) => board.host),
  },
}));

vi.mock('@plait/text-plugins', () => ({
  DEFAULT_FONT_SIZE: 14,
  TextTransforms: {
    setFontSize,
  },
}));

vi.mock('../src/inksight-file/inksight-file-io.js', () => ({
  saveInksightFile,
}));

vi.mock('../src/app/app-context.js', () => ({
  getAppContext,
}));

vi.mock('@plait/common', () => ({
  BoardCreationMode: {
    dnd: 'dnd',
    drawing: 'drawing',
  },
  setCreationMode: vi.fn(),
}));

vi.mock('@plait/mind', () => ({
  MindPointerType: {
    mind: 'mind',
  },
}));

vi.mock('@plait/draw', () => ({
  ArrowLineShape: {
    straight: 'straight',
  },
  BasicShapes: {
    rectangle: 'rectangle',
    ellipse: 'ellipse',
    text: 'text',
  },
}));

describe('Drawnix synced updates', () => {
  beforeEach(() => {
    boardToImage.mockReset();
    base64ToBlob.mockClear();
    download.mockClear();
    getSelectedElements.mockReset();
    getSelectedElements.mockReturnValue([]);
    getBackgroundColor.mockReset();
    getBackgroundColor.mockReturnValue('#123456');
    isWhite.mockReset();
    isWhite.mockReturnValue(false);
    setFontSize.mockReset();
    saveInksightFile.mockReset();
    getAppContext.mockClear();
  });

  it('serializes generic board data including theme', async () => {
    const { serializeAsJSON } = await import('../src/drawnix/drawnix/src/data/json.ts');
    const board = {
      children: [{ id: 'node-1' }],
      viewport: { zoom: 1 },
      theme: { themeColorMode: 'dark' },
    };

    const json = serializeAsJSON(board as any);
    const parsed = JSON.parse(json);

    expect(parsed.theme).toEqual({ themeColorMode: 'dark' });
    expect(parsed.elements).toEqual([{ id: 'node-1' }]);
  });

  it('uses the board background color for non-transparent image exports', async () => {
    boardToImage.mockResolvedValue('data:image/jpeg;base64,abc');
    const { saveAsImage } = await import('../src/drawnix/drawnix/src/utils/image.ts');

    saveAsImage({ theme: { themeColorMode: 'dark' } } as any, false);
    await Promise.resolve();

    expect(boardToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fillStyle: '#123456',
      })
    );
    expect(download).toHaveBeenCalled();
  });

  it('keeps transparent exports transparent', async () => {
    boardToImage.mockResolvedValue('data:image/png;base64,abc');
    const { saveAsImage } = await import('../src/drawnix/drawnix/src/utils/image.ts');

    saveAsImage({ theme: { themeColorMode: 'dark' } } as any, true);
    await Promise.resolve();

    expect(boardToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fillStyle: 'transparent',
      })
    );
  });

  it('exports svg from the current board host and keeps white backgrounds transparent', async () => {
    isWhite.mockReturnValue(true);
    const { saveAsSvg } = await import('../src/drawnix/drawnix/src/utils/image.ts');
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.setAttribute('viewBox', '0 0 200 100');
    host.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'));

    await saveAsSvg({
      theme: { themeColorMode: 'default' },
      host,
    } as any);

    expect(download).toHaveBeenCalled();
    const [blob, filename] = download.mock.calls[0];
    expect(filename).toMatch(/\.svg$/);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('applies text font size through text transforms', async () => {
    const { setTextFontSize } = await import('../src/drawnix/drawnix/src/transforms/property.ts');
    const board = { children: [] };

    setTextFontSize(board as any, 18);

    expect(setFontSize).toHaveBeenCalledWith(board, '18', 14);
  });

  it('routes hotkey save through the InkSight file adapter', async () => {
    const { buildDrawnixHotkeyPlugin } = await import('../src/drawnix/drawnix/src/plugins/with-hotkey.ts');
    const board = {
      globalKeyDown: vi.fn(),
      keyDown: vi.fn(),
    };
    const plugin = buildDrawnixHotkeyPlugin(vi.fn());
    plugin(board as any);

    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true });
    Object.defineProperty(event, 'target', {
      value: document.createElement('div'),
    });

    board.globalKeyDown(event);

    expect(saveInksightFile).toHaveBeenCalledWith({
      board,
      appContext: {
        currentBook: {
          name: 'Example.pdf',
        },
      },
      name: 'Example',
    });
  });
});
