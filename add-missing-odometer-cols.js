import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.LOADTRACKER_DB_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addMissingColumns() {
  const client = await pool.connect();
  try {
    console.log('🔧 Adding missing odometer columns...');
    
    await client.query(`
      ALTER TABLE loads 
      ADD COLUMN IF NOT EXISTS odometer_reading DECIMAL(10, 1),
      ADD COLUMN IF NOT EXISTS previous_odometer_reading DECIMAL(10, 1),
      ADD COLUMN IF NOT EXISTS miles_this_trip DECIMAL(8, 1)
    `);
    
    console.log('✅ Missing columns added!');
    
    // Verify
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loads' 
      AND column_name LIKE '%odometer%'
      ORDER BY column_name
    `);
    
    console.log('\n📊 All odometer columns now:');
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

addMissingColumns();
