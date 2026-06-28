import { Global, Module } from '@nestjs/common';

import { CamoufoxService } from './camoufox.service.js';
import { FetchService } from './fetch.service.js';
import { FlareSolverrService } from './flaresolverr.service.js';
import { PlaywrightService } from './playwright.service.js';

/**
 * Global module exposing the rendering/fetching stack:
 *  - PlaywrightService  — shared headless Chromium renderer
 *  - FlareSolverrService — Cloudflare-challenge solver
 *  - CamoufoxService    — anti-detect Firefox (Akamai/DataDome/Cloudflare)
 *  - FetchService       — the escalation pipeline used by crawl + proxy
 *
 * Global so the crawl and proxy feature modules can inject these without
 * re-importing.
 */
@Global()
@Module({
  providers: [PlaywrightService, FlareSolverrService, CamoufoxService, FetchService],
  exports: [PlaywrightService, FlareSolverrService, CamoufoxService, FetchService],
})
export class RenderingModule {}
