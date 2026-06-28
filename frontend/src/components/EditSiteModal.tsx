import { compareModeSchema } from '@magpie/shared';
import type { CompareMode, SiteResponse, UpdateSiteRequest } from '@magpie/shared';
import { useState } from 'react';

import { useUpdateSite } from '../api/queries.js';
import { ScheduleForm } from './ScheduleForm.js';
import { Modal } from './Modal.js';

export type EditSiteModalProps = {
  site: SiteResponse;
  onClose: () => void;
};

const COMPARE_MODES = compareModeSchema.options;

/**
 * Edit an existing site's metadata + schedule. Reuses ScheduleForm for the
 * cron portion. The selector/zone itself is (re)picked through the Add flow's
 * picker, so it is shown read-only here.
 */
export function EditSiteModal({ site, onClose }: EditSiteModalProps) {
  const updateSite = useUpdateSite();
  const [name, setName] = useState(site.name);
  const [url, setUrl] = useState(site.url);
  const [compareMode, setCompareMode] = useState<CompareMode>(site.compareMode);
  const [error, setError] = useState<string | null>(null);

  const submit = (cron: string) => {
    setError(null);
    const input: UpdateSiteRequest = { name, url, compareMode, cron };
    updateSite.mutate(
      { id: site.id, input },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : 'Update failed'),
      },
    );
  };

  return (
    <Modal title={`Edit “${site.name}”`} onClose={onClose}>
      <div className="field">
        <label htmlFor="edit-name">Name</label>
        <input
          id="edit-name"
          type="text"
          value={name}
          disabled={updateSite.isPending}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="edit-url">URL</label>
        <input
          id="edit-url"
          type="url"
          value={url}
          disabled={updateSite.isPending}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="edit-compare">Compare mode</label>
        <select
          id="edit-compare"
          value={compareMode}
          disabled={updateSite.isPending}
          onChange={(e) => setCompareMode(e.target.value as CompareMode)}
        >
          {COMPARE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Selector (re-pick via the Add flow to change)</label>
        <code className="selector-readonly">{site.selector}</code>
      </div>

      <ScheduleForm
        defaultValue={site.cron}
        submitLabel="Save changes"
        busy={updateSite.isPending}
        onSubmit={submit}
        onCancel={onClose}
      />

      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
