import type { CreateSiteRequest, UpdateSiteRequest } from '@magpie/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client.js';

/**
 * Centralized query keys so invalidation stays consistent across hooks.
 */
export const queryKeys = {
  sites: ['sites'] as const,
  site: (id: string) => ['sites', id] as const,
  events: (id: string) => ['sites', id, 'events'] as const,
};

/** List all configured sites. */
export function useSites() {
  return useQuery({
    queryKey: queryKeys.sites,
    queryFn: ({ signal }) => api.listSites(signal),
  });
}

/** Fetch a single site by id. */
export function useSite(id: string) {
  return useQuery({
    queryKey: queryKeys.site(id),
    queryFn: ({ signal }) => api.getSite(id, signal),
    enabled: id.length > 0,
  });
}

/** Fetch a site's change-event history. */
export function useSiteEvents(id: string) {
  return useQuery({
    queryKey: queryKeys.events(id),
    queryFn: ({ signal }) => api.listEvents(id, signal),
    enabled: id.length > 0,
  });
}

/** Create a new site. */
export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSiteRequest) => api.createSite(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.sites });
    },
  });
}

/** Update an existing site. */
export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSiteRequest }) =>
      api.updateSite(id, input),
    onSuccess: (site) => {
      void qc.invalidateQueries({ queryKey: queryKeys.sites });
      void qc.invalidateQueries({ queryKey: queryKeys.site(site.id) });
    },
  });
}

/** Delete a site. */
export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSite(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.sites });
    },
  });
}

/** Toggle a site's enabled flag. */
export function useToggleEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.setEnabled(id, enabled),
    onSuccess: (site) => {
      void qc.invalidateQueries({ queryKey: queryKeys.sites });
      void qc.invalidateQueries({ queryKey: queryKeys.site(site.id) });
    },
  });
}

/** Trigger an immediate check for a site. */
export function useCheckNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.checkNow(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.site(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.events(id) });
    },
  });
}
