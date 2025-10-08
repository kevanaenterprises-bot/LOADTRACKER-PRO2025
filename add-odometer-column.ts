import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.RAILWAY_DATABASE_URL!);

async function addOdometerColumn() {
  try {
    console.log('Checking if odometer_reading column exists...');
    
    // Check if column exists
    const result = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'loads' 
      AND column_name = 'odometer_reading'
    `;
    
    if (result.length > 0) {
      console.log('✓ odometer_reading column already exists!');
    } else {
      console.log('Adding odometer_reading column...');
      await sql`
        ALTER TABLE loads 
        ADD COLUMN odometer_reading NUMERIC(10, 1)
      `;
      console.log('✓ odometer_reading column added successfully!');
    }
    
    console.log('✓ Database schema is up to date!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addOdometerColumn();
