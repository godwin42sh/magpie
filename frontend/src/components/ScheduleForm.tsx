import { CRON_PRESETS, cronExpressionSchema } from '@magpie/shared';
import type { CronPresetKey } from '@magpie/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { describeCron } from '../lib/format.js';

/**
 * Form schema: a single `cron` field validated by the shared
 * `cronExpressionSchema` (so the frontend and backend agree on validity).
 */
const scheduleFormSchema = z.object({
  cron: cronExpressionSchema,
});
export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

/** Human labels for each preset key, in display order. */
const PRESET_LABELS: Record<CronPresetKey, string> = {
  'every-5-min': 'Every 5 min',
  'every-30-min': 'Every 30 min',
  'every-hour': 'Every hour',
  'every-6-hours': 'Every 6 hours',
  'every-day': 'Every day',
};

const PRESET_KEYS = Object.keys(CRON_PRESETS) as CronPresetKey[];

export type ScheduleFormProps = {
  /** Initial cron expression (defaults to the "every hour" preset). */
  defaultValue?: string;
  /** Called with a valid cron expression on submit. */
  onSubmit: (cron: string) => void;
  /** Optional cancel handler; when present a Cancel button is shown. */
  onCancel?: () => void;
  /** Label for the submit button. */
  submitLabel?: string;
  /** Disable the whole form (e.g. while a mutation is in flight). */
  busy?: boolean;
};

/**
 * Reusable cron scheduling form: free-text cron field, a preset <select>, and
 * preset quick-buttons. Shows a live human-readable description via cronstrue.
 * Used by both the add-site flow and the edit-site flow.
 */
export function ScheduleForm({
  defaultValue = CRON_PRESETS['every-hour'],
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  busy = false,
}: ScheduleFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    mode: 'onChange',
    defaultValues: { cron: defaultValue },
  });

  const currentCron = watch('cron');

  // Keep the form in sync if the parent changes the default (e.g. editing a
  // different site without remounting).
  useEffect(() => {
    setValue('cron', defaultValue, { shouldValidate: true });
  }, [defaultValue, setValue]);

  const applyPreset = (key: CronPresetKey) => {
    setValue('cron', CRON_PRESETS[key], { shouldValidate: true, shouldDirty: true });
  };

  const onSelectChange = (value: string) => {
    if (value === '') return;
    applyPreset(value as CronPresetKey);
  };

  const matchedPreset = PRESET_KEYS.find((key) => CRON_PRESETS[key] === currentCron) ?? '';

  return (
    <form
      className="schedule-form"
      onSubmit={handleSubmit((values) => onSubmit(values.cron))}
      aria-label="Schedule"
    >
      <div className="field">
        <label htmlFor="cron-input">Cron expression</label>
        <input
          id="cron-input"
          type="text"
          spellCheck={false}
          autoComplete="off"
          disabled={busy}
          aria-invalid={errors.cron ? true : false}
          {...register('cron')}
        />
        {errors.cron && (
          <p role="alert" className="field-error">
            {errors.cron.message}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="cron-preset-select">Preset</label>
        <select
          id="cron-preset-select"
          value={matchedPreset}
          disabled={busy}
          onChange={(e) => onSelectChange(e.target.value)}
        >
          <option value="">Custom…</option>
          {PRESET_KEYS.map((key) => (
            <option key={key} value={key}>
              {PRESET_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="preset-buttons" role="group" aria-label="Cron presets">
        {PRESET_KEYS.map((key) => (
          <button
            type="button"
            key={key}
            disabled={busy}
            className={matchedPreset === key ? 'preset-button active' : 'preset-button'}
            onClick={() => applyPreset(key)}
          >
            {PRESET_LABELS[key]}
          </button>
        ))}
      </div>

      <p className="cron-description" data-testid="cron-description">
        {describeCron(currentCron)}
      </p>

      <div className="form-actions">
        <button type="submit" disabled={busy || !isValid}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
