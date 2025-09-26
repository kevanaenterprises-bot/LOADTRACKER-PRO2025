import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure connection for Railway or other PostgreSQL services
const connectionString = process.env.DATABASE_URL;
const isRailway = connectionString.includes('yamabiko.proxy.rlwy.net');

export const pool = new Pool({
  connectionString,
  // Use standard SSL for Railway external connections
  ssl: isRailway ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });