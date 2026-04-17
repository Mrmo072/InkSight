import { describe, expect, it, vi } from 'vitest';

vi.mock('../../inksight-file/inksight-runtime-project-io.js', () => ({
    listRuntimeProjectSnapshots: vi.fn(),
    loadRuntimeProjectSnapshot: vi.fn()
}));

describe('project-history', () => {
    it('normalizes snapshots newest first and limits to ten', async () => {
        const { normalizeProjectSnapshots, PROJECT_HISTORY_LIMIT } = await import('../project-history.js');

        const snapshots = Array.from({ length: 12 }, (_, index) => ({
            snapshotId: `snapshot-${index}`,
            savedAt: `2026-04-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`
        }));

        const normalized = normalizeProjectSnapshots(snapshots);

        expect(normalized).toHaveLength(PROJECT_HISTORY_LIMIT);
        expect(normalized[0].snapshotId).toBe('snapshot-11');
    });
});
