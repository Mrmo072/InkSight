export const INKSIGHT_FILE_EXTENSION = 'inksight';
export const INKSIGHT_FILE_DESCRIPTION = 'InkSight file';
export const INKSIGHT_FILE_OPEN_EXTENSIONS = ['inksight', 'drawnix', 'json'];

export function isInksightPayload(data) {
    return Boolean(
        data &&
        data.type === 'drawnix' &&
        Array.isArray(data.elements) &&
        typeof data.viewport === 'object'
    );
}
