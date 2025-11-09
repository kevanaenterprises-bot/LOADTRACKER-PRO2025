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
  // Driver record management fields
  bankAccountNumber: varchar("bank_account_number"),
  bankRoutingNumber: varchar("bank_routing_number"),
  bankName: varchar("bank_name"),
  hireDate: timestamp("hire_date"),
  fireDate: timestamp("fire_date"),
  medicalCardExpiration: timestamp("medical_card_expiration"),
  driverLicenseExpiration: timestamp("driver_license_expiration"),
  // DEPRECATED: Legacy truck_number column - DO NOT USE in new code
  truckNumber: varchar("truck_number"), // Temporarily kept to avoid data loss
  // Historical marker audio tour preferences
  roadTourEnabled: boolean("road_tour_enabled").default(false), // Toggle for historical marker audio tours
  roadTourLastHeardMarkerId: varchar("road_tour_last_heard_marker_id"), // Last marker played to prevent repeats
  // Company driver designation for IFTA and fuel tracking
  isCompanyDriver: boolean("is_company_driver").default(false), // Company drivers = IFTA tracked + fuel receipts
  // Driver pay structure fields
  payType: varchar("pay_type").default("percentage"), // "percentage" or "mileage"
  percentageRate: decimal("percentage_rate", { precision: 5, scale: 2 }), // e.g., 70.00 for 70%
  mileageRate: decimal("mileage_rate", { precision: 6, scale: 2 }), // e.g., 1.50 for $1.50/mile
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
  customerId: varchar("customer_id").references(() => customers.id),
  driverId: varchar("driver_id").references(() => users.id),
  locationId: varchar("location_id").references(() => locations.id),
  pickupLocationId: varchar("pickup_location_id").references(() => locations.id),
  estimatedMiles: decimal("estimated_miles", { precision: 8, scale: 2 }),
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
  deliveryDueAt: timestamp("delivery_due_at"), // When the load is due for delivery
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
  // Automatic timestamp tracking for geofence entry/exit
  shipperInTime: timestamp("shipper_in_time"),
  shipperOutTime: timestamp("shipper_out_time"),
  receiverInTime: timestamp("receiver_in_time"),
  receiverOutTime: timestamp("receiver_out_time"),
  // HERE Tracking API geofence IDs for automatic arrival/departure detection
  shipperGeofenceId: varchar("shipper_geofence_id"), // HERE Tracking geofence ID for shipper location
  receiverGeofenceId: varchar("receiver_geofence_id"), // HERE Tracking geofence ID for receiver location
  hereTrackingDeviceId: varchar("here_tracking_device_id"), // HERE Tracking device ID (truck identifier)
  // IFTA reporting fields
  iftaTruckNumber: varchar("ifta_truck_number"), // Truck # for this trip (mandatory at POD upload)
  startingOdometerReading: decimal("starting_odometer_reading", { precision: 10, scale: 1 }), // Odometer when leaving yard/starting load
  odometerReading: decimal("odometer_reading", { precision: 10, scale: 1 }), // Current odometer at delivery (mandatory at POD upload)
  previousOdometerReading: decimal("previous_odometer_reading", { precision: 10, scale: 1 }), // Previous odometer (auto-filled from last load)
  milesThisTrip: decimal("miles_this_trip", { precision: 8, scale: 1 }), // Calculated: current - previous odometer
  milesByState: jsonb("miles_by_state").$type<Record<string, number>>(), // State-by-state mileage from HERE Maps (route miles only)
  deadheadMiles: decimal("deadhead_miles", { precision: 8, scale: 1 }), // Deadhead miles: (ending - starting) - route miles
  deadheadMilesByState: jsonb("deadhead_miles_by_state").$type<Record<string, number>>(), // Deadhead miles assigned to pickup state
  fuelGallons: decimal("fuel_gallons", { precision: 8, scale: 2 }), // Fuel purchased on trip (optional)
  fuelAmount: decimal("fuel_amount", { precision: 10, scale: 2 }), // Dollar amount of fuel (optional)
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
  // Geofencing fields
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  geofenceRadiusMeters: integer("geofence_radius_meters").default(200), // 200m default radius
  arrivedAt: timestamp("arrived_at"),
  departedAt: timestamp("departed_at"),
  arrivalSource: varchar("arrival_source"), // "auto" or "manual"
  departureSource: varchar("departure_source"), // "auto" or "manual"
  createdAt: timestamp("created_at").defaultNow(),
});

