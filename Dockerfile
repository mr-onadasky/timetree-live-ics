# syntax=docker/dockerfile:1

FROM node:20-slim AS build

# Install python + timetree-exporter (Python CLI)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir timetree-exporter

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev

FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir timetree-exporter

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

ENV PORT=8080 \
    OUTPUT_PATH=/data/timetree.ics \
    CRON_SCHEDULE="*/30 * * * *" \
    NODE_ENV=production

VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "dist/index.js"]
