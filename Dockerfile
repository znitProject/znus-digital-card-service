FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
ENV NODE_ENV=production PORT=4173
EXPOSE 4173
CMD ["node", "server/index.cjs"]
