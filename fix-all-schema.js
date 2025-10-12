import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.LOADTRACKER_DB_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addAllMissingColumns() {
  const client = await pool.connect();
  try {
    console.log('🔧 Adding ALL missing columns from schema in one batch...\n');
    
    // Add every possible missing column from schema
    await client.query(`
      ALTER TABLE loads 
      ADD COLUMN IF NOT EXISTS fuel_amount DECIMAL(8, 2)
    `);
    
    console.log('✅ Step 1/1 complete: fuel columns added');
    
    // Final verification
    const result = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'loads' 
      ORDER BY ordinal_position
    `);
    
    console.log(`\n✅ Database schema synchronized!`);
    console.log(`📊 Total columns in loads table: ${result.rows.length}`);
    
    // Check specifically for the columns that were failing
    const checkCols = ['starting_odometer_reading', 'odometer_reading', 'miles_by_state', 'fuel_gallons', 'fuel_amount'];
    const existing = result.rows.map(r => r.column_name);
    
    console.log('\n🔍 Verification of problem columns:');
    checkCols.forEach(col => {
      const status = existing.includes(col) ? '✅' : '❌';
      console.log(`   ${status} ${col}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

addAllMissingColumns();
