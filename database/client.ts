import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { initSchema, seedIfEmpty } from "./schema";

let dbInstance: DatabaseSync | null = null;

export function getDatabasePath(): string {
  const customPath = process.env.DATABASE_PATH;
  if (customPath) return customPath;
  if (
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.TEST) ||
    typeof (globalThis as any).describe === "function" ||
    typeof (globalThis as any).test === "function"
  ) {
    return "/tmp/store_test.sqlite";
  }
  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, "store.sqlite");
}

export function getDB(): DatabaseSync {
  if (!dbInstance) {
    const dbPath = getDatabasePath();
    dbInstance = new DatabaseSync(dbPath);
    // Enable WAL for concurrency and enable foreign key enforcement
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");
    
    // Initialize tables and default seed data
    initSchema(dbInstance);
    seedIfEmpty(dbInstance);
  }
  return dbInstance;
}

export function closeDB(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
  }
}
