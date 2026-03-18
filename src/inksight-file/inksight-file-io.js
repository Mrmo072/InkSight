import { loadFromBlob, normalizeFile, parseFileContents } from '../drawnix/drawnix/src/data/blob.ts';
import { fileOpen, fileSave } from '../drawnix/drawnix/src/data/filesystem.ts';
import { MIME_TYPES } from '../drawnix/drawnix/src/constants.ts';
import {
    INKSIGHT_FILE_DESCRIPTION,
    INKSIGHT_FILE_EXTENSION,
    INKSIGHT_FILE_OPEN_EXTENSIONS,
    isInksightPayload
} from './inksight-file-types.js';
import { buildInksightFilePayload } from './inksight-file-snapshot.js';

function getDefaultFileName() {
    return `${Date.now()}`;
}

export function serializeInksightFilePayload(payload) {
    if (!isInksightPayload(payload)) {
        throw new Error('Error: invalid file');
    }

    return JSON.stringify(payload, null, 2);
}

export async function saveInksightFile({ board, appContext = {}, name, lastPage } = {}) {
    const payload = buildInksightFilePayload({ appContext, board, lastPage });
    const serialized = serializeInksightFilePayload(payload);
    const blob = new Blob([serialized], {
        type: MIME_TYPES.inksight
    });

    const fileHandle = await fileSave(blob, {
        name: name || getDefaultFileName(),
        extension: INKSIGHT_FILE_EXTENSION,
        description: INKSIGHT_FILE_DESCRIPTION
    });

    return { fileHandle, payload };
}

export async function loadInksightFile(board) {
    const file = await fileOpen({
        description: 'InkSight files',
        extensions: INKSIGHT_FILE_OPEN_EXTENSIONS
    });
    const normalizedFile = await normalizeFile(file);
    await loadFromBlob(board, normalizedFile);
    const raw = JSON.parse(await parseFileContents(normalizedFile));

    if (!isInksightPayload(raw)) {
        throw new Error('Error: invalid file');
    }

    return raw;
}
