import type { SiteResponse } from '@magpie/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useCheckNow, useDeleteSite, useSites, useToggleEnabled } from '../api/queries.js';
import { EditSiteModal } from '../components/EditSiteModal.js';
import { describeCron, formatDateTime, formatRelative } from '../lib/format.js';

/**
 * Main page: a table of every configured site with inline actions.
 */
export function SitesListPage() {
  const sites = useSites();
  const toggleEnabled = useToggleEnabled();
  const deleteSite = useDeleteSite();
  const checkNow = useCheckNow();
  const [editing, setEditing] = useState<SiteResponse | null>(null);

  const onDelete = (site: SiteResponse) => {
    if (!window.confirm(`Delete “${site.name}”? This cannot be undone.`)) return;
    deleteSite.mutate(site.id);
  };

  return (
    <section className="page">
      <header className="page-header">
        <h1>Monitored sites</h1>
        {/* AddSiteFlow wizard (built by the next agent) lives at /sites/new. */}
        <Link className="button-link" to="/sites/new">
          + Add site
        </Link>
      </header>

      {sites.isLoading && <p>Loading sites…</p>}

      {sites.isError && (
        <p role="alert" className="field-error">
          Failed to load sites:{' '}
          {sites.error instanceof Error ? sites.error.message : 'unknown error'}
        </p>
      )}

      {sites.isSuccess && sites.data.length === 0 && (
        <div className="empty-state">
          <p>No sites configured yet.</p>
          <Link className="button-link" to="/sites/new">
            Add your first site
          </Link>
        </div>
      )}

      {sites.isSuccess && sites.data.length > 0 && (
        <div className="table-scroll">
          <table className="sites-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>URL</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Last changed</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.data.map((site) => (
                <tr key={site.id} data-testid={`site-row-${site.id}`}>
                  <td>
                    <Link to={`/sites/${site.id}`}>{site.name}</Link>
                  </td>
                  <td className="url-cell">
                    <a href={site.url} target="_blank" rel="noreferrer noopener">
                      {site.url}
                    </a>
                  </td>
                  <td title={site.cron}>{describeCron(site.cron)}</td>
                  <td>
                    <span className={site.enabled ? 'badge badge-on' : 'badge badge-off'}>
                      {site.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {site.lastError && (
                      <span className="badge badge-error" title={site.lastError}>
                        error
                      </span>
                    )}
                  </td>
                  <td title={formatDateTime(site.lastChangedAt)}>
                    {formatRelative(site.lastChangedAt)}
                  </td>
                  <td className="actions-col">
                    <Link className="action" to={`/sites/${site.id}`}>
                      View
                    </Link>
                    <button type="button" className="action" onClick={() => setEditing(site)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="action"
                      disabled={toggleEnabled.isPending}
                      onClick={() => toggleEnabled.mutate({ id: site.id, enabled: !site.enabled })}
                    >
                      {site.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      className="action"
                      disabled={checkNow.isPending}
                      onClick={() => checkNow.mutate(site.id)}
                    >
                      Check now
                    </button>
                    <button
                      type="button"
                      className="action danger"
                      disabled={deleteSite.isPending}
                      onClick={() => onDelete(site)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <EditSiteModal site={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
