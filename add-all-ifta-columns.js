import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.LOADTRACKER_DB_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addAllIFTAColumns() {
  const client = await pool.connect();
  try {
    console.log('🔧 Adding all IFTA-related columns...');
    
    await client.query(`
      ALTER TABLE loads 
      ADD COLUMN IF NOT EXISTS miles_by_state JSONB,
      ADD COLUMN IF NOT EXISTS miles_this_trip DECIMAL(8, 1)
    `);
    
    console.log('✅ All IFTA columns added!');
    
    // List all IFTA-related columns
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loads' 
      AND (column_name LIKE '%odometer%' OR column_name LIKE '%miles%' OR column_name LIKE '%ifta%' OR column_name LIKE '%deadhead%')
      ORDER BY column_name
    `);
    
    console.log('\n📊 All IFTA/mileage columns:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.column_name} (${row.data_type})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

addAllIFTAColumns();
