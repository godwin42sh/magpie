import { CRON_PRESETS } from '@magpie/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ScheduleForm } from './ScheduleForm.js';

describe('ScheduleForm', () => {
  it('maps each preset button to its CRON_PRESETS value and submits it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ScheduleForm onSubmit={onSubmit} submitLabel="Save" />);

    // Click the "Every 5 min" preset button.
    await user.click(screen.getByRole('button', { name: 'Every 5 min' }));

    const input = screen.getByLabelText('Cron expression') as HTMLInputElement;
    expect(input.value).toBe(CRON_PRESETS['every-5-min']);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(CRON_PRESETS['every-5-min']);
  });

  it('updates the cron field from the preset select', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ScheduleForm onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Preset'), 'every-day');
    const input = screen.getByLabelText('Cron expression') as HTMLInputElement;
    expect(input.value).toBe(CRON_PRESETS['every-day']);
  });

  it('shows a human-readable description that changes with the cron value', async () => {
    const user = userEvent.setup();
    render(<ScheduleForm onSubmit={vi.fn()} defaultValue={CRON_PRESETS['every-hour']} />);

    const desc = screen.getByTestId('cron-description');
    const initial = desc.textContent ?? '';
    expect(initial.length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Every day' }));
    expect(desc.textContent).not.toBe(initial);
  });

  it('blocks submission and shows an error for an invalid cron expression', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ScheduleForm onSubmit={onSubmit} />);

    const input = screen.getByLabelText('Cron expression');
    await user.clear(input);
    await user.type(input, 'not a cron');

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid cron/i);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
