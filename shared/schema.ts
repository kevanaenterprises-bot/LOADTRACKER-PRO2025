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
});

// Locations table for receivers
export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  address: text("address"), // Optional
  city: varchar("city").notNull(),
  state: varchar("state").notNull(),
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
  estimatedMiles: integer("estimated_miles"),
  specialInstructions: text("special_instructions"),
  status: varchar("status").notNull().default("created"), // created, in_progress, delivered, completed
  bolNumber: varchar("bol_number"),
  tripNumber: varchar("trip_number"),
  bolDocumentPath: varchar("bol_document_path"),
  podDocumentPath: varchar("pod_document_path"),
  extraStops: integer("extra_stops").default(0), // Number of extra stops
  lumperCharge: decimal("lumper_charge", { precision: 10, scale: 2 }).default("0.00"), // Lumper charge amount
  // OCR-extracted fields from Wright Con
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
  invoiceNumber: varchar("invoice_number").notNull().unique(),
  flatRate: decimal("flat_rate", { precision: 10, scale: 2 }),
  lumperCharge: decimal("lumper_charge", { precision: 10, scale: 2 }).default("0.00"),
  extraStopsCharge: decimal("extra_stops_charge", { precision: 10, scale: 2 }).default("0.00"), // $50 * number of extra stops
  extraStopsCount: integer("extra_stops_count").default(0),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  status: varchar("status").default("pending"), // pending, printed
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

export const insertBolNumberSchema = createInsertSchema(bolNumbers).omit({
  id: true,
  createdAt: true,
});

export const insertRateSchema = createInsertSchema(rates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  generatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLoad = z.infer<typeof insertLoadSchema>;
export type Load = typeof loads.$inferSelect;
export type InsertBolNumber = z.infer<typeof insertBolNumberSchema>;
export type BolNumber = typeof bolNumbers.$inferSelect;
export type InsertRate = z.infer<typeof insertRateSchema>;
export type Rate = typeof rates.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type LoadStatusHistoryEntry = typeof loadStatusHistory.$inferSelect;

// Extended types with relations
export type LoadWithDetails = Load & {
  driver?: User;
  location?: Location;
  invoice?: Invoice;
};
