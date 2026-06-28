import type { SiteResponse } from '@magpie/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../test/utils.js';
import { SitesListPage } from './SitesListPage.js';

// Mock the API client so the hooks resolve against in-memory fakes.
vi.mock('../api/client.js', () => {
  return {
    ApiError: class ApiError extends Error {},
    api: {
      listSites: vi.fn(),
      setEnabled: vi.fn(),
      deleteSite: vi.fn(),
      checkNow: vi.fn(),
    },
  };
});

import { api } from '../api/client.js';

const mockApi = vi.mocked(api);

function makeSite(overrides: Partial<SiteResponse> = {}): SiteResponse {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Example',
    url: 'https://example.com',
    selector: '#main',
    compareMode: 'innerHTML',
    enabled: true,
    cron: '0 * * * *',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('SitesListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a row per site with name, url and human-readable cron', async () => {
    mockApi.listSites.mockResolvedValue([makeSite()]);
    renderWithProviders(<SitesListPage />);

    expect(await screen.findByText('Example')).toBeInTheDocument();
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    // cronstrue renders "0 * * * *" as an hourly phrase.
    expect(screen.getByText(/every hour/i)).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('toggles enabled via setEnabled with the inverted flag', async () => {
    const user = userEvent.setup();
    const site = makeSite({ enabled: true });
    mockApi.listSites.mockResolvedValue([site]);
    mockApi.setEnabled.mockResolvedValue({ ...site, enabled: false });

    renderWithProviders(<SitesListPage />);
    const row = await screen.findByTestId(`site-row-${site.id}`);

    await user.click(within(row).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(mockApi.setEnabled).toHaveBeenCalledWith(site.id, false));
  });

  it('deletes only after the confirm dialog is accepted', async () => {
    const user = userEvent.setup();
    const site = makeSite();
    mockApi.listSites.mockResolvedValue([site]);
    mockApi.deleteSite.mockResolvedValue(undefined);

    const confirmSpy = vi.spyOn(window, 'confirm');
    renderWithProviders(<SitesListPage />);
    const row = await screen.findByTestId(`site-row-${site.id}`);

    // First: user cancels — no delete.
    confirmSpy.mockReturnValueOnce(false);
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(mockApi.deleteSite).not.toHaveBeenCalled();

    // Second: user confirms — delete fires.
    confirmSpy.mockReturnValueOnce(true);
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mockApi.deleteSite).toHaveBeenCalledWith(site.id));
  });

  it('triggers an immediate check via checkNow', async () => {
    const user = userEvent.setup();
    const site = makeSite();
    mockApi.listSites.mockResolvedValue([site]);
    mockApi.checkNow.mockResolvedValue(undefined);

    renderWithProviders(<SitesListPage />);
    const row = await screen.findByTestId(`site-row-${site.id}`);

    await user.click(within(row).getByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(mockApi.checkNow).toHaveBeenCalledWith(site.id));
  });

  it('shows an empty state when there are no sites', async () => {
    mockApi.listSites.mockResolvedValue([]);
    renderWithProviders(<SitesListPage />);
    expect(await screen.findByText(/no sites configured yet/i)).toBeInTheDocument();
  });
});
