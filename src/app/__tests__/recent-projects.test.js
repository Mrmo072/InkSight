import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listRecentProjects, recordRecentProject } from '../recent-projects.js';

describe('recent-projects', () => {
    let storage;

    beforeEach(() => {
        storage = {
            value: null,
            getItem: vi.fn(() => storage.value),
            setItem: vi.fn((key, value) => {
                storage.value = value;
            })
        };
    });

    it('records recent projects in last-opened order', () => {
        recordRecentProject({
            projectId: 'project-1',
            projectName: 'Alpha',
            lastOpenedAt: 10
        }, storage);
        recordRecentProject({
            projectId: 'project-2',
            projectName: 'Beta',
            lastOpenedAt: 20
        }, storage);

        expect(listRecentProjects(storage).map((entry) => entry.projectId)).toEqual(['project-2', 'project-1']);
    });

    it('replaces an existing recent project entry', () => {
        recordRecentProject({
            projectId: 'project-1',
            projectName: 'Alpha',
            lastOpenedAt: 10
        }, storage);
        recordRecentProject({
            projectId: 'project-1',
            projectName: 'Alpha Updated',
            lastOpenedAt: 30
        }, storage);

        expect(listRecentProjects(storage)).toEqual([
            expect.objectContaining({
                projectId: 'project-1',
                projectName: 'Alpha Updated',
                lastOpenedAt: 30
            })
        ]);
    });
});
