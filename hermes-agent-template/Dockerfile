FROM node:22-bookworm-slim AS frontend
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates
# Hermes v0.21.5 (release v2026.9.24). Pin source and use its dependency lock.
ARG HERMES_COMMIT=f97608f178d1ffeca59860195ab7da295f7c8e5f
RUN git init /opt/hermes \
    && cd /opt/hermes \
    && git remote add origin https://github.com/nousresearch/hermes-agent.git \
    && git fetch --depth 1 origin "$HERMES_COMMIT" \
    && git checkout --detach FETCH_HEAD

# Build the real dashboard and its embedded terminal before runtime networking is restricted.
WORKDIR /opt/hermes
RUN npm ci --workspace web --workspace hermes-tui --include-workspace-root --ignore-scripts \
    && npm run build --workspace web \
    && npm run build --workspace hermes-tui \
    && mkdir -p hermes_cli/tui_dist \
    && cp ui-tui/dist/entry.js hermes_cli/tui_dist/entry.js \
    && find . -type d -name node_modules -prune -exec rm -rf '{}' +

FROM python:3.13-slim-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ripgrep libstdc++6 tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=frontend /usr/local/bin/node /usr/local/bin/node
COPY --from=frontend /opt/hermes /opt/hermes

COPY --from=ghcr.io/astral-sh/uv:0.11.6 /uv /usr/local/bin/uv
RUN cd /opt/hermes && uv sync --frozen --no-dev --extra web --python /usr/local/bin/python3

ENV PATH="/opt/hermes/.venv/bin:$PATH"
WORKDIR /workspace
COPY start-dashboard.py /opt/start-dashboard.py
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python3", "/opt/start-dashboard.py"]
