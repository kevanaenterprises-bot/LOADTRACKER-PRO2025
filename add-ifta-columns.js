import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addIFTAColumns() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Adding IFTA columns to loads table...');
    
    await client.query(`
      ALTER TABLE loads 
      ADD COLUMN IF NOT EXISTS starting_odometer_reading TEXT,
      ADD COLUMN IF NOT EXISTS ending_odometer_reading TEXT,
      ADD COLUMN IF NOT EXISTS ifta_truck_number TEXT,
      ADD COLUMN IF NOT EXISTS deadhead_miles TEXT,
      ADD COLUMN IF NOT EXISTS deadhead_miles_by_state JSONB;
    `);
    
    console.log('✅ IFTA columns added successfully!');
    
    // Verify columns exist
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'loads' 
      AND column_name IN ('starting_odometer_reading', 'ending_odometer_reading', 'ifta_truck_number', 'deadhead_miles', 'deadhead_miles_by_state')
      ORDER BY column_name;
    `);
    
    console.log('📊 IFTA columns in database:', result.rows.map(r => r.column_name));
    
  } catch (error) {
    console.error('❌ Error adding columns:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addIFTAColumns().catch(console.error);
