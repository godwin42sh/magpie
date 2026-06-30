"""Camoufox fetch sidecar.

A tiny HTTP service that fetches a URL through Camoufox — an anti-detect Firefox
build that spoofs its fingerprint natively and runs real browser JS, so it gets
past bot-protection (Akamai, DataDome, Cloudflare, …) that rejects plain
headless Chromium and that FlareSolverr (Cloudflare-only) cannot solve.

It mirrors the FlareSolverr contract the backend already speaks:

    POST /fetch  { "url": "https://…", "timeoutMs"?: 90000 }
      -> 200 { "status": 200, "html": "<!doctype html>…", "finalUrl": "https://…" }
      -> 502 { "error": "…" }            (fetch failed)

    GET  /healthz -> { "status": "ok" }

A single Camoufox browser is launched once and reused; requests are serialized
with a lock (Playwright's per-browser session is not concurrency-safe, and for a
personal monitoring workload sequential fetches are plenty).
"""

from __future__ import annotations

import asyncio
import contextlib
import os
from typing import Optional

from camoufox.async_api import AsyncCamoufox
from fastapi import FastAPI
from pydantic import BaseModel
from starlette.responses import JSONResponse

DEFAULT_TIMEOUT_MS = int(os.environ.get("CAMOUFOX_TIMEOUT_MS", "90000"))
# Camoufox launch knobs (env-overridable). geoip aligns locale/timezone to the
# egress IP, which matters for region-locked anti-bot checks.
GEOIP = os.environ.get("CAMOUFOX_GEOIP", "true").lower() != "false"


def _resolve_headless() -> object:
    # Per the Camoufox docs, on a headless Linux server "virtual" runs a real
    # (headed) Firefox inside Xvfb — stealthier than true headless and the
    # recommended mode for Docker. Accept: virtual (default) | true | false.
    mode = os.environ.get("CAMOUFOX_HEADLESS", "virtual").lower()
    if mode == "virtual":
        return "virtual"
    return mode != "false"


HEADLESS = _resolve_headless()

app = FastAPI(title="camoufox-fetch")

_browser = None  # the running Camoufox browser (Playwright Browser)
_camoufox_cm = None  # the AsyncCamoufox context manager keeping it alive
_lock = asyncio.Lock()


class FetchRequest(BaseModel):
    url: str
    timeoutMs: Optional[int] = None


@app.on_event("startup")
async def _startup() -> None:
    global _browser, _camoufox_cm
    _camoufox_cm = AsyncCamoufox(headless=HEADLESS, geoip=GEOIP)
    _browser = await _camoufox_cm.__aenter__()


@app.on_event("shutdown")
async def _shutdown() -> None:
    global _browser, _camoufox_cm
    if _camoufox_cm is not None:
        with contextlib.suppress(Exception):
            await _camoufox_cm.__aexit__(None, None, None)
        _camoufox_cm = None
        _browser = None


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok" if _browser is not None else "starting"}


@app.post("/fetch")
async def fetch(req: FetchRequest):
    if _browser is None:
        return JSONResponse(status_code=503, content={"error": "browser not ready"})

    timeout = req.timeoutMs or DEFAULT_TIMEOUT_MS
    async with _lock:
        page = await _browser.new_page()
        try:
            # wait_until="commit" returns as soon as the response is committed,
            # then we read the SERVED body. This deliberately avoids waiting on
            # page JS (which can trigger a Firefox/Playwright driver crash) while
            # still yielding the full server-rendered HTML — enough for both
            # zone-picking and change detection.
            resp = await page.goto(req.url, wait_until="commit", timeout=timeout)
            if resp is None:
                return JSONResponse(status_code=502, content={"error": "no response"})
            html = await resp.text()
            return {"status": resp.status, "html": html, "finalUrl": page.url}
        except Exception as exc:  # noqa: BLE001 - report any fetch failure to caller
            return JSONResponse(status_code=502, content={"error": str(exc)[:500]})
        finally:
            with contextlib.suppress(Exception):
                await page.close()
