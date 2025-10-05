import { db } from "./db";
import { users, locations, customers } from "../shared/schema";

export async function migrateDataToRailway() {
  console.log("🚀 Starting data migration...\n");

  try {
    // Migrate Drivers
    console.log("📦 Migrating drivers...");
    const driversData = [
      {
        id: "f920c664-fb37-496e-af76-1f0a4321b61b",
        email: null,
        firstName: "Art",
        lastName: "Harris",
        profileImageUrl: null,
        role: "driver" as const,
        phoneNumber: "2148781230",
        username: "A Harris",
        password: null,
        createdAt: new Date("2025-08-22 05:31:43.718243"),
      },
      {
        id: "45b82aad-e5ce-4d07-9e6e-a74d0f14351b",
        email: null,
        firstName: "Torris",
        lastName: "Owen",
        profileImageUrl: null,
        role: "driver" as const,
        phoneNumber: "8178514902",
        username: "Towen",
        password: null,
        createdAt: new Date("2025-09-02 16:57:09.471483"),
      },
      {
        id: "9a29c4bf-7ef7-4a1a-b2e0-e0f486439e35",
        email: null,
        firstName: "Kevin",
        lastName: "Owen",
        profileImageUrl: null,
        role: "driver" as const,
        phoneNumber: "9038037500",
        username: "Kowen",
        password: null,
        createdAt: new Date("2025-09-02 17:17:51.5681"),
      },
    ];

    for (const driver of driversData) {
      await db.insert(users).values(driver).onConflictDoNothing();
      console.log(`  ✅ ${driver.firstName} ${driver.lastName}`);
    }

    // Migrate Locations
    console.log("\n📍 Migrating locations...");
    const locationsData = [
      { id: "b869ad22-0f3a-429f-8173-4df5939db9b9", name: "SIMMONS PET FOODS", address: "501 SEIPPEL RD", city: "Dubuque", state: "IA", contactName: null, contactPhone: null, createdAt: new Date("2025-08-21 03:30:14.469008") },
      { id: "2fa5d3c8-b631-4225-82dc-41b20792051f", name: "NESTLE FOODS", address: "4301 HARIET AVE", city: "Fort Smith", state: "AR", contactName: null, contactPhone: null, createdAt: new Date("2025-08-21 03:43:59.743768") },
      { id: "b1500c58-969d-4d8e-a2f1-27ddbfbcdf0e", name: "FLORES", address: "2079 S FLORES ST", city: "San Antonio ", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-08-21 03:45:09.092696") },
      { id: "66e05793-9c5c-4f3c-a605-45883be55a01", name: "ACW CREEKSTONE", address: "102 GOFF INDUSTRIAL PARK RD", city: "Arkansas City", state: "KS", contactName: null, contactPhone: null, createdAt: new Date("2025-08-21 03:46:55.501378") },
      { id: "7e191069-af34-4409-a124-13b15c2a6cc6", name: "SHINER BEERer Beer", address: "603 E BREWERY ST", city: "Shiner", state: "Tx", contactName: null, contactPhone: null, createdAt: new Date("2025-08-22 05:33:20.610472") },
      { id: "e71de6a7-c18a-43d8-8226-ecbd5909ed02", name: "Shiner/Plano returns", address: null, city: "Shiner/plano Returns", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-08-22 05:35:03.565903") },
      { id: "db53646c-b106-4120-ac6b-9fa6d99b624a", name: "Dubuque/Plano returns", address: null, city: "Dubuque/Plano Teturns", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-08-22 05:35:51.163518") },
      { id: "6d5161f0-92ac-4414-9d22-d5eb12bda40d", name: "UNFI LANCASTER", address: "2100 DANIELDALE RD", city: "Lancaster", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-08-22 05:36:24.367772") },
      { id: "80fd0a9b-aa3a-43c5-b758-338eb60f7a8e", name: "AMERICOLD LOGISTICS", address: "2524 EXCHANGE AVE", city: "Oklahoma City", state: "Ok", contactName: null, contactPhone: null, createdAt: new Date("2025-08-24 01:36:55.665158") },
      { id: "a07a5eb6-7903-4b62-bd9f-57b181103a2e", name: "FINE ARTS ENGRAVING", address: null, city: "OKLAHOMA CITY ", state: "OK", contactName: null, contactPhone: null, createdAt: new Date("2025-08-24 20:47:03.986828") },
      { id: "398dd9db-15ab-4f2a-90ca-cb95a434160c", name: "DEL REAL FOODS", address: "1101 MESSENGER LN", city: "Moore", state: "Ok", contactName: null, contactPhone: null, createdAt: new Date("2025-09-02 15:09:03.527862") },
      { id: "03ad71e6-c601-4825-ae99-eb4e70ad5086", name: "FRYTOWN DISTRIBUTION", address: "5195 FARMERS AVE", city: "KALONA", state: "IA", contactName: null, contactPhone: null, createdAt: new Date("2025-09-05 06:01:58.327124") },
      { id: "5b3abd72-6f09-4292-ab4d-d163afb6c96f", name: "KEHE", address: null, city: "DALLAS", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-09-05 06:03:14.762595") },
      { id: "8cfdf99f-504e-491b-ad6e-ddbd074dd3c7", name: "HEN HOUSE", address: null, city: "KALONA", state: "IA", contactName: null, contactPhone: null, createdAt: new Date("2025-09-05 06:04:33.587664") },
      { id: "6e09896d-c000-4f1d-85d0-cd014f62437d", name: "MUSKET BIG SPRING", address: null, city: "Big Spring", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-09-05 08:36:03.39055") },
      { id: "a699c500-5c87-40ef-92ad-e79e2e78ece3", name: "ECOTECH CONSUMER PRODUCTS", address: null, city: "FAYETTEVILLE", state: "AR", contactName: null, contactPhone: null, createdAt: new Date("2025-09-05 08:40:47.244461") },
      { id: "c7627fcc-902e-4697-8006-e14c904c36fc", name: "PCA Plano", address: "1800 E PLANO PKWY", city: "Plano", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-09-05 21:03:18.251943") },
      { id: "53776b42-cb7d-44ec-b406-a3b8434c16cc", name: "SMURFIT KAPPA NORTH AMERICA", address: "726 E WALN UT ST", city: "GARLAND", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-09-08 17:01:23.203198") },
      { id: "6748a6cf-c54b-438a-af7a-37b9f74d8726", name: "PCA GARLAND", address: "2510 W MILLER RD", city: "GARLAND", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-09-08 17:04:21.626107") },
      { id: "baababc7-6b5b-49e0-91c9-581f03c91d60", name: "PACSPACE", address: "1609 OLD N MISSOURI RD", city: "SPRINGDALE ", state: "AR", contactName: null, contactPhone: null, createdAt: new Date("2025-09-08 17:06:18.719886") },
      { id: "ce552b6d-c156-487a-9bd2-05cf705085e2", name: "FGF TRAILER RENTAL", address: null, city: "TRAILER ", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-09-17 22:45:46.99399") },
      { id: "04ba7cf2-1c69-4f78-9476-bf0255570e16", name: "FUJI/CMC PUEBLO", address: "250 William White Blvd ", city: "PUEBLO", state: "CO", contactName: null, contactPhone: null, createdAt: new Date("2025-09-20 22:11:57.137724") },
      { id: "5bfe2bf8-c410-49ac-9b92-875839b7a9df", name: "FGF TRAILER RENTAL", address: null, city: "SAN ANTON", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-09-21 05:03:06.510352") },
      { id: "a015cb45-8990-4e86-ae55-d52591673ce2", name: "TEST LOCATION", address: "123 Test St", city: "Test City", state: "TX", contactName: null, contactPhone: null, createdAt: new Date("2025-09-26 10:11:51.535428") },
    ];

    for (const location of locationsData) {
      await db.insert(locations).values(location).onConflictDoNothing();
      console.log(`  ✅ ${location.name}`);
    }

    // Migrate Customers
    console.log("\n🏢 Migrating customers...");
    const customersData = [
      {
        id: "ae3cfa46-a50a-4283-abc8-d612e0a5b4d8",
        name: "AWESOME LOGISTICS",
        email: "POD@OPENGATESGROUP.COM",
        contactName: "SHIANNE",
        contactPhone: "1-319-646-2416",
        address: "5195 Farmers Ave",
        city: "KALONA",
        state: "IA",
        zipCode: "52247",
        contactPerson: null,
        phone: null,
        createdAt: new Date("2025-09-05 08:00:32.352848"),
      },
      {
        id: "26d47a96-4d70-4942-8757-da8d154116eb",
        name: "PCA PLANO",
        email: "ESUBMIT@AFS.NET",
        contactName: null,
        contactPhone: null,
        address: "1800 E PLANO PKWY\nPLANO TX 75074",
        city: null,
        state: null,
        zipCode: null,
        contactPerson: "RICKY SNOW",
        phone: null,
        createdAt: new Date("2025-09-07 14:56:09.401483"),
      },
    ];

    for (const customer of customersData) {
      await db.insert(customers).values(customer).onConflictDoNothing();
      console.log(`  ✅ ${customer.name}`);
    }

    return {
      success: true,
      summary: {
        drivers: driversData.length,
        locations: locationsData.length,
        customers: customersData.length,
      },
    };
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  }
}
