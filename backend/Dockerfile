FROM node:22-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/server.ts"]
