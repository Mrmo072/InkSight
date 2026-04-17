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
              <p class="text-two-line">Resume, open, or capture.</p>
            </div>
          </div>
          <div class="project-home-grid">
            <section class="project-home-card accent">
              <div class="project-home-card-copy">
                <span class="material-icons-round project-home-card-icon">play_circle</span>
                <strong>Continue</strong>
                <p class="text-two-line">${escapeHtml(model.continueSummary || 'Resume latest workspace')}</p>
              </div>
              <button type="button" class="project-home-btn primary" data-home-action="continue-workspace" ${model.canContinueWorkspace ? '' : 'disabled'}>
                <span class="material-icons-round">play_arrow</span>
              </button>
            </section>
            <section class="project-home-card">
              <div class="project-home-card-copy">
                <span class="material-icons-round project-home-card-icon">bolt</span>
                <strong>Quick</strong>
                <p class="text-two-line">Core workspace actions.</p>
              </div>
              <div class="project-home-actions">
                <button type="button" class="project-home-btn icon-tile" data-home-action="import" title="Import Documents" aria-label="Import Documents"><span class="material-icons-round">library_add</span></button>
                <button type="button" class="project-home-btn icon-tile" data-home-action="open-project" title="Open Project Folder" aria-label="Open Project Folder"><span class="material-icons-round">folder_open</span></button>
                <button type="button" class="project-home-btn icon-tile" data-home-action="save-project" title="Save Project Folder" aria-label="Save Project Folder"><span class="material-icons-round">save</span></button>
                <button type="button" class="project-home-btn icon-tile" data-home-action="export-notes" title="Export Notes Package" aria-label="Export Notes Package"><span class="material-icons-round">note_add</span></button>
              </div>
            </section>
            <section class="project-home-card">
              <div class="project-home-card-copy">
                <span class="material-icons-round project-home-card-icon">folder_copy</span>
                <strong>Recent</strong>
                <p class="text-two-line">${recentProjects.length ? 'Saved project records.' : 'No recent projects.'}</p>
              </div>
              <div class="project-home-list">
                ${recentProjects.length ? recentProjects.map((project) => `
                  <button type="button" class="project-home-list-item" data-recent-project-id="${escapeHtml(project.projectId)}">
                    <span class="material-icons-round project-home-list-icon">${project.source === 'project-folder' ? 'folder' : 'history'}</span>
                    <span class="project-home-list-copy">
                      <span class="text-two-line">${escapeHtml(project.projectName)}</span>
                      <span class="text-two-line">${escapeHtml(project.directoryName || (project.source === 'project-folder' ? 'Project folder' : 'Server workspace'))} · ${formatTimestamp(project.lastOpenedAt)}</span>
                    </span>
                    <span class="material-icons-round project-home-list-arrow">arrow_forward</span>
                  </button>
                `).join('') : '<div class="project-home-list-empty">No recent projects yet.</div>'}
              </div>
            </section>
            <section class="project-home-card">
              <div class="project-home-card-copy">
                <span class="material-icons-round project-home-card-icon">history</span>
                <strong>Snapshots</strong>
                <p class="text-two-line">Recent recover points.</p>
              </div>
              <div class="project-home-list">
                ${recentSnapshots.length ? recentSnapshots.map((snapshot) => `
                  <button type="button" class="project-home-list-item" data-home-snapshot-id="${escapeHtml(snapshot.snapshotId)}">
                    <span class="material-icons-round project-home-list-icon">restore</span>
                    <span class="project-home-list-copy">
                      <span class="text-two-line">${escapeHtml(snapshot.projectName || 'Workspace snapshot')}</span>
                      <span class="text-two-line">${escapeHtml(snapshot.bookName || 'Workspace')} · ${formatTimestamp(Date.parse(snapshot.savedAt || 0))}</span>
                    </span>
                    <span class="material-icons-round project-home-list-arrow">arrow_forward</span>
                  </button>
                `).join('') : '<div class="project-home-list-empty">No snapshots saved yet.</div>'}
              </div>
            </section>
          </div>
        </section>
    `;
}
