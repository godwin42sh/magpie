import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useCheckNow, useSite, useSiteEvents } from '../api/queries.js';
import { EditSiteModal } from '../components/EditSiteModal.js';
import { describeCron, formatDateTime, formatRelative } from '../lib/format.js';

/**
 * View action: full configuration for one site plus its change-event history
 * (with diffs) fetched from GET /api/sites/:id/events.
 */
export function SiteDetailView() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const site = useSite(id);
  const events = useSiteEvents(id);
  const checkNow = useCheckNow();
  const [editing, setEditing] = useState(false);

  if (site.isLoading) return <p className="page">Loading site…</p>;

  if (site.isError || !site.data) {
    return (
      <section className="page">
        <p role="alert" className="field-error">
          Site not found
          {site.error instanceof Error ? `: ${site.error.message}` : ''}.
        </p>
        <Link to="/">← Back to sites</Link>
      </section>
    );
  }

  const s = site.data;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <Link to="/" className="back-link">
            ← All sites
          </Link>
          <h1>{s.name}</h1>
        </div>
        <div className="header-actions">
          <button type="button" disabled={checkNow.isPending} onClick={() => checkNow.mutate(s.id)}>
            Check now
          </button>
          <button type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </header>

      <dl className="detail-grid">
        <dt>URL</dt>
        <dd>
          <a href={s.url} target="_blank" rel="noreferrer noopener">
            {s.url}
          </a>
        </dd>

        <dt>Selector</dt>
        <dd>
          <code>{s.selector}</code>
          {s.selectorFallbackXPath && (
            <div className="muted">
              fallback XPath: <code>{s.selectorFallbackXPath}</code>
            </div>
          )}
        </dd>

        <dt>Compare mode</dt>
        <dd>{s.compareMode}</dd>

        <dt>Schedule</dt>
        <dd title={s.cron}>
          {describeCron(s.cron)} <span className="muted">({s.cron})</span>
        </dd>

        <dt>Status</dt>
        <dd>
          <span className={s.enabled ? 'badge badge-on' : 'badge badge-off'}>
            {s.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </dd>

        <dt>Created</dt>
        <dd>{formatDateTime(s.createdAt)}</dd>

        <dt>Last checked</dt>
        <dd title={formatDateTime(s.lastCheckedAt)}>{formatRelative(s.lastCheckedAt)}</dd>

        <dt>Last changed</dt>
        <dd title={formatDateTime(s.lastChangedAt)}>{formatRelative(s.lastChangedAt)}</dd>

        {s.lastError && (
          <>
            <dt>Last error</dt>
            <dd className="field-error">{s.lastError}</dd>
          </>
        )}

        {s.fingerprint && (
          <>
            <dt>Fingerprint</dt>
            <dd>
              <code>
                &lt;{s.fingerprint.tag}&gt; · {s.fingerprint.textLen} chars
              </code>
              <div className="muted">{s.fingerprint.sample}</div>
            </dd>
          </>
        )}
      </dl>

      <h2>Change history</h2>

      {events.isLoading && <p>Loading history…</p>}
      {events.isError && (
        <p role="alert" className="field-error">
          Failed to load events:{' '}
          {events.error instanceof Error ? events.error.message : 'unknown error'}
        </p>
      )}
      {events.isSuccess && events.data.length === 0 && (
        <p className="muted">No changes recorded yet.</p>
      )}

      {events.isSuccess && events.data.length > 0 && (
        <ul className="event-list">
          {events.data.map((event) => (
            <li key={event.id} className="event-item">
              <div className="event-head">
                <strong>{formatDateTime(event.at)}</strong>
              </div>
              {event.preview ? (
                <p className="event-preview">{event.preview}</p>
              ) : (
                <p className="muted">No preview captured.</p>
              )}
              {event.diff && <pre className="diff">{event.diff}</pre>}
            </li>
          ))}
        </ul>
      )}

      {editing && <EditSiteModal site={s} onClose={() => setEditing(false)} />}
    </section>
  );
}
