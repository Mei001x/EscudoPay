import { env } from "./env";

export const config = {
    port: env.PORT,
    database: {
        url: env.DATABASE_URL,
        directUrl: process.env.DIRECT_URL ?? "",
        dbUser: process.env.DB_USER ?? "",
        dbPassword: process.env.DB_PASSWORD ?? "",
        dbName: process.env.DB_NAME ?? "",
    },
    jwt: {
        secret: process.env.JWT_SECRET ?? "",
        refreshSecret: process.env.JWT_REFRESH_SECRET ?? "",
        expires: process.env.JWT_EXPIRES_IN ?? "12h",
        refreshExpires: process.env.REFRESH_TOKEN_EXPIRES_IN ?? "7d"
    },
    bycrypt: {
        saltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12)
    },
    rateLimit: {
        windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000), // 15 minutes
        max: Number(process.env.RATE_LIMIT_MAX ?? 100), // limit each IP to 100 requests per windowMs
    },
    logging: {
        level: process.env.LOG_LEVEL ?? "info",
        prismaLogQuery: process.env.PRISMA_LOG_QUERIES ?? "info",
    },
    env: env.NODE_ENV,
    docs: {
        urlDocs: env.URL_DOCS,
    }
}