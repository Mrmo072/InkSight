import { describe, expect, it, vi, beforeEach } from 'vitest';

const boardToImage = vi.fn();
const base64ToBlob = vi.fn(() => new Blob(['image']));
const download = vi.fn();
const getSelectedElements = vi.fn(() => []);
const toSvgData = vi.fn(() => Promise.resolve('<svg />'));
const getBackgroundColor = vi.fn(() => '#123456');
const isWhite = vi.fn(() => false);
const setFontSize = vi.fn();

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
  toSvgData,
  PlaitBoard: {
    getThemeColors: vi.fn(() => []),
  },
}));

vi.mock('@plait/text-plugins', () => ({
  DEFAULT_FONT_SIZE: 14,
  TextTransforms: {
    setFontSize,
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
    toSvgData.mockReset();
    toSvgData.mockResolvedValue('<svg />');
    setFontSize.mockReset();
  });

  it('serializes theme alongside InkSight extra data', async () => {
    const { serializeAsJSON } = await import('../src/drawnix/drawnix/src/data/json.ts');
    const board = {
      children: [{ id: 'node-1' }],
      viewport: { zoom: 1 },
      theme: { themeColorMode: 'dark' },
    };

    const json = serializeAsJSON(board as any, { bookName: 'Example.pdf' });
    const parsed = JSON.parse(json);

    expect(parsed.theme).toEqual({ themeColorMode: 'dark' });
    expect(parsed.bookName).toBe('Example.pdf');
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

  it('uses transparent fill for white SVG backgrounds', async () => {
    isWhite.mockReturnValue(true);
    const { saveAsSvg } = await import('../src/drawnix/drawnix/src/utils/image.ts');

    await saveAsSvg({ theme: { themeColorMode: 'default' } } as any);

    expect(toSvgData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fillStyle: 'TRANSPARENT',
      })
    );
    expect(download).toHaveBeenCalled();
  });

  it('applies text font size through text transforms', async () => {
    const { setTextFontSize } = await import('../src/drawnix/drawnix/src/transforms/property.ts');
    const board = { children: [] };

    setTextFontSize(board as any, 18);

    expect(setFontSize).toHaveBeenCalledWith(board, '18', 14);
  });
});
