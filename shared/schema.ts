import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("office"), // "office" or "driver"
  phoneNumber: varchar("phone_number"),
  username: varchar("username").unique(), // For driver login
  password: varchar("password"), // For driver login (phone number)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // DEPRECATED: Legacy truck_number column - DO NOT USE in new code
  truckNumber: varchar("truck_number"), // Temporarily kept to avoid data loss
});

// Locations table for receivers
export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  address: text("address"), // Optional - for future geo-fencing
  city: varchar("city"), // Optional - for future geo-fencing
  state: varchar("state"), // Optional - for future geo-fencing
  contactName: varchar("contact_name"),
  contactPhone: varchar("contact_phone"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Loads table
export const loads = pgTable("loads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  number109: varchar("number_109").notNull().unique(),
  driverId: varchar("driver_id").references(() => users.id),
  locationId: varchar("location_id").references(() => locations.id),
  pickupLocationId: varchar("pickup_location_id").references(() => locations.id),
  estimatedMiles: integer("estimated_miles"),
  specialInstructions: text("special_instructions"),
  status: varchar("status").notNull().default("pending"), // pending, assigned, in_transit, awaiting_invoicing, awaiting_payment, paid
  bolNumber: varchar("bol_number"),
  tripNumber: varchar("trip_number"),
  bolDocumentPath: varchar("bol_document_path"),
  podDocumentPath: varchar("pod_document_path"),
  signatureURL: varchar("signature_url"),
  signedAt: timestamp("signed_at"),
  extraStops: decimal("extra_stops", { precision: 10, scale: 2 }).default("0.00"), // Extra stops charge amount
  lumperCharge: decimal("lumper_charge", { precision: 10, scale: 2 }).default("0.00"), // Lumper charge amount
  tripRate: decimal("trip_rate", { precision: 10, scale: 2 }).default("0.00"), // Manual trip rate override
  flatRate: decimal("flat_rate", { precision: 10, scale: 2 }).default("0.00"), // Flat rate for this specific load
  // OCR-extracted fields from Rate Con
  poNumber: varchar("po_number"),
  appointmentTime: varchar("appointment_time"),
  pickupAddress: text("pickup_address"),
  deliveryAddress: text("delivery_address"),
  companyName: varchar("company_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Basic timestamps for manual status tracking
  deliveredAt: timestamp("delivered_at"),
  completedAt: timestamp("completed_at"),
  paidAt: timestamp("paid_at"),
  // Payment tracking fields
  paymentMethod: varchar("payment_method"), // "check", "wire", "ach", "cash", etc.
  paymentReference: varchar("payment_reference"), // Check number, wire confirmation, etc.
  paymentNotes: text("payment_notes"), // Additional payment details
  // Archive fields for paid load management
  isArchived: boolean("is_archived").default(false),
  archivedAt: timestamp("archived_at"),
  // Driver confirmation tracking
  driverConfirmed: boolean("driver_confirmed").default(false),
  driverConfirmedAt: timestamp("driver_confirmed_at"),
  // GPS tracking fields
  trackingEnabled: boolean("tracking_enabled").default(false),
  currentLatitude: decimal("current_latitude", { precision: 10, scale: 8 }),
  currentLongitude: decimal("current_longitude", { precision: 11, scale: 8 }),
  shipperLatitude: decimal("shipper_latitude", { precision: 10, scale: 8 }),
  shipperLongitude: decimal("shipper_longitude", { precision: 11, scale: 8 }),
  receiverLatitude: decimal("receiver_latitude", { precision: 10, scale: 8 }),
  receiverLongitude: decimal("receiver_longitude", { precision: 11, scale: 8 }),
  lastLocationUpdate: timestamp("last_location_update"),
  // Geofence entry/exit timestamps for automatic tracking
  shipperEnteredAt: timestamp("shipper_entered_at"), // When driver entered shipper geofence
  shipperExitedAt: timestamp("shipper_exited_at"), // When driver left shipper geofence
  receiverEnteredAt: timestamp("receiver_entered_at"), // When driver entered receiver geofence
  receiverExitedAt: timestamp("receiver_exited_at"), // When driver left receiver geofence
  trackingStartedAt: timestamp("tracking_started_at"), // When driver accepted load and started tracking
  // Route calculation and mileage fields
  calculatedMiles: decimal("calculated_miles", { precision: 10, scale: 2 }), // Calculated route distance
  routeData: jsonb("route_data"), // Store full route details from API
  lastRouteCalculated: timestamp("last_route_calculated"), // When route was last calculated
  // DEPRECATED: Legacy truck_number column - DO NOT USE in new code
  truckNumber: varchar("truck_number"), // Temporarily kept to avoid data loss
});

// Load stops table for multiple pickups and deliveries
export const loadStops = pgTable("load_stops", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loadId: varchar("load_id").references(() => loads.id).notNull(),
  stopType: varchar("stop_type").notNull(), // "pickup" or "dropoff"
  stopSequence: integer("stop_sequence").notNull(), // Order of the stop (1, 2, 3, etc.)
  locationId: varchar("location_id").references(() => locations.id), // Reference to existing location
  companyName: varchar("company_name"), // Company name for this stop
  address: text("address"),
  contactName: varchar("contact_name"),
  contactPhone: varchar("contact_phone"),
  notes: text("notes"), // Special instructions for this stop
  createdAt: timestamp("created_at").defaultNow(),
});