// GPS tracking pings table for location history
export const trackingPings = pgTable("tracking_pings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loadId: varchar("load_id").references(() => loads.id).notNull(),
  driverId: varchar("driver_id").references(() => users.id).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  speed: decimal("speed", { precision: 6, scale: 2 }), // mph
  heading: decimal("heading", { precision: 5, scale: 1 }), // degrees 0-360
  accuracy: decimal("accuracy", { precision: 6, scale: 2 }), // meters
  battery: integer("battery"), // percentage 0-100
  capturedAt: timestamp("captured_at").defaultNow(),
}, (table) => [
  index("IDX_tracking_load_captured").on(table.loadId, table.capturedAt.desc()),
  index("IDX_tracking_driver_captured").on(table.driverId, table.capturedAt.desc()),
]);

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
  // Driver pay tracking fields
  driverId: varchar("driver_id").references(() => users.id), // Driver assigned to this load
  driverPayType: varchar("driver_pay_type"), // "percentage" or "mileage" (snapshot at invoice time)
  driverPayRate: decimal("driver_pay_rate", { precision: 6, scale: 2 }), // Rate used (% or $/mile)
  driverPayAmount: decimal("driver_pay_amount", { precision: 10, scale: 2 }), // Calculated driver pay
  tripMiles: decimal("trip_miles", { precision: 8, scale: 2 }), // Miles for mileage-based pay
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
  currentOdometer: integer("current_odometer").default(0), // Current odometer reading for service tracking
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Truck service records table for maintenance tracking
export const truckServiceRecords = pgTable("truck_service_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  truckId: varchar("truck_id").references(() => trucks.id).notNull(),
  serviceDate: timestamp("service_date").notNull(),
  serviceType: varchar("service_type").notNull(), // "oil_change", "tire_rotation", "inspection", "repair", etc.
  odometerAtService: integer("odometer_at_service").notNull(),
  nextServiceOdometer: integer("next_service_odometer"), // When next service is due (odometer)
  serviceDescription: text("service_description"), // Detailed description of work done
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_service_truck_date").on(table.truckId, table.serviceDate.desc()),
]);

// Fuel receipts table for company driver fuel tracking
export const fuelReceipts = pgTable("fuel_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loadId: varchar("load_id").references(() => loads.id).notNull(),
  driverId: varchar("driver_id").references(() => users.id).notNull(),
  gallons: decimal("gallons", { precision: 8, scale: 2 }).notNull(), // Fuel gallons purchased
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull(), // Total cost of fuel
  receiptDate: timestamp("receipt_date").defaultNow(),
  location: varchar("location"), // Optional: where fuel was purchased
  notes: text("notes"), // Optional: receipt notes
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_fuel_load_date").on(table.loadId, table.receiptDate.desc()),
  index("IDX_fuel_driver_date").on(table.driverId, table.receiptDate.desc()),
]);

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
}).extend({
  deliveryDueAt: z.string().datetime().transform(val => new Date(val)).optional().or(z.date().optional()),
});

export const insertLoadStopSchema = createInsertSchema(loadStops).omit({
  id: true,
  createdAt: true,
});

