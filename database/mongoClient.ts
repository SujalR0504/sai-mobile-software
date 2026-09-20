import { MongoClient, Db } from "mongodb";
import type { DatabaseSync } from "node:sqlite";

let clientInstance: MongoClient | null = null;
let dbInstance: Db | null = null;

export function getMongoUri(): string {
  return (
    process.env.MONGODB_URI ||
    "mongodb+srv://sujalrathore970_db_user:x18Em1cPjtpeqSG6@cluster0.evdf063.mongodb.net/mobile_shop_erp?retryWrites=true&w=majority&appName=Cluster0"
  );
}

export function getMongoDbName(): string {
  return process.env.MONGODB_DB_NAME || "mobile_shop_erp";
}

/**
 * Get or initialize MongoDB client instance
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (!clientInstance) {
    const uri = getMongoUri();
    clientInstance = new MongoClient(uri, {
      family: 4,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 20000,
    } as any);
    await clientInstance.connect();
  }
  return clientInstance;
}

/**
 * Get the active MongoDB database
 */
export async function getMongoDatabase(): Promise<Db> {
  if (!dbInstance) {
    const client = await getMongoClient();
    dbInstance = client.db(getMongoDbName());
  }
  return dbInstance;
}

/**
 * Check if MongoDB Atlas is currently connected and reachable
 */
export async function checkMongoConnection(): Promise<{
  connected: boolean;
  database: string;
  error?: string;
}> {
  try {
    const db = await getMongoDatabase();
    await db.command({ ping: 1 });
    return {
      connected: true,
      database: getMongoDbName(),
    };
  } catch (err: any) {
    return {
      connected: false,
      database: getMongoDbName(),
      error: err?.message || String(err),
    };
  }
}

/**
 * Full cloud synchronization: Copies all SQLite relational tables to MongoDB Atlas collections.
 * Uses upsert by 'id' so repeated syncs safely update rather than duplicate.
 */
export async function syncSQLiteToMongo(
  sqliteDb: DatabaseSync,
): Promise<{
  success: boolean;
  syncedCounts: Record<string, number>;
  timestamp: string;
}> {
  const mongoDb = await getMongoDatabase();
  const tables = [
    "settings",
    "categories",
    "subcategories",
    "brands",
    "models",
    "products",
    "units",
    "customers",
    "suppliers",
    "purchases",
    "purchase_items",
    "purchase_payments",
    "sales",
    "sale_items",
    "sale_payments",
    "orders",
    "order_items",
    "order_payments",
    "order_status_history",
    "repairs",
    "payments",
    "payment_accounts",
    "payment_account_transactions",
    "emi_companies",
    "emi_receivables",
    "emi_receipts",
    "emi_accounts",
    "emi_schedules",
    "employees",
    "attendance",
    "payroll",
    "employee_permissions",
    "cashbook",
    "customer_ledger",
    "dealer_ledger",
    "audit_logs",
  ];

  const syncedCounts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all() as any[];
      const collection = mongoDb.collection(table);
      if (rows && rows.length > 0) {
        // Bulk upsert each row using id as key
        const bulkOps = rows.map((row) => ({
          updateOne: {
            filter: { id: row.id || row.key || row.rowid },
            update: { $set: { ...row, _syncedAt: new Date().toISOString() } },
            upsert: true,
          },
        }));

        if (bulkOps.length > 0) {
          await collection.bulkWrite(bulkOps, { ordered: false });
        }
      } else {
        // Table is empty in SQLite, clear collection in MongoDB to keep full sync
        await collection.deleteMany({});
      }
      syncedCounts[table] = rows?.length || 0;
    } catch {
      // Table might not exist or be empty, continue with others
      syncedCounts[table] = 0;
    }
  }

  // Record sync metadata
  await mongoDb.collection("_sync_metadata").insertOne({
    syncedAt: new Date().toISOString(),
    status: "SUCCESS",
    syncedCounts,
  });

  return {
    success: true,
    syncedCounts,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper to sync a single updated document directly to MongoDB collection in the background
 */
export async function syncDocumentToMongo(
  collectionName: string,
  doc: { id: string; [key: string]: any },
): Promise<void> {
  try {
    const mongoDb = await getMongoDatabase();
    await mongoDb.collection(collectionName).updateOne(
      { id: doc.id },
      { $set: { ...doc, _syncedAt: new Date().toISOString() } },
      { upsert: true },
    );
  } catch {
    // Non-blocking: failure to sync to cloud does not halt local POS operations
  }
}