// BOL tracking table for duplicate prevention
export const bolNumbers = pgTable("bol_numbers", {
  id: serial("id").primaryKey(),
  bolNumber: varchar("bol_number").notNull().unique(),
  tripNumber: varchar("trip_number").notNull(),
  loadId: varchar("load_id").references(() => loads.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Rates table for invoice calculation (based on city/state)
export const rates = pgTable("rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  city: varchar("city").notNull(),
  state: varchar("state").notNull(),
  flatRate: decimal("flat_rate", { precision: 10, scale: 2 }).notNull(), // Fixed rate for city/state
  lumperCharge: decimal("lumper_charge", { precision: 10, scale: 2 }).default("0.00"),
  extraStopCharge: decimal("extra_stop_charge", { precision: 10, scale: 2 }).default("50.00"), // $50 per extra stop
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customers table for brokers and direct haul clients
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  email: varchar("email"),
  contactName: varchar("contact_name"),
  contactPhone: varchar("contact_phone"),
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  contactPerson: varchar("contact_person"),
  phone: varchar("phone"),
});

// Invoice counter for sequential numbering
export const invoiceCounter = pgTable("invoice_counter", {
  id: serial("id").primaryKey(),
  currentNumber: integer("current_number").notNull().default(6000),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Invoices table
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loadId: varchar("load_id").references(() => loads.id),
  customerId: varchar("customer_id").references(() => customers.id),
  invoiceNumber: varchar("invoice_number").notNull().unique(),
  flatRate: decimal("flat_rate", { precision: 10, scale: 2 }),
  lumperCharge: decimal("lumper_charge", { precision: 10, scale: 2 }).default("0.00"),
  extraStopsCharge: decimal("extra_stops_charge", { precision: 10, scale: 2 }).default("0.00"), // $50 * number of extra stops
  extraStopsCount: integer("extra_stops_count").default(0),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  status: varchar("status").default("draft"), // draft, awaiting_pod, finalized, printed, emailed
  podUrl: varchar("pod_url"), // POD document path attached to this invoice
  podChecksum: varchar("pod_checksum"), // SHA256 checksum for data integrity
  podAttachedAt: timestamp("pod_attached_at"), // When POD was attached to invoice
  podSnapshot: jsonb("pod_snapshot").$type<Array<{
    contentBase64: string;
    contentType: string;
    size: number;
    sourcePath: string;
    attachedAt: string;
  }>>(), // POD content stored as base64 array for multi-POD support
  finalizedAt: timestamp("finalized_at"), // When invoice was finalized with POD
  generatedAt: timestamp("generated_at").defaultNow(),
  printedAt: timestamp("printed_at"),
});

// Load status history for tracking
export const loadStatusHistory = pgTable("load_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loadId: varchar("load_id").references(() => loads.id),
  status: varchar("status").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  notes: text("notes"),
});

// Driver notification preferences
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").references(() => users.id).notNull(),
  
  // Alert types preferences
  loadAssignments: boolean("load_assignments").default(true), // New load assigned
  statusReminders: boolean("status_reminders").default(true), // Reminder to update status
  documentReminders: boolean("document_reminders").default(true), // Upload BOL/POD reminders
  deliveryAlerts: boolean("delivery_alerts").default(true), // Delivery deadline approaching
  emergencyAlerts: boolean("emergency_alerts").default(true), // Urgent dispatcher messages
  
  // Delivery method preferences
  smsEnabled: boolean("sms_enabled").default(true),
  emailEnabled: boolean("email_enabled").default(false),
  inAppEnabled: boolean("in_app_enabled").default(true),
  
  // Timing preferences
  quietHoursStart: varchar("quiet_hours_start").default("22:00"), // 10 PM
  quietHoursEnd: varchar("quiet_hours_end").default("06:00"), // 6 AM
  enableQuietHours: boolean("enable_quiet_hours").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notification log for tracking sent messages
export const notificationLog = pgTable("notification_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").references(() => users.id).notNull(),
  type: varchar("type").notNull(), // "load_assignment", "status_reminder", etc.
  method: varchar("method").notNull(), // "sms", "email", "in_app"
  message: text("message").notNull(),
  status: varchar("status").notNull().default("sent"), // "sent", "delivered", "failed"
  loadId: varchar("load_id").references(() => loads.id), // Optional: related load
  sentAt: timestamp("sent_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  errorMessage: text("error_message"),
});

