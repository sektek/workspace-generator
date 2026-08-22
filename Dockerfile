FROM node:24

COPY . /app

WORKDIR /app

RUN npm install -g npm@latest && \
    npm ci && \
    npm run build

ENTRYPOINT ["/app/bin/gen"]
