# Stage 1: Build the application using Node.js 18
FROM node:18-alpine as build-stage

WORKDIR /app

# Copy package.json and yarn.lock to leverage Docker cache
COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

# Stage 2: Serve the application with Nginx
FROM nginx:stable-alpine as production-stage

COPY --from=build-stage /app /usr/share/nginx/html

COPY nginx.conf /etc/nginx/nginx.conf

# Ensure Nginx runs in the foreground for Docker
CMD ["nginx", "-g", "daemon off;"]