// AI Chat Messages table
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // Optional: link to user if authenticated
  sessionId: varchar("session_id").notNull(), // For grouping conversation
  role: varchar("role").notNull(), // "user" or "assistant" 
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Trucks table for fleet management
export const trucks = pgTable("trucks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  truckNumber: varchar("truck_number").notNull().unique(),
  make: varchar("make").notNull(),
  model: varchar("model").notNull(),
  year: integer("year").notNull(),
  vinNumber: varchar("vin_number").notNull().unique(),
  mileage: integer("mileage").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
  role: true,
  phoneNumber: true,
  username: true,
  password: true,
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true,
});

export const insertLoadSchema = createInsertSchema(loads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deliveredAt: true,
  completedAt: true,
});

export const insertLoadStopSchema = createInsertSchema(loadStops).omit({
  id: true,
  createdAt: true,
});

export const insertBolNumberSchema = createInsertSchema(bolNumbers).omit({
  id: true,
  createdAt: true,
});

export const insertRateSchema = createInsertSchema(rates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  generatedAt: true,
});

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationLogSchema = createInsertSchema(notificationLog).omit({
  id: true,
  sentAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  timestamp: true,
});

export const insertTruckSchema = createInsertSchema(trucks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLoad = z.infer<typeof insertLoadSchema>;
export type Load = typeof loads.$inferSelect;
export type InsertLoadStop = z.infer<typeof insertLoadStopSchema>;
export type LoadStop = typeof loadStops.$inferSelect;
export type InsertBolNumber = z.infer<typeof insertBolNumberSchema>;
export type BolNumber = typeof bolNumbers.$inferSelect;
export type InsertRate = z.infer<typeof insertRateSchema>;
export type Rate = typeof rates.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type LoadStatusHistoryEntry = typeof loadStatusHistory.$inferSelect;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
export type NotificationLog = typeof notificationLog.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertTruck = z.infer<typeof insertTruckSchema>;
export type Truck = typeof trucks.$inferSelect;

// Extended types with relations
export type LoadWithDetails = Load & {
  driver?: User;
  location?: Location;
  pickupLocation?: Location;
  invoice?: Invoice;
};
