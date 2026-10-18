# Build stage — needs devDependencies to run tsc.
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# Runtime stage — ships only production deps and compiled JS.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
RUN mkdir -p uploads

# Run as an unprivileged user rather than root.
USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]
