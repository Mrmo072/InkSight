const path = require('path');

const isOutsideRoot = (relativePath) => {
    return relativePath === '..'
        || relativePath.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativePath);
};

const resolvePathWithin = (rootDir, candidatePath, label = 'Path') => {
    if (typeof candidatePath !== 'string' || !candidatePath.trim()) {
        throw new Error(`${label} must be a non-empty string`);
    }

    const resolvedRoot = path.resolve(rootDir);
    const resolvedPath = path.resolve(resolvedRoot, candidatePath);
    const relativePath = path.relative(resolvedRoot, resolvedPath);
    if (isOutsideRoot(relativePath)) {
        throw new Error(`${label} escapes the allowed directory`);
    }
    return resolvedPath;
};

const assertSafePathSegment = (value, label = 'Path segment') => {
    if (typeof value !== 'string'
        || !value.trim()
        || value === '.'
        || value === '..'
        || value.includes('/')
        || value.includes('\\')
        || value.includes('\0')) {
        throw new Error(`${label} is invalid`);
    }
    return value;
};

module.exports = {
    assertSafePathSegment,
    resolvePathWithin
};
