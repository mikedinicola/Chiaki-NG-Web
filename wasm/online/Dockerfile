FROM node:26.12.1-bookworm-slim
WORKDIR /app
COPY wasm/online/package.json wasm/online/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-fund --no-audit && npm cache clean --force
COPY wasm/online/server.mjs wasm/online/rooms.mjs ./
COPY wasm/online/public ./public
COPY wasm/www/online-protocol.js wasm/www/pc-controls.js /www/
USER node
ENV PORT=3000 BIND=0.0.0.0 NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
