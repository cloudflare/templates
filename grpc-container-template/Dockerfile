FROM node:22-slim

WORKDIR /app

COPY container/package*.json ./
RUN npm ci --omit=dev

COPY proto ./proto
COPY container ./container

ENV GRPC_PORT=50051
EXPOSE 50051

CMD ["node", "container/server.js"]

