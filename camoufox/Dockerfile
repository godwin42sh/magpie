# Camoufox fetch sidecar — anti-detect Firefox behind a tiny HTTP API.
#
# Follows the official Camoufox install/runtime docs (camoufox.com):
#   - clean Python base; `pip install camoufox[geoip]`; `camoufox fetch`
#   - run on a headless Linux server via headless="virtual" (Xvfb), which the
#     docs recommend for Docker — a real (headed) Firefox in a virtual display,
#     stealthier than true headless.
#
# IMPORTANT: Camoufox declares `playwright` with NO version bound, so a plain
# install pulls the latest (1.61), whose Firefox setDefaultViewport sends an
# `isMobile` field that Camoufox 0.4.11's Firefox rejects (Browser.new_page
# protocol error). We pin the matched pair camoufox 0.4.11 + playwright 1.55.0.
FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Camoufox + its matched Playwright, plus the tiny HTTP API.
RUN pip install \
    "camoufox[geoip]==0.4.11" \
    "playwright==1.55.0" \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.30"

# Xvfb (for headless="virtual") + fonts, then the OS libraries the Firefox-based
# Camoufox browser needs (via Playwright's installer, which covers the full set),
# then download the patched Firefox + GeoIP database at build time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends xvfb fonts-liberation fonts-unifont \
 && python -m playwright install-deps firefox \
 && rm -rf /var/lib/apt/lists/* \
 && python -m camoufox fetch

COPY server.py ./

ENV CAMOUFOX_HEADLESS=virtual \
    CAMOUFOX_GEOIP=true \
    CAMOUFOX_TIMEOUT_MS=90000

EXPOSE 8192

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8192"]
