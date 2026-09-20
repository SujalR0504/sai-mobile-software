import path from "node:path";
import process from "node:process";

// Auto-load .env if Node/Bun runtime supports it
try {
  if (typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile();
  }
} catch {
  // .env already loaded by Bun or Vite
}

export const config = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || "0.0.0.0",
  databasePath: process.env.DATABASE_PATH || path.resolve(process.cwd(), "data/store.sqlite"),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  jwtSecret: process.env.JWT_SECRET || "mobile-shop-erp-secure-secret-key-2026",
};
