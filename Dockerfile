FROM node:24

COPY . /app

WORKDIR /app

RUN npm install -g npm@latest && \
    npm ci && \
    npm run build --workspace=@sektek/generator && \
    npm run build --workspace=@sektek/generator-test && \
    npm run build --workspace=@sektek/generator-base && \
    npm run build --workspace=@sektek/generator-js && \
    npm run build --workspace=@sektek/gen

ENTRYPOINT ["/app/bin/gen"]
