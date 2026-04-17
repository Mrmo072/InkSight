function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatTimestamp(timestamp) {
    if (!timestamp) {
        return 'Not saved yet';
    }

    try {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(new Date(timestamp));
    } catch {
        return new Date(timestamp).toLocaleString();
    }
}

export function buildProjectHomeModel(appContext = {}, projectStatus = {}) {
    const recentProjects = Array.isArray(projectStatus.recentProjects) ? projectStatus.recentProjects : [];
    const recentSnapshots = Array.isArray(projectStatus.snapshotHistory) ? projectStatus.snapshotHistory.slice(0, 4) : [];

    return {
        title: appContext.currentBook?.name || 'InkSight Workspace',
        canContinueWorkspace: recentSnapshots.length > 0 || Boolean(projectStatus.lastSavedAt),
        continueSummary: recentSnapshots.length
            ? `${recentSnapshots.length} recent workspace snapshot ${recentSnapshots.length === 1 ? 'entry' : 'entries'} ready`
            : 'Resume the last runtime workspace snapshot',
        recentProjects,
        recentSnapshots
    };
}

export function renderProjectHome(model = {}) {
    const recentProjects = Array.isArray(model.recentProjects) ? model.recentProjects : [];
    const recentSnapshots = Array.isArray(model.recentSnapshots) ? model.recentSnapshots : [];

    return `
        <section class="project-home" aria-label="Project home">
          <div class="project-home-hero">
            <span class="material-icons-round project-home-icon">auto_stories</span>
            <div class="project-home-copy">
              <h2>${escapeHtml(model.title || 'InkSight Workspace')}</h2>
              <p>Open a saved project, continue your latest workspace, or export your current notes for writing.</p>
            </div>
          </div>
          <div class="project-home-grid">
            <section class="project-home-card accent">
              <div class="project-home-card-copy">
                <strong>Continue Workspace</strong>
                <p>${escapeHtml(model.continueSummary || 'Resume the last runtime workspace snapshot')}</p>
              </div>
              <button type="button" class="project-home-btn primary" data-home-action="continue-workspace" ${model.canContinueWorkspace ? '' : 'disabled'}>
                Continue
              </button>
            </section>
            <section class="project-home-card">
              <div class="project-home-card-copy">
                <strong>Quick Actions</strong>
                <p>Import sources, open a project folder, save a project folder, or export notes.</p>
              </div>
              <div class="project-home-actions">
                <button type="button" class="project-home-btn" data-home-action="import">Import Documents</button>
                <button type="button" class="project-home-btn" data-home-action="open-project">Open Project Folder</button>
                <button type="button" class="project-home-btn" data-home-action="save-project">Save Project Folder</button>
                <button type="button" class="project-home-btn" data-home-action="export-notes">Export Notes Package</button>
              </div>
            </section>
            <section class="project-home-card">
              <div class="project-home-card-copy">
                <strong>Recent Projects</strong>
                <p>${recentProjects.length ? 'Pick up a saved project record. Project folders will ask for access again when needed.' : 'Saved project records will appear here after your first open or export.'}</p>
              </div>
              <div class="project-home-list">
                ${recentProjects.length ? recentProjects.map((project) => `
                  <button type="button" class="project-home-list-item" data-recent-project-id="${escapeHtml(project.projectId)}">
                    <span>${escapeHtml(project.projectName)}</span>
                    <span>${escapeHtml(project.directoryName || (project.source === 'project-folder' ? 'Project folder' : 'Server workspace'))} · ${formatTimestamp(project.lastOpenedAt)}</span>
                  </button>
                `).join('') : '<div class="project-home-list-empty">No recent projects yet.</div>'}
              </div>
            </section>
            <section class="project-home-card">
              <div class="project-home-card-copy">
                <strong>Recent Snapshots</strong>
                <p>Restore a recent runtime workspace snapshot without reopening every source manually.</p>
              </div>
              <div class="project-home-list">
                ${recentSnapshots.length ? recentSnapshots.map((snapshot) => `
                  <button type="button" class="project-home-list-item" data-home-snapshot-id="${escapeHtml(snapshot.snapshotId)}">
                    <span>${escapeHtml(snapshot.projectName || 'Workspace snapshot')}</span>
                    <span>${escapeHtml(snapshot.bookName || 'Workspace')} · ${formatTimestamp(Date.parse(snapshot.savedAt || 0))}</span>
                  </button>
                `).join('') : '<div class="project-home-list-empty">No snapshots saved yet.</div>'}
              </div>
            </section>
          </div>
        </section>
    `;
}
