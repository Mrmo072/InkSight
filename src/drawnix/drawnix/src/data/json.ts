import { PlaitBoard, PlaitElement } from '@plait/core';
import { MIME_TYPES, VERSIONS } from '../constants';
import { fileOpen, fileSave } from './filesystem';
import { DrawnixExportedData, DrawnixExportedType } from './types';
import { loadFromBlob, normalizeFile } from './blob';

export const getDefaultName = () => {
  const time = new Date().getTime();
  return time.toString();
};

export const saveAsJSON = async (
  board: PlaitBoard,
  name: string = getDefaultName(),
  extraData: Record<string, any> = {}
) => {
  const serialized = serializeAsJSON(board, extraData);
  const blob = new Blob([serialized], {
    type: MIME_TYPES.drawnix,
  });

  const fileHandle = await fileSave(blob, {
    name,
    extension: 'inksight',
    description: 'InkSight file',
  });
  return { fileHandle };
};

export const loadFromJSON = async (board: PlaitBoard) => {
  const file = await fileOpen({
    description: 'InkSight files',
    extensions: ['inksight', 'drawnix', 'json'],
  });
  const data = await normalizeFile(file);
  const loadedData = await loadFromBlob(board, data);
  // Return full data including extra fields
  return {
    ...loadedData,
    // We need to parse the JSON again to get extra fields if loadFromBlob doesn't return them
    // loadFromBlob returns { elements, viewport } usually.
    // Let's check loadFromBlob implementation if possible, but assuming it returns partial.
    // Actually, we can just parse the text content of the file.
    // But normalizeFile returns a Blob/File.
    // Let's read the text content here to be sure.
    raw: JSON.parse(await file.text())
  };
};

export const isValidDrawnixData = (data?: any): data is DrawnixExportedData => {
  return (
    data &&
    data.type === DrawnixExportedType.drawnix &&
    Array.isArray(data.elements) &&
    typeof data.viewport === 'object'
  );
};

export const serializeAsJSON = (board: PlaitBoard, extraData: Record<string, any> = {}): string => {
  const data = {
    type: DrawnixExportedType.drawnix,
    version: VERSIONS.drawnix,
    source: 'web',
    elements: board.children,
    viewport: board.viewport,
    ...extraData
  };

  return JSON.stringify(data, null, 2);
};
