import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Priority order: RAILWAY_DATABASE_URL (Neon) > LOADTRACKER_DB_URL > DATABASE_URL
// RAILWAY_DATABASE_URL contains the correct Neon connection string
const connectionString = process.env.RAILWAY_DATABASE_URL || process.env.LOADTRACKER_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Database URL must be set. Set either LOADTRACKER_DB_URL or DATABASE_URL.",
  );
}
const isRailway = connectionString.includes('proxy.rlwy.net');
const isNeon = connectionString.includes('neon.tech');

export const pool = new Pool({
  connectionString,
  // Use SSL for Railway and Neon external connections
  ssl: (isRailway || isNeon) ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // Increased timeout for Neon wake-up
});

// Automatic retry wrapper for database queries to handle Neon hibernation
export async function queryWithRetry<T>(
  queryFn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error: any) {
      const isConnectionError = error.code === 'ECONNRESET' || 
                                error.code === 'ECONNREFUSED' ||
                                error.code === 'ETIMEDOUT';
      
      if (isConnectionError && attempt < maxRetries) {
        console.log(`🔄 Database connection attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

export const db = drizzle(pool, { schema });