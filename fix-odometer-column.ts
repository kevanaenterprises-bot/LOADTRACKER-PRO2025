import pg from 'pg';

const { Pool } = pg;

async function addOdometerColumn() {
  const pool = new Pool({
    connectionString: process.env.RAILWAY_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 Connecting to Railway database...');
    
    // Add the missing column
    console.log('➕ Adding odometer_reading column...');
    await pool.query(`
      ALTER TABLE loads 
      ADD COLUMN IF NOT EXISTS odometer_reading NUMERIC(10, 1)
    `);
    
    console.log('✅ Column added successfully!');
    
    // Verify it was added
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loads' 
      AND column_name = 'odometer_reading'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Verified: odometer_reading column exists');
      console.log('Column details:', result.rows[0]);
    }
    
    console.log('🎉 Database schema fixed! Your 3 loads will now appear!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addOdometerColumn();
