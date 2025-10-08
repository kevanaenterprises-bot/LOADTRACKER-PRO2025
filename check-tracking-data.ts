import pg from 'pg';

const { Pool } = pg;

async function checkTrackingData() {
  const pool = new Pool({
    connectionString: process.env.RAILWAY_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔍 Checking tracking data for loads...\n');
    
    const result = await pool.query(`
      SELECT 
        number_109,
        status,
        tracking_enabled,
        current_latitude,
        current_longitude,
        last_location_update,
        driver_id
      FROM loads
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${result.rowCount} loads:\n`);
    
    result.rows.forEach((load, i) => {
      console.log(`Load ${i + 1}: ${load.number_109}`);
      console.log(`  Status: ${load.status}`);
      console.log(`  Tracking enabled: ${load.tracking_enabled}`);
      console.log(`  Driver assigned: ${load.driver_id ? 'Yes' : 'No'}`);
      console.log(`  Current location: ${load.current_latitude ? `${load.current_latitude}, ${load.current_longitude}` : 'No location data'}`);
      console.log(`  Last update: ${load.last_location_update || 'Never'}\n`);
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTrackingData();
