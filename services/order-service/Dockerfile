FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# Copy the dependency manifests first: this layer is rebuilt only when the
# dependencies change, not on every source edit.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Run as the unprivileged "node" user that ships with the image.
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
