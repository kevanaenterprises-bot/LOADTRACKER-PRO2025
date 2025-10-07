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
  connectionTimeoutMillis: 15000, // Increased to allow for Neon wake-up time
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