import type { CompareMode, CreateSiteRequest } from '@magpie/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { ApiError, api } from '../api/client.js';
import { useCreateSite } from '../api/queries.js';
import { PickerView } from '../components/PickerView.js';
import { ScheduleForm } from '../components/ScheduleForm.js';
import type { PickerSelection } from '../picker/picker.types.js';

const urlSchema = z.url();

type Rendered = { html: string; finalUrl: string; usedFlaresolverr: boolean };

type WizardStep = 'url' | 'pick' | 'schedule';

/**
 * Add-site wizard: URL → zone picker → schedule → create.
 *
 * Component tree:
 *   AddSiteFlow
 *     ├─ Step "url":      <UrlStep>            (z.url() validate → proxyRender)
 *     ├─ Step "pick":     <PickerView>         (sandboxed iframe + inspector)
 *     └─ Step "schedule": name + compareMode + <ScheduleForm> → useCreateSite
 */
export function AddSiteFlow() {
  const navigate = useNavigate();
  const createSite = useCreateSite();

  const [step, setStep] = useState<WizardStep>('url');
  const [url, setUrl] = useState('');
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [selection, setSelection] = useState<PickerSelection | null>(null);
  const [name, setName] = useState('');
  const [compareMode, setCompareMode] = useState<CompareMode>('innerHTML');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const effectiveUrl =
    rendered?.finalUrl && urlSchema.safeParse(rendered.finalUrl).success ? rendered.finalUrl : url;

  const handleRendered = (input: string, result: Rendered) => {
    setUrl(input);
    setRendered(result);
    setSelection(null);
    setStep('pick');
  };

  const handleSelect = (picked: PickerSelection) => {
    setSelection(picked);
    if (name.length === 0) {
      try {
        setName(new URL(effectiveUrl).hostname);
      } catch {
        /* leave empty */
      }
    }
    setStep('schedule');
  };

  const submit = (cron: string) => {
    if (!selection) return;
    setSubmitError(null);
    const payload: CreateSiteRequest = {
      name: name.trim(),
      url: effectiveUrl,
      selector: selection.selector,
      compareMode,
      cron,
      enabled: true,
      fingerprint: selection.fingerprint,
      ...(selection.xpath ? { selectorFallbackXPath: selection.xpath } : {}),
    };
    createSite.mutate(payload, {
      onSuccess: () => navigate('/'),
      onError: (err) =>
        setSubmitError(err instanceof Error ? err.message : 'Failed to create site'),
    });
  };

  return (
    <section className="page">
      <Link to="/" className="back-link">
        ← All sites
      </Link>
      <h1>Add a site</h1>

      <ol className="wizard-steps" aria-label="Steps">
        <li className={step === 'url' ? 'active' : 'done'}>1. URL</li>
        <li className={step === 'pick' ? 'active' : step === 'schedule' ? 'done' : ''}>
          2. Pick zone
        </li>
        <li className={step === 'schedule' ? 'active' : ''}>3. Schedule</li>
      </ol>

      {step === 'url' && <UrlStep initialUrl={url} onRendered={handleRendered} />}

      {step === 'pick' && rendered && (
        <div className="wizard-panel">
          <p className="muted">
            Rendered <code>{rendered.finalUrl}</code>
            {rendered.usedFlaresolverr && ' (via FlareSolverr)'}.
          </p>
          <PickerView html={rendered.html} onSelect={handleSelect} />
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setStep('url')}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 'schedule' && selection && (
        <div className="wizard-panel">
          <div className="selection-summary">
            <h3>Selected zone</h3>
            <dl>
              <dt>Selector</dt>
              <dd>
                <code>{selection.selector}</code>
              </dd>
              <dt>Fallback XPath</dt>
              <dd>
                <code>{selection.xpath}</code>
              </dd>
              <dt>Sample</dt>
              <dd className="muted">{selection.fingerprint.sample || '(empty)'}</dd>
            </dl>
            <button type="button" className="secondary" onClick={() => setStep('pick')}>
              Pick a different zone
            </button>
          </div>

          <div className="field">
            <label htmlFor="site-name">Name</label>
            <input
              id="site-name"
              type="text"
              value={name}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="compare-mode">Compare by</label>
            <select
              id="compare-mode"
              value={compareMode}
              onChange={(e) => setCompareMode(e.target.value as CompareMode)}
            >
              <option value="innerHTML">innerHTML (markup)</option>
              <option value="textContent">textContent (text only)</option>
            </select>
          </div>

          <ScheduleForm
            onSubmit={submit}
            submitLabel="Create site"
            busy={createSite.isPending}
            onCancel={() => setStep('pick')}
          />

          {name.trim().length === 0 && (
            <p role="alert" className="field-error">
              A name is required.
            </p>
          )}
          {submitError && (
            <p role="alert" className="field-error">
              {submitError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

type UrlStepProps = {
  initialUrl: string;
  onRendered: (url: string, result: Rendered) => void;
};

/** Step 1: validate the URL with z.url() and call the proxy-render backend. */
function UrlStep({ initialUrl, onRendered }: UrlStepProps) {
  const [value, setValue] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = urlSchema.safeParse(value.trim());
    if (!parsed.success) {
      setError('Enter a valid URL (including http:// or https://).');
      return;
    }
    setError(null);
    setLoading(true);
    api
      .proxyRender({ url: parsed.data })
      .then((result) => onRendered(parsed.data, result))
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setError(`Could not render page (${err.status}): ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to render the page.');
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <form className="wizard-panel url-step" onSubmit={handleSubmit} aria-label="Enter URL">
      <div className="field">
        <label htmlFor="site-url">Page URL</label>
        <input
          id="site-url"
          type="url"
          inputMode="url"
          placeholder="https://example.com/page"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={loading}
          aria-invalid={error ? true : false}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </div>
      <div className="form-actions">
        <button type="submit" disabled={loading || value.trim().length === 0}>
          {loading ? 'Rendering…' : 'Load page'}
        </button>
      </div>
    </form>
  );
}
