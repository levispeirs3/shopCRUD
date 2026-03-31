import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let dbInstance: Database.Database | null = null;

function resolveDbPath() {
  const fromEnv = process.env.SHOP_DB_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const candidates = [
    path.join(process.cwd(), "shop.db"),
    path.join(process.cwd(), "data", "shop.db"),
    path.join(process.cwd(), "Data", "shop.db"),
  ];

  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing ?? candidates[0];
}

export function getDb() {
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    dbInstance = new Database(dbPath);
    dbInstance.pragma("foreign_keys = ON");
  }
  return dbInstance;
}

export function selectAll<T>(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).all(...params) as T[];
}

export function selectOne<T>(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function runStatement(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).run(...params);
}
