import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.LOADTRACKER_DB_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkColumns() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'loads' 
      AND column_name LIKE '%odometer%'
      ORDER BY column_name
    `);
    
    console.log('📊 Odometer columns in database:');
    result.rows.forEach(row => {
      console.log(`   ${row.column_name} (${row.data_type})`);
    });
    
    if (result.rows.length === 0) {
      console.log('   ⚠️  No odometer columns found!');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkColumns();
