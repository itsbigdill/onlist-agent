# onlist-agent — deployable to Alibaba Cloud ECS / Container Registry / FC
FROM oven/bun:1 AS runtime
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
COPY seed ./seed
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "src/server.ts"]
