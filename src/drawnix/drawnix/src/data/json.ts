import { PlaitBoard, PlaitElement } from '@plait/core';
import { MIME_TYPES, VERSIONS } from '../constants';
import { fileOpen, fileSave } from './filesystem';
import { DrawnixExportedData, DrawnixExportedType } from './types';
import { loadFromBlob, normalizeFile, parseFileContents } from './blob';

export const getDefaultName = () => {
  const time = new Date().getTime();
  return time.toString();
};

export const saveAsJSON = async (
  board: PlaitBoard,
  name: string = getDefaultName()
) => {
  const serialized = serializeAsJSON(board);
  const blob = new Blob([serialized], {
    type: MIME_TYPES.drawnix,
  });

  const fileHandle = await fileSave(blob, {
    name,
    extension: 'drawnix',
    description: 'Drawnix file',
  });
  return { fileHandle };
};

export const loadFromJSON = async (board: PlaitBoard) => {
  const file = await fileOpen({
    description: 'Drawnix files',
    extensions: ['drawnix', 'json'],
  });
  const normalizedFile = await normalizeFile(file);
  await loadFromBlob(board, normalizedFile);
  return JSON.parse(await parseFileContents(normalizedFile));
};

export const isValidDrawnixData = (data?: any): data is DrawnixExportedData => {
  return (
    data &&
    data.type === DrawnixExportedType.drawnix &&
    Array.isArray(data.elements) &&
    typeof data.viewport === 'object'
  );
};

export const serializeAsJSON = (board: PlaitBoard): string => {
  const data = {
    type: DrawnixExportedType.drawnix,
    version: VERSIONS.drawnix,
    source: 'web',
    elements: board.children,
    viewport: board.viewport,
    theme: board.theme,
  };

  return JSON.stringify(data, null, 2);
};
