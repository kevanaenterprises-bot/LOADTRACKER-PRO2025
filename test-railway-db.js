import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
});

async function testConnection() {
  let client;
  try {
    console.log('🔧 Testing Railway database connection...');
    client = await pool.connect();
    console.log('✅ Connected to Railway database!');
    
    // Check if loads table exists
    const tableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'loads'
    `);
    
    if (tableCheck.rows.length > 0) {
      console.log('✅ loads table exists');
      
      // Check for IFTA columns
      const columnCheck = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'loads' 
        AND column_name IN ('starting_odometer_reading', 'ending_odometer_reading', 'ifta_truck_number', 'deadhead_miles', 'deadhead_miles_by_state')
      `);
      
      console.log(`📊 IFTA columns found: ${columnCheck.rows.map(r => r.column_name).join(', ') || 'NONE'}`);
      
      if (columnCheck.rows.length === 0) {
        console.log('⚠️  IFTA columns missing - attempting to add them...');
        await client.query(`
          ALTER TABLE loads 
          ADD COLUMN IF NOT EXISTS starting_odometer_reading TEXT,
          ADD COLUMN IF NOT EXISTS ending_odometer_reading TEXT,
          ADD COLUMN IF NOT EXISTS ifta_truck_number TEXT,
          ADD COLUMN IF NOT EXISTS deadhead_miles TEXT,
          ADD COLUMN IF NOT EXISTS deadhead_miles_by_state JSONB
        `);
        console.log('✅ IFTA columns added to Railway database!');
      }
    } else {
      console.log('⚠️  loads table does not exist in Railway database');
    }
    
  } catch (error) {
    console.error('❌ Railway database error:', error.message);
    console.log('\n💡 Railway database is offline. Your app is using Replit database as fallback.');
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

testConnection();
