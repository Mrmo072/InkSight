import { getSelectedElements, PlaitBoard } from '@plait/core';
import { base64ToBlob, boardToImage, download } from './common';
import { fileOpen } from '../data/filesystem';
import { IMAGE_MIME_TYPES } from '../constants';
import { insertImage } from '../data/image';
import { getBackgroundColor, isWhite } from './color';
import { TRANSPARENT } from '../constants/color';

const SVG_NS = 'http://www.w3.org/2000/svg';

const buildSvgMarkup = (board: PlaitBoard) => {
  const host = PlaitBoard.getHost(board);
  if (!host) {
    return null;
  }

  const clonedHost = host.cloneNode(true) as SVGSVGElement;
  const backgroundColor = getBackgroundColor(board);
  const width = host.viewBox?.baseVal?.width || host.clientWidth || 0;
  const height = host.viewBox?.baseVal?.height || host.clientHeight || 0;

  if (width > 0 && height > 0) {
    clonedHost.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  if (!clonedHost.getAttribute('xmlns')) {
    clonedHost.setAttribute('xmlns', SVG_NS);
  }

  if (!clonedHost.getAttribute('xmlns:xlink')) {
    clonedHost.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }

  if (!isWhite(backgroundColor)) {
    const background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('x', '0');
    background.setAttribute('y', '0');
    background.setAttribute('width', `${width || '100%'}`);
    background.setAttribute('height', `${height || '100%'}`);
    background.setAttribute('fill', backgroundColor);
    clonedHost.insertBefore(background, clonedHost.firstChild);
  }

  return new XMLSerializer().serializeToString(clonedHost);
};

export const saveAsSvg = (board: PlaitBoard) => {
  getSelectedElements(board);
  const svgData = buildSvgMarkup(board);

  if (!svgData) {
    return Promise.resolve();
  }

  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const imageName = `drawnix-${new Date().getTime()}.svg`;
  download(blob, imageName);
  return Promise.resolve();
};

export const saveAsImage = (board: PlaitBoard, isTransparent: boolean) => {
  const selectedElements = getSelectedElements(board);
  const backgroundColor = getBackgroundColor(board) || 'white';
  boardToImage(board, {
    elements: selectedElements.length > 0 ? selectedElements : undefined,
    fillStyle: isTransparent ? 'transparent' : backgroundColor,
  }).then((image) => {
    if (image) {
      const ext = isTransparent ? 'png' : 'jpg';
      const pngImage = base64ToBlob(image);
      const imageName = `drawnix-${new Date().getTime()}.${ext}`;
      download(pngImage, imageName);
    }
  });
};

export const addImage = async (board: PlaitBoard) => {
  const imageFile = await fileOpen({
    description: 'Image',
    extensions: Object.keys(
      IMAGE_MIME_TYPES
    ) as (keyof typeof IMAGE_MIME_TYPES)[],
  });
  insertImage(board, imageFile);
};
