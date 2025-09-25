const fs = require('fs');
const { Client } = require('pg');

const DATABASE_URL = "postgresql://postgres:rapKynFxOSntiubEfzrhdCrAESxDNtXv@yamabiko.proxy.rlwy.net:40972/railway";

async function importProductionData() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  console.log("Connected to Railway database");
  
  try {
    // Read the loads data
    const loadsData = JSON.parse(fs.readFileSync('loads.json', 'utf8'));
    console.log(`Found ${loadsData.length} loads to import`);
    
    // Track unique drivers and locations to avoid duplicates
    const uniqueDrivers = new Map();
    const uniqueLocations = new Map();
    
    // Extract and collect unique drivers and locations
    for (const load of loadsData) {
      if (load.driver && load.driver.id) {
        uniqueDrivers.set(load.driver.id, load.driver);
      }
      if (load.location && load.location.id) {
        uniqueLocations.set(load.location.id, load.location);
      }
    }
    
    console.log(`Found ${uniqueDrivers.size} unique drivers`);
    console.log(`Found ${uniqueLocations.size} unique locations`);
    
    // Import drivers first
    for (const [id, driver] of uniqueDrivers) {
      try {
        await client.query(`
          INSERT INTO users (id, email, first_name, last_name, profile_image_url, role, phone_number, username, password, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO NOTHING
        `, [
          driver.id,
          driver.email,
          driver.firstName,
          driver.lastName,
          driver.profileImageUrl,
          driver.role || 'driver',
          driver.phoneNumber,
          driver.username,
          driver.password,
          driver.createdAt,
          driver.updatedAt
        ]);
        console.log(`Imported driver: ${driver.firstName} ${driver.lastName}`);
      } catch (error) {
        console.error(`Error importing driver ${driver.id}:`, error.message);
      }
    }
    
    // Import locations
    for (const [id, location] of uniqueLocations) {
      try {
        await client.query(`
          INSERT INTO locations (id, name, address, city, state, contact_name, contact_phone, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING
        `, [
          location.id,
          location.name,
          location.address,
          location.city,
          location.state,
          location.contactName,
          location.contactPhone,
          location.createdAt
        ]);
        console.log(`Imported location: ${location.name}`);
      } catch (error) {
        console.error(`Error importing location ${location.id}:`, error.message);
      }
    }
    
    // Import loads
    let importedLoads = 0;
    for (const load of loadsData) {
      try {
        await client.query(`
          INSERT INTO loads (
            id, number_109, driver_id, location_id, pickup_location_id, estimated_miles,
            special_instructions, status, bol_number, trip_number, bol_document_path,
            pod_document_path, signature_url, signed_at, extra_stops, lumper_charge,
            trip_rate, flat_rate, po_number, appointment_time, pickup_address,
            delivery_address, company_name, created_at, updated_at, delivery_due_at,
            delivered_at, completed_at, paid_at, payment_method, payment_reference,
            payment_notes, is_archived, archived_at, driver_confirmed, driver_confirmed_at,
            tracking_enabled, current_latitude, current_longitude, shipper_latitude,
            shipper_longitude, receiver_latitude, receiver_longitude, last_location_update
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44
          )
          ON CONFLICT (id) DO NOTHING
        `, [
          load.id,
          load.number109,
          load.driverId,
          load.locationId,
          load.pickupLocationId,
          load.estimatedMiles,
          load.specialInstructions,
          load.status,
          load.bolNumber,
          load.tripNumber,
          load.bolDocumentPath,
          load.podDocumentPath,
          load.signatureURL,
          load.signedAt,
          load.extraStops || 0,
          load.lumperCharge || '0.00',
          load.tripRate || '0.00',
          load.flatRate || '0.00',
          load.poNumber,
          load.appointmentTime,
          load.pickupAddress,
          load.deliveryAddress,
          load.companyName,
          load.createdAt,
          load.updatedAt,
          load.deliveryDueAt,
          load.deliveredAt,
          load.completedAt,
          load.paidAt,
          load.paymentMethod,
          load.paymentReference,
          load.paymentNotes,
          load.isArchived || false,
          load.archivedAt,
          load.driverConfirmed || false,
          load.driverConfirmedAt,
          load.trackingEnabled || false,
          load.currentLatitude,
          load.currentLongitude,
          load.shipperLatitude,
          load.shipperLongitude,
          load.receiverLatitude,
          load.receiverLongitude,
          load.lastLocationUpdate
        ]);
        
        importedLoads++;
        console.log(`Imported load: ${load.number109}`);
      } catch (error) {
        console.error(`Error importing load ${load.number109}:`, error.message);
      }
    }
    
    console.log(`\n=== IMPORT SUMMARY ===`);
    console.log(`Drivers imported: ${uniqueDrivers.size}`);
    console.log(`Locations imported: ${uniqueLocations.size}`);
    console.log(`Loads imported: ${importedLoads}`);
    console.log(`\nProduction data migration complete!`);
    
  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await client.end();
  }
}

importProductionData().catch(console.error);