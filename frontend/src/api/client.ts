import {
  changeEventSchema,
  createSiteRequestSchema,
  proxyRenderRequestSchema,
  proxyRenderResponseSchema,
  siteResponseSchema,
  updateSiteRequestSchema,
} from '@magpie/shared';
import type {
  ChangeEvent,
  CreateSiteRequest,
  ProxyRenderRequest,
  ProxyRenderResponse,
  SiteResponse,
  UpdateSiteRequest,
} from '@magpie/shared';
import { z } from 'zod';

/**
 * All backend routes live under `/api` (proxied to NestJS on :3000 in dev).
 */
const API_BASE = '/api';

/**
 * Error thrown when the backend responds with a non-2xx status.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const { method = 'GET', body, signal } = options;

  const init: RequestInit = { method };
  if (signal) init.signal = signal;
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, init);

  if (res.status === 204) return undefined;

  const text = await res.text();
  const parsed: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, parsed);
  }

  return parsed;
}

const sitesArraySchema = z.array(siteResponseSchema);
const eventsArraySchema = z.array(changeEventSchema);

/**
 * Typed wrappers around every backend route. Each response is validated with
 * the matching `@magpie/shared` schema so the frontend never trusts unchecked
 * shapes.
 */
export const api = {
  /** GET /api/sites */
  async listSites(signal?: AbortSignal): Promise<SiteResponse[]> {
    const data = await request('/sites', signal ? { signal } : {});
    return sitesArraySchema.parse(data);
  },

  /** GET /api/sites/:id */
  async getSite(id: string, signal?: AbortSignal): Promise<SiteResponse> {
    const data = await request(`/sites/${id}`, signal ? { signal } : {});
    return siteResponseSchema.parse(data);
  },

  /** POST /api/sites */
  async createSite(input: CreateSiteRequest): Promise<SiteResponse> {
    const body = createSiteRequestSchema.parse(input);
    const data = await request('/sites', { method: 'POST', body });
    return siteResponseSchema.parse(data);
  },

  /** PATCH /api/sites/:id */
  async updateSite(id: string, input: UpdateSiteRequest): Promise<SiteResponse> {
    const body = updateSiteRequestSchema.parse(input);
    const data = await request(`/sites/${id}`, { method: 'PATCH', body });
    return siteResponseSchema.parse(data);
  },

  /** DELETE /api/sites/:id */
  async deleteSite(id: string): Promise<void> {
    await request(`/sites/${id}`, { method: 'DELETE' });
  },

  /** PATCH /api/sites/:id/enabled */
  async setEnabled(id: string, enabled: boolean): Promise<SiteResponse> {
    const data = await request(`/sites/${id}/enabled`, {
      method: 'PATCH',
      body: { enabled },
    });
    return siteResponseSchema.parse(data);
  },

  /** GET /api/sites/:id/events */
  async listEvents(id: string, signal?: AbortSignal): Promise<ChangeEvent[]> {
    const data = await request(`/sites/${id}/events`, signal ? { signal } : {});
    return eventsArraySchema.parse(data);
  },

  /** POST /api/sites/:id/check-now */
  async checkNow(id: string): Promise<void> {
    await request(`/sites/${id}/check-now`, { method: 'POST' });
  },

  /** POST /api/proxy/render */
  async proxyRender(input: ProxyRenderRequest): Promise<ProxyRenderResponse> {
    const body = proxyRenderRequestSchema.parse(input);
    const data = await request('/proxy/render', { method: 'POST', body });
    return proxyRenderResponseSchema.parse(data);
  },
};
