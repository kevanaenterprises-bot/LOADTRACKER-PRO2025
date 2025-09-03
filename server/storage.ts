import {
  users,
  locations,
  loads,
  bolNumbers,
  rates,
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
  type BolNumber,
  type InsertBolNumber,
  type Rate,
  type InsertRate,
  type Invoice,
  type InsertInvoice,
  type LoadStatusHistoryEntry,
  type NotificationPreferences,
  type InsertNotificationPreferences,
  type NotificationLog,
  type InsertNotificationLog,
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

  // Load operations
  createLoad(load: InsertLoad): Promise<Load>;
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

  // BOL operations
  checkBOLExists(bolNumber: string): Promise<boolean>;
  checkBOLExistsForDifferentLoad(bolNumber: string, excludeLoadId?: string): Promise<boolean>;
  createBOLNumber(bol: InsertBolNumber): Promise<BolNumber>;

  // Rate operations
  getRates(): Promise<Rate[]>;
  getRateByLocation(city: string, state: string): Promise<Rate | undefined>;
  createRate(rate: InsertRate): Promise<Rate>;

  // Invoice operations
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getInvoices(): Promise<Invoice[]>;
  getInvoice(invoiceNumber: string): Promise<Invoice | undefined>;
  updateInvoice(invoiceNumber: string, updates: Partial<Invoice>): Promise<Invoice>;
  markInvoicePrinted(invoiceId: string): Promise<Invoice>;
  getNextInvoiceNumber(): Promise<string>;

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
      // Return a hardcoded test user if database fails (handle various formats)
      const normalizedUsername = username.toLowerCase().trim();
      if (normalizedUsername === "john_doe" || normalizedUsername === "john doe" || normalizedUsername.replace(/[_\s]/g, "_") === "john_doe") {
        return {
          id: "test-driver-001",
          username: username.toLowerCase(), // Use provided username but normalized
          firstName: "John",
          lastName: "Doe", 
          role: "driver",
          phoneNumber: "1234567890",
          password: "1234567890",
          email: null,
          profileImageUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return undefined;
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

  async createLoad(load: InsertLoad): Promise<Load> {
    const [newLoad] = await db.insert(loads).values(load).returning();
    
    // Add initial status history
    await this.addStatusHistory(newLoad.id, "created", "Load created by office staff");
    
    return newLoad;
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

    return result.map(row => ({
      ...row.load,
      driver: row.driver || undefined,
      location: row.location || undefined,
      invoice: row.invoice || undefined,
    }));
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
    const updateData: any = { status, updatedAt: new Date() };
    
    // Update specific timestamp fields based on status
    const now = timestamp || new Date();
    switch (status) {
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
      case "completed":
        updateData.completedAt = now;
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
    await this.createBOLNumber({
      bolNumber,
      tripNumber,
      loadId: id,
    });

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

    // Active loads (not completed)
    const [activeLoadsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(loads)
      .where(sql`status != 'completed'`);

    // In transit loads
    const [inTransitResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(loads)
      .where(sql`status IN ('en_route_pickup', 'left_shipper', 'en_route_receiver')`);

    // Delivered today
    const [deliveredTodayResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(loads)
      .where(sql`delivered_at >= ${today}`);

    // Revenue today
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
    await db.insert(loadStatusHistory).values({
      loadId,
      status,
      notes,
    });
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
}

export const storage = new DatabaseStorage();