export const insertTrackingPingSchema = createInsertSchema(trackingPings).omit({
  id: true,
  capturedAt: true,
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

export const insertTruckServiceRecordSchema = createInsertSchema(truckServiceRecords).omit({
  id: true,
  createdAt: true,
}).extend({
  serviceDate: z.string().datetime().transform(val => new Date(val)).or(z.date()),
});

export const insertFuelReceiptSchema = createInsertSchema(fuelReceipts).omit({
  id: true,
  createdAt: true,
}).extend({
  receiptDate: z.string().datetime().transform(val => new Date(val)).optional().or(z.date().optional()),
});

// Historical Markers table for GPS-triggered audio tours
export const historicalMarkers = pgTable("historical_markers", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  inscription: text("inscription").notNull(), // Full text to be read aloud
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  state: varchar("state", { length: 2 }), // Two-letter state code
  city: varchar("city"),
  category: varchar("category"), // war memorial, historic site, etc.
  source: varchar("source").default("HMDB"), // HMDB, state marker program, etc.
  sourceId: varchar("source_id"), // External ID from source database
  createdAt: timestamp("created_at").defaultNow(),
});

// Driver historical marker history - tracks which markers a driver has heard
export const markerHistory = pgTable("marker_history", {
  id: serial("id").primaryKey(),
  driverId: varchar("driver_id").references(() => users.id).notNull(),
  markerId: integer("marker_id").references(() => historicalMarkers.id).notNull(),
  loadId: varchar("load_id").references(() => loads.id), // Optional - which load they were on
  heardAt: timestamp("heard_at").defaultNow().notNull(),
});

export const insertHistoricalMarkerSchema = createInsertSchema(historicalMarkers).omit({
  id: true,
  createdAt: true,
});

export const insertMarkerHistorySchema = createInsertSchema(markerHistory).omit({
  id: true,
  heardAt: true,
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
export type InsertTrackingPing = z.infer<typeof insertTrackingPingSchema>;
export type TrackingPing = typeof trackingPings.$inferSelect;
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
export type InsertTruckServiceRecord = z.infer<typeof insertTruckServiceRecordSchema>;
export type TruckServiceRecord = typeof truckServiceRecords.$inferSelect;
export type InsertFuelReceipt = z.infer<typeof insertFuelReceiptSchema>;
export type FuelReceipt = typeof fuelReceipts.$inferSelect;
export type InsertHistoricalMarker = z.infer<typeof insertHistoricalMarkerSchema>;
export type HistoricalMarker = typeof historicalMarkers.$inferSelect;
export type InsertMarkerHistory = z.infer<typeof insertMarkerHistorySchema>;
export type MarkerHistory = typeof markerHistory.$inferSelect;

// Pricing tiers table
export const pricingTiers = pgTable("pricing_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "Starter", "Professional", "Enterprise"
  displayName: varchar("display_name").notNull(),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull(),
  maxTrucks: integer("max_trucks"), // null = unlimited
  includedHereMapsTransactions: integer("included_here_maps_transactions").default(0),
  includedDocumentAiScans: integer("included_document_ai_scans").default(0),
  includedSmsMessages: integer("included_sms_messages").default(0),
  includedEmails: integer("included_emails").default(0),
  includedStorageGB: integer("included_storage_gb").default(5),
  includedElevenlabsCharacters: integer("included_elevenlabs_characters").default(0),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0), // For display ordering
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customer subscriptions table
export const customerSubscriptions = pgTable("customer_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  tierId: varchar("tier_id").references(() => pricingTiers.id).notNull(),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  status: varchar("status").notNull().default("active"), // "active", "canceled", "past_due", "trial"
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  trialEndsAt: timestamp("trial_ends_at"),
  canceledAt: timestamp("canceled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// API usage logs table for tracking all API calls
export const apiUsageLogs = pgTable("api_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  subscriptionId: varchar("subscription_id").references(() => customerSubscriptions.id),
  apiService: varchar("api_service").notNull(), // "here_maps", "document_ai", "sms", "email", "elevenlabs", "storage"
  apiEndpoint: varchar("api_endpoint"), // Specific endpoint called
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"), // For storage GB, characters, etc.
  costCents: decimal("cost_cents", { precision: 12, scale: 4 }), // Cost in cents with sub-cent precision (e.g., 0.0075)
  requestMetadata: jsonb("request_metadata").$type<Record<string, any>>(), // Additional details
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_usage_user_created").on(table.userId, table.createdAt.desc()),
  index("IDX_usage_subscription_service").on(table.subscriptionId, table.apiService, table.createdAt.desc()),
]);

// Demo sessions table for trial accounts
export const demoSessions = pgTable("demo_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  fullName: varchar("full_name"),
  companyName: varchar("company_name"),
  phoneNumber: varchar("phone_number"),
  demoUserId: varchar("demo_user_id").references(() => users.id), // Temporary demo account
  sessionToken: varchar("session_token").notNull().unique(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(), // Auto-expire after 24 hours
  completedAt: timestamp("completed_at"), // When they finished the demo
  convertedToCustomer: boolean("converted_to_customer").default(false),
  convertedAt: timestamp("converted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_demo_expires").on(table.expiresAt),
  index("IDX_demo_created").on(table.createdAt.desc()),
]);

// Visitor tracking table for analytics
export const visitorTracking = pgTable("visitor_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(), // Anonymous session ID
  pageUrl: varchar("page_url").notNull(),
  referrer: varchar("referrer"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  deviceType: varchar("device_type"), // "mobile", "tablet", "desktop"
  browserName: varchar("browser_name"),
  country: varchar("country"),
  demoSessionId: varchar("demo_session_id").references(() => demoSessions.id), // Link to demo if converted
  visitedAt: timestamp("visited_at").defaultNow(),
}, (table) => [
  index("IDX_visitor_session").on(table.sessionId, table.visitedAt.desc()),
  index("IDX_visitor_visited").on(table.visitedAt.desc()),
]);

// AI Testing System - tracks automated test runs and results
export const testRuns = pgTable("test_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  triggerType: varchar("trigger_type").notNull(), // "scheduled" or "manual"
  triggeredBy: varchar("triggered_by"), // User ID if manual trigger
  status: varchar("status").notNull().default("running"), // "running", "completed", "failed"
  totalTests: integer("total_tests").default(0),
  passedTests: integer("passed_tests").default(0),
  failedTests: integer("failed_tests").default(0),
  duration: integer("duration"), // Duration in milliseconds
  aiAnalysis: text("ai_analysis"), // AI-generated summary of issues found
  aiRecommendations: jsonb("ai_recommendations").$type<string[]>(), // AI-suggested fixes
  alertsSent: boolean("alerts_sent").default(false), // Whether failure alerts were sent
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("IDX_test_runs_started").on(table.startedAt.desc()),
  index("IDX_test_runs_status").on(table.status),
]);

export const testResults = pgTable("test_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testRunId: varchar("test_run_id").references(() => testRuns.id).notNull(),
  testCategory: varchar("test_category").notNull(), // "load_workflow", "maps", "ifta", "gps", etc.
  testName: varchar("test_name").notNull(), // Specific test name
  status: varchar("status").notNull(), // "passed", "failed", "skipped"
  duration: integer("duration"), // Duration in milliseconds
  errorMessage: text("error_message"), // Error details if failed
  stackTrace: text("stack_trace"), // Full stack trace if failed
  metadata: jsonb("metadata").$type<Record<string, any>>(), // Additional test data
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_test_results_run").on(table.testRunId),
  index("IDX_test_results_status").on(table.status),
]);

// LoadRight integration - tracks tendered loads from LoadRight carrier portal
export const loadRightTenders = pgTable("loadright_tenders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loadNumber: varchar("load_number").notNull().unique(), // LoadRight load number (e.g., "109-40340")
  externalTenderId: varchar("external_tender_id"), // LoadRight's internal tender ID (if provided via API)
  shipper: varchar("shipper"), // Shipper company name (e.g., "PCA PLANO")
  pickupLocation: text("pickup_location"),
  pickupCity: varchar("pickup_city"),
  pickupState: varchar("pickup_state"),
  pickupDate: varchar("pickup_date"), // Store as string from LoadRight
  pickupTime: varchar("pickup_time"),
  deliveryLocation: text("delivery_location"),
  deliveryCity: varchar("delivery_city"),
  deliveryState: varchar("delivery_state"),
  deliveryDate: varchar("delivery_date"),
  deliveryTime: varchar("delivery_time"),
  orderNumber: varchar("order_number"),
  pieces: varchar("pieces"),
  miles: varchar("miles"),
  weight: varchar("weight"),
  rate: varchar("rate"), // Rate if shown in portal
  notes: text("notes"), // Special instructions from LoadRight
  status: varchar("status").notNull().default("tendered"), // tendered, accepted, dispatched, rejected
  loadId: varchar("load_id").references(() => loads.id), // Link to created load if accepted
  acceptedAt: timestamp("accepted_at"), // When tender was accepted
  rejectedAt: timestamp("rejected_at"), // When tender was rejected
  syncedAt: timestamp("synced_at").defaultNow(), // When this tender was pulled from LoadRight
  responseMethod: varchar("response_method"), // "api" or "manual" - how the response was sent
  responseSentAt: timestamp("response_sent_at"), // When we sent accept/reject to LoadRight API
  responseError: text("response_error"), // Any error from LoadRight API
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_loadright_status").on(table.status),
  index("IDX_loadright_synced").on(table.syncedAt.desc()),
]);

// Insert schemas for new tables
export const insertPricingTierSchema = createInsertSchema(pricingTiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerSubscriptionSchema = createInsertSchema(customerSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertApiUsageLogSchema = createInsertSchema(apiUsageLogs).omit({
  id: true,
  createdAt: true,
});

export const insertDemoSessionSchema = createInsertSchema(demoSessions).omit({
  id: true,
  createdAt: true,
});

export const insertVisitorTrackingSchema = createInsertSchema(visitorTracking).omit({
  id: true,
  visitedAt: true,
});

export const insertLoadRightTenderSchema = createInsertSchema(loadRightTenders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  syncedAt: true,
});

export const insertTestRunSchema = createInsertSchema(testRuns).omit({
  id: true,
  startedAt: true,
});

export const insertTestResultSchema = createInsertSchema(testResults).omit({
  id: true,
  createdAt: true,
});

// New types
export type InsertPricingTier = z.infer<typeof insertPricingTierSchema>;
export type PricingTier = typeof pricingTiers.$inferSelect;
export type InsertCustomerSubscription = z.infer<typeof insertCustomerSubscriptionSchema>;
export type CustomerSubscription = typeof customerSubscriptions.$inferSelect;
export type InsertApiUsageLog = z.infer<typeof insertApiUsageLogSchema>;
export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type InsertDemoSession = z.infer<typeof insertDemoSessionSchema>;
export type DemoSession = typeof demoSessions.$inferSelect;
export type InsertVisitorTracking = z.infer<typeof insertVisitorTrackingSchema>;
export type VisitorTracking = typeof visitorTracking.$inferSelect;
export type InsertLoadRightTender = z.infer<typeof insertLoadRightTenderSchema>;
export type LoadRightTender = typeof loadRightTenders.$inferSelect;
export type InsertTestRun = z.infer<typeof insertTestRunSchema>;
export type TestRun = typeof testRuns.$inferSelect;
export type InsertTestResult = z.infer<typeof insertTestResultSchema>;
export type TestResult = typeof testResults.$inferSelect;

// Extended types with relations
export type LoadWithDetails = Load & {
  driver?: User;
  location?: Location;
  pickupLocation?: Location;
  invoice?: Invoice;
  stops?: LoadStop[];
};
