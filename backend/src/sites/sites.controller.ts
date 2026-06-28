import { Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  type ChangeEvent,
  createSiteRequestSchema,
  type CreateSiteRequest,
  type Site,
  updateSiteRequestSchema,
  type UpdateSiteRequest,
} from '@magpie/shared';
import { z } from 'zod';

import { ZodBody } from '../common/zod-body.decorator.js';
import { type CrawlRunResult } from '../crawl/crawl.service.js';
import { SitesService } from './sites.service.js';

/**
 * Body schema for the enabled-toggle route. Local to the backend (not part of
 * the shared cross-package contract).
 */
const setEnabledRequestSchema = z.object({ enabled: z.boolean() });

@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  list(): Promise<Site[]> {
    return this.sites.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Site> {
    return this.sites.get(id);
  }

  @Post()
  create(@ZodBody(createSiteRequestSchema) dto: CreateSiteRequest): Promise<Site> {
    return this.sites.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @ZodBody(updateSiteRequestSchema) dto: UpdateSiteRequest,
  ): Promise<Site> {
    return this.sites.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.sites.remove(id);
  }

  @Patch(':id/enabled')
  setEnabled(
    @Param('id') id: string,
    @ZodBody(setEnabledRequestSchema) dto: z.infer<typeof setEnabledRequestSchema>,
  ): Promise<Site> {
    return this.sites.setEnabled(id, dto.enabled);
  }

  @Get(':id/events')
  events(@Param('id') id: string): Promise<ChangeEvent[]> {
    return this.sites.events(id);
  }

  @Post(':id/check-now')
  @HttpCode(200)
  checkNow(@Param('id') id: string): Promise<CrawlRunResult> {
    return this.sites.checkNow(id);
  }
}
