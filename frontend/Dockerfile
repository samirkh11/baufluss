# Meisterwerk frontend: build the React app, serve it with nginx. The same nginx forwards /api/ to the backend,
# so browser and API share one origin (one domain, one certificate, no CORS).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The API lives under /api on the same host (see nginx.conf).
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
