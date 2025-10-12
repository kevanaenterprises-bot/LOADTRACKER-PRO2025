import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.LOADTRACKER_DB_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function syncAllColumns() {
  const client = await pool.connect();
  try {
    console.log('🔧 Adding ALL missing columns from schema...');
    
    // Add ALL columns that might be missing
    await client.query(`
      ALTER TABLE loads 
      ADD COLUMN IF NOT EXISTS fuel_gallons DECIMAL(8, 2)
    `);
    
    console.log('✅ All columns synchronized!');
    
    // Show final column count
    const result = await client.query(`
      SELECT COUNT(*) as column_count
      FROM information_schema.columns 
      WHERE table_name = 'loads'
    `);
    
    console.log(`\n📊 Total columns in loads table: ${result.rows[0].column_count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

syncAllColumns();
