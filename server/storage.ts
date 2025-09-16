import {
  users,
  locations,
  loads,
  loadStops,
  bolNumbers,
  rates,
  customers,
  invoiceCounter,
  invoices,
  loadStatusHistory,
  notificationPreferences,
  notificationLog,
  type User,
  type UpsertUser,
  type Location,
  type InsertLocation,
  type Load,
  type InsertLoad,
  type LoadWithDetails,
  type LoadStop,
  type InsertLoadStop,
  type BolNumber,
  type InsertBolNumber,
  type Rate,
  type InsertRate,
  type Customer,
  type InsertCustomer,
  type Invoice,
  type InsertInvoice,
  type LoadStatusHistoryEntry,
  type NotificationPreferences,
  type InsertNotificationPreferences,
  type NotificationLog,
  type InsertNotificationLog,
  chatMessages,
  type ChatMessage,
  type InsertChatMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, not } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getDriverByUsername(username: string): Promise<User | undefined>;

  // Location operations
  getLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  getLocationByName(name: string): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: string, location: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<void>;

  // Load operations
  createLoad(load: InsertLoad, stops?: InsertLoadStop[]): Promise<Load>;
  getLoads(): Promise<LoadWithDetails[]>;
  getLoad(id: string): Promise<LoadWithDetails | undefined>;
  getLoadByNumber(number: string): Promise<LoadWithDetails | undefined>;
  updateLoad(id: string, updates: Partial<Load>): Promise<Load>;
  updateLoadStatus(id: string, status: string, timestamp?: Date): Promise<Load>;
  updateLoadBOL(id: string, bolNumber: string, tripNumber: string): Promise<Load>;
  updateLoadBOLDocument(id: string, bolDocumentPath: string): Promise<Load>;
  updateLoadPOD(id: string, podDocumentPath: string): Promise<Load>;
  getLoadsByDriver(driverId: string): Promise<LoadWithDetails[]>;
  getLoadsWithTracking(): Promise<LoadWithDetails[]>;
  deleteLoad(id: string): Promise<void>;
  
  // Load stops operations
  getLoadStops(loadId: string): Promise<LoadStop[]>;
  createLoadStop(stop: InsertLoadStop): Promise<LoadStop>;

  // BOL operations
  checkBOLExists(bolNumber: string): Promise<boolean>;
  checkBOLExistsForDifferentLoad(bolNumber: string, excludeLoadId?: string): Promise<boolean>;
  createBOLNumber(bol: InsertBolNumber): Promise<BolNumber>;

  // Rate operations
  getRates(): Promise<Rate[]>;
  getRateByLocation(city: string, state: string): Promise<Rate | undefined>;
  createRate(rate: InsertRate): Promise<Rate>;
  updateRate(id: string, rate: Partial<InsertRate>): Promise<Rate | undefined>;
  deleteRate(id: string): Promise<void>;

  // Customer operations
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer>;
  deleteCustomer(id: string): Promise<void>;

  // Invoice operations
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getInvoices(): Promise<Invoice[]>;
  getInvoice(invoiceNumber: string): Promise<Invoice | undefined>;
  updateInvoice(invoiceNumber: string, updates: Partial<Invoice>): Promise<Invoice>;
  markInvoicePrinted(invoiceId: string): Promise<Invoice>;
  getNextInvoiceNumber(): Promise<string>;
  
  // Invoice-POD integration operations
  attachPODToInvoice(invoiceId: string, podUrl: string, podChecksum: string): Promise<Invoice>;
  finalizeInvoice(invoiceId: string): Promise<Invoice>;
  findOrCreateInvoiceForLoad(loadId: string): Promise<Invoice>;

  // Notification methods
  getNotificationPreferences(driverId: string): Promise<NotificationPreferences | null>;
  createDefaultNotificationPreferences(driverId: string): Promise<NotificationPreferences>;
  updateNotificationPreferences(driverId: string, updates: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences>;
  logNotification(notification: InsertNotificationLog): Promise<NotificationLog>;
  getNotificationHistory(driverId: string, limit?: number): Promise<NotificationLog[]>;

  // Statistics
  getDashboardStats(): Promise<{
    activeLoads: number;
    inTransit: number;
    deliveredToday: number;
    revenueToday: string;
  }>;

  // Driver operations
  getDrivers(): Promise<User[]>;
  getAvailableDrivers(): Promise<User[]>;
  createDriver(driver: any): Promise<User>;
  deleteDriver(driverId: string): Promise<void>;

  // Status history
  addStatusHistory(loadId: string, status: string, notes?: string): Promise<void>;

  // Chat message operations
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(sessionId: string, limit?: number): Promise<ChatMessage[]>;
  deleteChatSession(sessionId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Handle case where id might be undefined for new users
    if (!userData.id) {
      // New user - insert with role defaulting to "office"
      const [user] = await db
        .insert(users)
        .values({
          ...userData,
          role: userData.role || "office", // Default to office for new users
        })
        .returning();
      return user;
    }

    // First check if user exists
    const existingUser = await this.getUser(userData.id);
    
    if (existingUser) {
      // User exists - update only non-role fields
      const [user] = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          phoneNumber: userData.phoneNumber,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id))
        .returning();
      return user;
    } else {
      // New user - insert with role defaulting to "office"
      const [user] = await db
        .insert(users)
        .values({
          ...userData,
          role: userData.role || "office", // Default to office for new users
        })
        .returning();
      return user;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
    return user;
  }

  async getDriverByUsername(username: string): Promise<User | undefined> {
    try {
      // Use case-insensitive search by converting to lowercase
      const [user] = await db.select().from(users).where(and(
        sql`LOWER(${users.username}) = LOWER(${username})`,
        eq(users.role, "driver")
      ));
      return user;
    } catch (error) {
      console.error("Database error in getDriverByUsername:", error);
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getLocations(): Promise<Location[]> {
    return await db.select().from(locations).orderBy(locations.name);
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    return location;
  }

  async getLocationByName(name: string): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.name, name));
    return location;
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const [newLocation] = await db.insert(locations).values(location).returning();
    return newLocation;
  }

  async updateLocation(id: string, location: Partial<InsertLocation>): Promise<Location | undefined> {
    const [updatedLocation] = await db
      .update(locations)
      .set(location)
      .where(eq(locations.id, id))
      .returning();
    return updatedLocation;
  }

  async deleteLocation(id: string): Promise<void> {
    await db.delete(locations).where(eq(locations.id, id));
  }

  async createLoad(load: InsertLoad, stops?: InsertLoadStop[]): Promise<Load> {
    const [newLoad] = await db.insert(loads).values(load).returning();
    
    // Add initial status history
    await this.addStatusHistory(newLoad.id, "created", "Load created by office staff");
    
    // Create load stops if provided
    if (stops && stops.length > 0) {
      const stopsWithLoadId = stops.map(stop => ({
        ...stop,
        loadId: newLoad.id,
      }));
      await db.insert(loadStops).values(stopsWithLoadId);
    }
    
    return newLoad;
  }
  
  async getLoadStops(loadId: string): Promise<LoadStop[]> {
    const result = await db
      .select({
        stop: loadStops,
        location: locations,
      })
      .from(loadStops)
      .leftJoin(locations, eq(loadStops.locationId, locations.id))
      .where(eq(loadStops.loadId, loadId))
      .orderBy(loadStops.stopSequence);

    return result.map(row => ({
      ...row.stop,
      location: row.location || undefined,
    }));
  }
  
  async createLoadStop(stop: InsertLoadStop): Promise<LoadStop> {
    const [newStop] = await db.insert(loadStops).values(stop).returning();
    return newStop;
  }

  async removeLoadStop(stopId: string): Promise<void> {
    await db.delete(loadStops).where(eq(loadStops.id, stopId));
  }

  async getLoads(): Promise<LoadWithDetails[]> {
    const result = await db
      .select({
        load: loads,
        driver: users,
        location: locations,
        invoice: invoices,
      })
      .from(loads)
      .leftJoin(users, eq(loads.driverId, users.id))
      .leftJoin(locations, eq(loads.locationId, locations.id))
      .leftJoin(invoices, eq(loads.id, invoices.loadId))
      .orderBy(desc(loads.createdAt));

    // Get stops for each load
    const loadsWithStops = await Promise.all(
      result.map(async (row) => {
        const stops = await this.getLoadStops(row.load.id);
        return {
          ...row.load,
          driver: row.driver || undefined,
          location: row.location || undefined,
          invoice: row.invoice || undefined,
          stops: stops || [],
        };
      })
    );

    return loadsWithStops;
  }

  async getLoad(id: string): Promise<LoadWithDetails | undefined> {
    const [result] = await db
      .select({
        load: loads,
        driver: users,
        location: locations,
        invoice: invoices,
      })
      .from(loads)
      .leftJoin(users, eq(loads.driverId, users.id))
      .leftJoin(locations, eq(loads.locationId, locations.id))
      .leftJoin(invoices, eq(loads.id, invoices.loadId))
      .where(eq(loads.id, id));

    if (!result) return undefined;

    return {
      ...result.load,
      driver: result.driver || undefined,
      location: result.location || undefined,
      invoice: result.invoice || undefined,
    };
  }

  async getLoadByNumber(number: string): Promise<LoadWithDetails | undefined> {
    const [result] = await db
      .select({
        load: loads,
        driver: users,
        location: locations,
        invoice: invoices,
      })
      .from(loads)
      .leftJoin(users, eq(loads.driverId, users.id))
      .leftJoin(locations, eq(loads.locationId, locations.id))
      .leftJoin(invoices, eq(loads.id, invoices.loadId))
      .where(eq(loads.number109, number));

    if (!result) return undefined;

    return {
      ...result.load,
      driver: result.driver || undefined,
      location: result.location || undefined,
      invoice: result.invoice || undefined,
    };
  }

  async updateLoadStatus(id: string, status: string, timestamp?: Date): Promise<Load> {
    // CRITICAL BUSINESS RULE: Cannot move to awaiting_payment without an invoice
    if (status === "awaiting_payment") {
      const existingInvoices = await this.getInvoices();
      const hasInvoice = existingInvoices.some(invoice => invoice.loadId === id);
      
      if (!hasInvoice) {
        console.error(`❌ BUSINESS RULE VIOLATION: Attempted to move load ${id} to awaiting_payment without an invoice!`);
        throw new Error("Cannot move load to awaiting payment status - no invoice has been generated yet. Please generate an invoice first.");
      }
      
      console.log(`✅ BUSINESS RULE VALIDATED: Load ${id} has invoice, allowing move to awaiting_payment`);
    }
    
    const updateData: any = { status, updatedAt: new Date() };
    
    // Update specific timestamp fields based on status
    const now = timestamp || new Date();
    switch (status) {
      case "in_progress":
      case "in_transit":
        updateData.confirmedAt = now;
        break;
      case "en_route_pickup":
        updateData.enRoutePickupAt = now;
        break;
      case "at_shipper":
        updateData.atShipperAt = now;
        break;
      case "left_shipper":
        updateData.leftShipperAt = now;
        break;
      case "en_route_receiver":
        updateData.enRouteReceiverAt = now;
        break;
      case "at_receiver":
        updateData.atReceiverAt = now;
        break;
      case "delivered":
        updateData.deliveredAt = now;
        break;
      case "empty":
        updateData.emptyAt = now;
        break;
      case "awaiting_invoicing":
        updateData.awaitingInvoicingAt = now;
        break;
      case "awaiting_payment":
        updateData.awaitingPaymentAt = now;
        break;
      case "completed":
        updateData.completedAt = now;
        break;
      case "paid":
        updateData.paidAt = now;
        break;
    }

    const [updatedLoad] = await db
      .update(loads)
      .set(updateData)
      .where(eq(loads.id, id))
      .returning();

    // Add status history
    await this.addStatusHistory(id, status);

    return updatedLoad;
  }

  async updateLoad(id: string, updates: Partial<Load>): Promise<Load> {
    const [updatedLoad] = await db
      .update(loads)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(loads.id, id))
      .returning();

    return updatedLoad;
  }

  async confirmLoad(id: string, driverId: string): Promise<Load> {
    const [updatedLoad] = await db
      .update(loads)
      .set({ 
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where(and(eq(loads.id, id), eq(loads.driverId, driverId)))
      .returning();

    // Add status history
    await this.addStatusHistory(id, 'in_progress', 'Driver started trip');

    return updatedLoad;
  }

  async updateLoadBOL(id: string, bolNumber: string, tripNumber: string): Promise<Load> {
    const [updatedLoad] = await db
      .update(loads)
      .set({ bolNumber, tripNumber, updatedAt: new Date() })
      .where(eq(loads.id, id))
      .returning();

    // Create BOL record for duplicate tracking
    // Wrap in try-catch to handle duplicates when using override
    try {
      await this.createBOLNumber({
        bolNumber,
        tripNumber,
        loadId: id,
      });
    } catch (error) {
      console.log("⚠️ BOL record creation skipped (duplicate with override):", bolNumber);
      // Continue even if BOL record fails - this supports override scenarios
    }

    return updatedLoad;
  }

  async updateLoadBOLDocument(id: string, bolDocumentPath: string): Promise<Load> {
    const [updatedLoad] = await db
      .update(loads)
      .set({ bolDocumentPath, updatedAt: new Date() })
      .where(eq(loads.id, id))
      .returning();
    
    return updatedLoad;
  }

  async updateLoadPOD(id: string, podDocumentPath: string): Promise<Load> {
    const [updatedLoad] = await db
      .update(loads)
      .set({ podDocumentPath, updatedAt: new Date() })
      .where(eq(loads.id, id))
      .returning();
    
    return updatedLoad;
  }


  async getLoadsByDriver(driverId: string): Promise<LoadWithDetails[]> {
    console.log(`🎯 KEVIN DEBUG: getLoadsByDriver called with "${driverId}"`);
    
    try {
      // First, let's check if there are ANY loads at all
      const allLoads = await db.select().from(loads).limit(5);
      console.log(`🎯 TOTAL LOADS IN DB: ${allLoads.length}`);
      
      // Now try the driver-specific query
      const result = await db
        .select({
          load: loads,
          driver: users,
          location: locations,
          invoice: invoices,
        })
        .from(loads)
        .leftJoin(users, eq(loads.driverId, users.id))
        .leftJoin(locations, eq(loads.locationId, locations.id))
        .leftJoin(invoices, eq(loads.id, invoices.loadId))
        .where(eq(loads.driverId, driverId))
        .orderBy(desc(loads.createdAt));

      console.log(`🎯 KEVIN RESULT: Found ${result.length} loads for driver ${driverId}`);
      
      return result.map(row => ({
        ...row.load,
        driver: row.driver || undefined,
        location: row.location || undefined,
        invoice: row.invoice || undefined,
      }));
    } catch (error) {
      console.error("🎯 ERROR in getLoadsByDriver:", error);
      return [];
    }
  }

  async getLoadsWithTracking(): Promise<LoadWithDetails[]> {
    const result = await db
      .select({
        load: loads,
        driver: users,
        location: locations,
        invoice: invoices,
      })
      .from(loads)
      .leftJoin(users, eq(loads.driverId, users.id))
      .leftJoin(locations, eq(loads.locationId, locations.id))
      .leftJoin(invoices, eq(loads.id, invoices.loadId))
      .where(
        sql`${loads.status} IN ('in_progress', 'delivered')`
      )
      .orderBy(desc(loads.updatedAt));

    return result.map(row => ({
      ...row.load,
      driver: row.driver || undefined,
      location: row.location || undefined,
      invoice: row.invoice || undefined,
    }));
  }

  async deleteLoad(id: string): Promise<void> {
    console.log(`🗑️ DELETING LOAD: Starting deletion process for load ID: ${id}`);
    
    try {
      // Step 0: Get load details to check for file attachments
      console.log(`🗑️ Step 0: Getting load details to check for attachments`);
      const load = await this.getLoad(id);
      if (!load) {
        throw new Error("Load not found");
      }
      
      // Step 0.5: Delete object storage files if they exist
      if (load.podDocumentPath || load.bolDocumentPath) {
        console.log(`🗑️ Step 0.5: Deleting object storage files for load ${id}`);
        try {
          const { ObjectStorageService } = await import('./objectStorage');
          const objectStorage = new ObjectStorageService();
          
          if (load.podDocumentPath) {
            console.log(`🗑️ Deleting POD file: ${load.podDocumentPath}`);
            try {
              const podFile = await objectStorage.getObjectEntityFile(load.podDocumentPath);
              await podFile.delete();
              console.log(`✅ POD file deleted: ${load.podDocumentPath}`);
            } catch (fileErr) {
              console.warn(`⚠️ Could not delete POD file: ${load.podDocumentPath}`, fileErr);
            }
          }
          
          if (load.bolDocumentPath) {
            console.log(`🗑️ Deleting BOL file: ${load.bolDocumentPath}`);
            try {
              const bolFile = await objectStorage.getObjectEntityFile(load.bolDocumentPath);
              await bolFile.delete();
              console.log(`✅ BOL file deleted: ${load.bolDocumentPath}`);
            } catch (fileErr) {
              console.warn(`⚠️ Could not delete BOL file: ${load.bolDocumentPath}`, fileErr);
            }
          }
          
          console.log(`✅ Object storage files deleted successfully`);
        } catch (fileError) {
          console.warn(`⚠️ Warning: Failed to delete some files from object storage:`, fileError);
          // Continue with database deletion even if file deletion fails
        }
      } else {
        console.log(`📄 No file attachments found for load ${id}`);
      }
      
      // CRITICAL FIX: Use database transaction with correct deletion order INCLUDING notification_log
      await db.transaction(async (tx) => {
        console.log(`🗑️ TRANSACTION: Starting database transaction for load ${id}`);
        
        // Delete related records first in strict dependency order
        console.log(`🗑️ Step 1: Deleting notification logs for load ${id}`);
        const notificationResult = await tx.delete(notificationLog).where(eq(notificationLog.loadId, id));
        console.log(`🗑️ Step 1 completed: Deleted ${notificationResult.rowCount || 0} notification log records`);
        
        console.log(`🗑️ Step 2: Deleting load status history for load ${id}`);
        const statusHistoryResult = await tx.delete(loadStatusHistory).where(eq(loadStatusHistory.loadId, id));
        console.log(`🗑️ Step 2 completed: Deleted ${statusHistoryResult.rowCount || 0} status history records`);
        
        console.log(`🗑️ Step 3: Deleting load stops for load ${id}`);
        const stopsResult = await tx.delete(loadStops).where(eq(loadStops.loadId, id));
        console.log(`🗑️ Step 3 completed: Deleted ${stopsResult.rowCount || 0} load stops`);
        
        console.log(`🗑️ Step 4: Deleting invoices for load ${id}`);
        const invoicesResult = await tx.delete(invoices).where(eq(invoices.loadId, id));
        console.log(`🗑️ Step 4 completed: Deleted ${invoicesResult.rowCount || 0} invoices`);
        
        console.log(`🗑️ Step 5: Deleting BOL numbers for load ${id}`);
        const bolResult = await tx.delete(bolNumbers).where(eq(bolNumbers.loadId, id));
        console.log(`🗑️ Step 5 completed: Deleted ${bolResult.rowCount || 0} BOL numbers`);
        
        console.log(`🗑️ Step 6: Deleting the main load record for ${id}`);
        const loadResult = await tx.delete(loads).where(eq(loads.id, id));
        console.log(`🗑️ Step 6 completed: Deleted ${loadResult.rowCount || 0} load record`);
        
        console.log(`🗑️ TRANSACTION: All database operations completed successfully for load ${id}`);
      });
      
      console.log(`✅ SUCCESS: Load ${id} deleted successfully with all attachments cleaned up`);
    } catch (error) {
      console.error(`❌ DELETE ERROR: Failed to delete load ${id}:`, error);
      throw error;
    }
  }

  async checkBOLExists(bolNumber: string): Promise<boolean> {
    const [existing] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bolNumbers)
      .where(eq(bolNumbers.bolNumber, bolNumber));
    
    return existing.count > 0;
  }

  async checkBOLExistsForDifferentLoad(bolNumber: string, excludeLoadId?: string): Promise<boolean> {
    try {
      // Check if BOL number exists in loads table (for BOL photo uploads)
      // Use IS NOT NULL to handle potential null values properly
      const baseCondition = and(
        eq(loads.bolNumber, bolNumber),
        sql`${loads.bolNumber} IS NOT NULL`
      );
      
      // If we're updating a specific load, exclude it from the check
      const whereCondition = excludeLoadId 
        ? and(baseCondition, not(eq(loads.id, excludeLoadId)))
        : baseCondition;
      
      const [existing] = await db
        .select({ count: sql<number>`count(*)` })
        .from(loads)
        .where(whereCondition);
      
      return existing.count > 0;
    } catch (error) {
      console.error("❌ Error in checkBOLExistsForDifferentLoad:", error);
      // If there's an error, be safe and return false (allow the operation)
      return false;
    }
  }

  async createBOLNumber(bol: InsertBolNumber): Promise<BolNumber> {
    const [newBol] = await db.insert(bolNumbers).values(bol).returning();
    return newBol;
  }

  async getRates(): Promise<Rate[]> {
    return await db
      .select()
      .from(rates)
      .where(eq(rates.isActive, true))
      .orderBy(rates.state, rates.city);
  }

  async getRateByLocation(city: string, state: string): Promise<Rate | undefined> {
    // Try exact match first
    let [rate] = await db
      .select()
      .from(rates)
      .where(and(
        eq(rates.city, city),
        eq(rates.state, state),
        eq(rates.isActive, true)
      ));
    
    // If no exact match, try case-insensitive match
    if (!rate) {
      [rate] = await db
        .select()
        .from(rates)
        .where(and(
          sql`LOWER(${rates.city}) = LOWER(${city})`,
          sql`LOWER(${rates.state}) = LOWER(${state})`,
          eq(rates.isActive, true)
        ));
    }
    
    return rate;
  }

  async createRate(rate: InsertRate): Promise<Rate> {
    const [newRate] = await db.insert(rates).values(rate).returning();
    return newRate;
  }

  async updateRate(id: string, rate: Partial<InsertRate>): Promise<Rate | undefined> {
    const [updatedRate] = await db
      .update(rates)
      .set(rate)
      .where(eq(rates.id, id))
      .returning();
    return updatedRate;
  }

  async deleteRate(id: string): Promise<void> {
    await db.delete(rates).where(eq(rates.id, id));
  }

  // Customer operations
  async getCustomers(): Promise<Customer[]> {
    return await db
      .select()
      .from(customers)
      .orderBy(customers.name);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db.insert(customers).values(customer).returning();
    return newCustomer;
  }

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    const [updatedCustomer] = await db
      .update(customers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return updatedCustomer;
  }

  async deleteCustomer(id: string): Promise<void> {
    await db.delete(customers).where(eq(customers.id, id));
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [newInvoice] = await db.insert(invoices).values(invoice).returning();
    return newInvoice;
  }

  async getInvoices(): Promise<Invoice[]> {
    const invoicesWithDetails = await db
      .select()
      .from(invoices)
      .leftJoin(loads, eq(invoices.loadId, loads.id))
      .leftJoin(users, eq(loads.driverId, users.id))
      .leftJoin(locations, eq(loads.locationId, locations.id))
      .orderBy(desc(invoices.generatedAt));

    return invoicesWithDetails.map((row) => ({
      ...row.invoices,
      load: row.loads ? {
        ...row.loads,
        driver: row.users,
        location: row.locations,
      } : undefined,
    }));
  }

  async markInvoicePrinted(invoiceId: string): Promise<Invoice> {
    const [invoice] = await db
      .update(invoices)
      .set({ 
        status: "printed",
        printedAt: new Date()
      })
      .where(eq(invoices.id, invoiceId))
      .returning();
    return invoice;
  }

  async getDashboardStats(): Promise<{
    activeLoads: number;
    inTransit: number;
    deliveredToday: number;
    revenueToday: string;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Active loads (assigned to drivers, not completed)
    const [activeLoadsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(loads)
      .where(and(
        sql`${loads.driverId} IS NOT NULL`,
        sql`${loads.status} NOT IN ('completed', 'delivered')`
      ));

    // In transit loads (actively moving between pickup and delivery)
    const [inTransitResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(loads)
      .where(and(
        sql`${loads.driverId} IS NOT NULL`,
        sql`${loads.status} IN ('in_progress', 'en_route_pickup', 'left_shipper', 'en_route_receiver')`
      ));

    // Delivered today
    const [deliveredTodayResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(loads)
      .where(and(
        eq(loads.status, 'delivered'),
        sql`${loads.deliveredAt} >= ${today}`
      ));

    // Revenue today from completed invoices
    const [revenueTodayResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(total_amount), 0)` })
      .from(invoices)
      .where(sql`generated_at >= ${today}`);

    return {
      activeLoads: activeLoadsResult.count,
      inTransit: inTransitResult.count,
      deliveredToday: deliveredTodayResult.count,
      revenueToday: `$${revenueTodayResult.total}`,
    };
  }

  async getDrivers(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.role, "driver"))
      .orderBy(users.firstName, users.lastName);
  }

  async getAvailableDrivers(): Promise<User[]> {
    // For now, return all drivers. In a real system, you'd check current load assignments
    return this.getDrivers();
  }

  async createDriver(driver: any): Promise<User> {
    const [newDriver] = await db
      .insert(users)
      .values({
        ...driver,
        role: "driver",
        email: driver.email || null,
      })
      .returning();
    return newDriver;
  }

  async deleteDriver(driverId: string): Promise<void> {
    console.log("🗑️ Deleting driver:", driverId);
    
    try {
      // First check if driver has any assigned loads
      const assignedLoads = await db.select().from(loads).where(eq(loads.driverId, driverId));
      
      if (assignedLoads.length > 0) {
        // Unassign the driver from all loads before deletion
        await db.update(loads)
          .set({ driverId: null })
          .where(eq(loads.driverId, driverId));
        console.log(`🗑️ Unassigned driver from ${assignedLoads.length} loads before deletion`);
      }
      
      // Delete the driver
      await db.delete(users).where(eq(users.id, driverId));
      console.log("🗑️ ✅ Driver deleted successfully");
    } catch (error: any) {
      console.error("🗑️ ❌ Error deleting driver:", error);
      throw error;
    }
  }

  async addStatusHistory(loadId: string, status: string, notes?: string): Promise<void> {
    try {
      // Check if load exists first to avoid foreign key constraint error
      const [loadExists] = await db.select({ id: loads.id }).from(loads).where(eq(loads.id, loadId)).limit(1);
      
      if (!loadExists) {
        console.error(`❌ Cannot add status history: Load ${loadId} not found`);
        return; // Skip history if load doesn't exist
      }

      await db.insert(loadStatusHistory).values({
        loadId,
        status,
        notes,
      });
      console.log(`✅ Status history added: Load ${loadId} → ${status}`);
    } catch (error) {
      console.error(`❌ Error adding status history for load ${loadId}:`, error);
      // Don't throw - we don't want status updates to fail just because history fails
    }
  }

  async getInvoice(invoiceNumber: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber));
    return invoice;
  }

  async updateInvoice(invoiceNumber: string, updates: Partial<Invoice>): Promise<Invoice> {
    const [updatedInvoice] = await db
      .update(invoices)
      .set(updates)
      .where(eq(invoices.invoiceNumber, invoiceNumber))
      .returning();
    return updatedInvoice;
  }

  async getNextInvoiceNumber(): Promise<string> {
    // Try to get current counter, create if doesn't exist
    const [counter] = await db.select().from(invoiceCounter).limit(1);
    
    let nextNumber: number;
    if (!counter) {
      // Initialize counter starting at 6000
      const [newCounter] = await db
        .insert(invoiceCounter)
        .values({ currentNumber: 6000 })
        .returning();
      nextNumber = newCounter.currentNumber;
    } else {
      // Increment counter
      nextNumber = counter.currentNumber + 1;
      await db
        .update(invoiceCounter)
        .set({ 
          currentNumber: nextNumber,
          lastUpdated: new Date()
        })
        .where(eq(invoiceCounter.id, counter.id));
    }
    
    return `GO${nextNumber}`;
  }

  // Invoice-POD integration methods
  async attachPODToInvoice(invoiceId: string, podUrl: string, podChecksum: string): Promise<Invoice> {
    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        podUrl,
        podChecksum,
        podAttachedAt: new Date(),
        status: "awaiting_pod" // Update status to indicate POD is attached but not finalized
      })
      .where(eq(invoices.id, invoiceId))
      .returning();
    return updatedInvoice;
  }

  async finalizeInvoice(invoiceId: string): Promise<Invoice> {
    const [finalizedInvoice] = await db
      .update(invoices)
      .set({
        status: "finalized",
        finalizedAt: new Date()
      })
      .where(eq(invoices.id, invoiceId))
      .returning();
    return finalizedInvoice;
  }

  async findOrCreateInvoiceForLoad(loadId: string): Promise<Invoice> {
    // First try to find existing invoice for this load
    const [existingInvoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.loadId, loadId))
      .limit(1);

    if (existingInvoice) {
      return existingInvoice;
    }

    // Get load details to create invoice
    const load = await this.getLoad(loadId);
    if (!load) {
      throw new Error(`Load ${loadId} not found`);
    }

    // Create new invoice for the load
    const invoiceNumber = await this.getNextInvoiceNumber();
    
    const newInvoice: InsertInvoice = {
      loadId,
      customerId: load.customerId || undefined,
      invoiceNumber,
      flatRate: load.flatRate ? parseFloat(load.flatRate.toString()) : 0,
      lumperCharge: load.lumperCharge ? parseFloat(load.lumperCharge.toString()) : 0,
      extraStopsCharge: load.extraStopsCharge ? parseFloat(load.extraStopsCharge.toString()) : 0,
      extraStopsCount: load.extraStopsCount || 0,
      totalAmount: load.totalAmount ? parseFloat(load.totalAmount.toString()) : 0,
      status: "draft"
    };

    return this.createInvoice(newInvoice);
  }

  // Notification preferences methods
  async getNotificationPreferences(driverId: string): Promise<NotificationPreferences | null> {
    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.driverId, driverId))
      .limit(1);
    return prefs || null;
  }

  async createDefaultNotificationPreferences(driverId: string): Promise<NotificationPreferences> {
    const [prefs] = await db
      .insert(notificationPreferences)
      .values({ driverId })
      .returning();
    return prefs;
  }

  async updateNotificationPreferences(
    driverId: string, 
    updates: Partial<InsertNotificationPreferences>
  ): Promise<NotificationPreferences> {
    const [updated] = await db
      .update(notificationPreferences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(notificationPreferences.driverId, driverId))
      .returning();

    if (!updated) {
      // Create if doesn't exist
      return this.createDefaultNotificationPreferences(driverId);
    }
    return updated;
  }

  async logNotification(notification: InsertNotificationLog): Promise<NotificationLog> {
    const [logged] = await db
      .insert(notificationLog)
      .values(notification)
      .returning();
    return logged;
  }

  async getNotificationHistory(driverId: string, limit = 50): Promise<NotificationLog[]> {
    return db
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.driverId, driverId))
      .orderBy(desc(notificationLog.sentAt))
      .limit(limit);
  }

  // Chat message operations
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [created] = await db
      .insert(chatMessages)
      .values(message)
      .returning();
    return created;
  }

  async getChatMessages(sessionId: string, limit = 50): Promise<ChatMessage[]> {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.timestamp)
      .limit(limit);
  }

  async deleteChatSession(sessionId: string): Promise<void> {
    await db
      .delete(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId));
  }
}

export const storage = new DatabaseStorage();
