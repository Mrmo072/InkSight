import { describe, expect, it } from 'vitest';
import { buildDirectoryPickerId } from './inksight-project-directory-io.js';

describe('buildDirectoryPickerId', () => {
    it('keeps Chromium directory picker ids within 32 characters', () => {
        const pickerId = buildDirectoryPickerId('graph-interaction-fixture-with-a-very-long-name');

        expect(pickerId).toHaveLength(32);
        expect(pickerId).toMatch(/^inksight-project-[a-z0-9-]+$/);
    });
});
