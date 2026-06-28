# Camoufox fetch sidecar — anti-detect Firefox behind a tiny HTTP API.
#
# Built on the Playwright Python image, which already ships the OS libraries the
# (Firefox-based) Camoufox browser needs. We then install Camoufox, download its
# patched browser + GeoIP database at build time, and serve server.py.
FROM mcr.microsoft.com/playwright/python:v1.55.0-noble

WORKDIR /app

# camoufox[geoip] = the browser launcher + bundled MaxMind GeoIP support.
RUN pip install --no-cache-dir "camoufox[geoip]" "fastapi>=0.115" "uvicorn[standard]>=0.30"

# Pre-download the patched Firefox + GeoIP DB so the container starts offline-ready.
RUN python -m camoufox fetch

COPY server.py ./

ENV CAMOUFOX_HEADLESS=true \
    CAMOUFOX_GEOIP=true \
    CAMOUFOX_TIMEOUT_MS=90000

EXPOSE 8192

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8192"]
