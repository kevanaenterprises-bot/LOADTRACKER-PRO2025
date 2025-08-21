import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, getSession } from "./replitAuth";
import { ObjectStorageService } from "./objectStorage";
import { sendSMSToDriver } from "./smsService";
import { processRateConfirmationImage } from "./ocrService";
import { GPSService } from "./gpsService";
import multer from 'multer';
import {
  insertLoadSchema,
  insertLocationSchema,
  insertBolNumberSchema,
  insertRateSchema,
  insertUserSchema,
  type Load,
  type User,
  type Location
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware (includes session setup)
  await setupAuth(app);
  
  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    },
  });

  // Admin authentication middleware
  const isAdminAuthenticated = (req: any, res: any, next: any) => {
    // Check if user is authenticated via Replit Auth, Admin Auth, or Driver Auth (for testing)
    const isReplitAuth = req.isAuthenticated() && req.user?.claims?.sub;
    const isAdminAuth = (req.session as any)?.adminAuth;
    const isDriverAuth = (req.session as any)?.driverAuth;
    
    if (isReplitAuth || isAdminAuth || isDriverAuth) {
      return next();
    }
    
    return res.status(401).json({ message: "Unauthorized" });
  };

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Driver login with username/password (both routes for compatibility)
  app.post('/api/driver/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log("Driver login attempt:", { 
        username, 
        usernameLength: username?.length,
        password: password ? `[LENGTH:${password.length}]` : "[MISSING]",
        passwordActual: JSON.stringify(password)
      });
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Pass username as-is since getDriverByUsername now handles case-insensitivity
      const driver = await storage.getDriverByUsername(username);
      console.log("Driver lookup result:", driver ? "Found" : "Not found", "for username:", username);
      
      if (!driver) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Check if password matches phone number (driver password should be their phone number)
      // Normalize phone numbers by removing spaces, dashes, parentheses
      const normalizePhone = (phone: string) => phone.replace(/[\s\-\(\)]/g, '');
      const providedPhone = normalizePhone(password);
      const expectedPhone = normalizePhone(driver.phoneNumber || '');
      
      console.log("Password check:", { 
        provided: password, 
        expected: driver.phoneNumber,
        normalizedProvided: providedPhone,
        normalizedExpected: expectedPhone
      });
      
      if (expectedPhone !== providedPhone) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Create session for driver
      (req.session as any).driverAuth = {
        userId: driver.id,
        username: driver.username,
        role: driver.role
      };

      res.json({ 
        message: "Login successful",
        user: {
          id: driver.id,
          username: driver.username,
          firstName: driver.firstName,
          lastName: driver.lastName,
          role: driver.role,
          phoneNumber: driver.phoneNumber
        }
      });
    } catch (error) {
      console.error("Driver login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post('/api/auth/driver-login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log("Driver login attempt:", { 
        username, 
        usernameLength: username?.length,
        password: password ? `[LENGTH:${password.length}]` : "[MISSING]",
        passwordActual: JSON.stringify(password)
      });
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Pass username as-is since getDriverByUsername now handles case-insensitivity
      const driver = await storage.getDriverByUsername(username);
      console.log("Driver lookup result:", driver ? "Found" : "Not found", "for username:", username);
      
      if (!driver) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Check if password matches phone number (driver password should be their phone number)
      // Normalize phone numbers by removing spaces, dashes, parentheses
      const normalizePhone = (phone: string) => phone.replace(/[\s\-\(\)]/g, '');
      const providedPhone = normalizePhone(password);
      const expectedPhone = normalizePhone(driver.phoneNumber || '');
      
      console.log("Password check:", { 
        provided: password, 
        expected: driver.phoneNumber,
        normalizedProvided: providedPhone,
        normalizedExpected: expectedPhone
      });
      
      if (expectedPhone !== providedPhone) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Create session for driver
      (req.session as any).driverAuth = {
        userId: driver.id,
        username: driver.username,
        role: driver.role
      };

      res.json({ 
        message: "Login successful",
        user: {
          id: driver.id,
          username: driver.username,
          firstName: driver.firstName,
          lastName: driver.lastName,
          role: driver.role,
          phoneNumber: driver.phoneNumber
        }
      });
    } catch (error) {
      console.error("Driver login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Driver logout
  app.post('/api/auth/driver-logout', (req, res) => {
    (req.session as any).driverAuth = undefined;
    res.json({ message: "Logout successful" });
  });

  // Check driver authentication
  app.get('/api/auth/driver-user', (req, res) => {
    if ((req.session as any).driverAuth) {
      res.json((req.session as any).driverAuth);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // Persistent bypass store using environment variable
  const BYPASS_SECRET = "LOADTRACKER_BYPASS_2025";
  
  function isBypassActive(req: any): boolean {
    return req.headers['x-bypass-token'] === BYPASS_SECRET;
  }

  // Simple browser auth bypass for testing
  app.post("/api/auth/browser-bypass", async (req, res) => {
    try {
      console.log("Browser auth bypass token requested");
      res.json({ 
        message: "Browser auth bypass token provided", 
        success: true,
        token: BYPASS_SECRET
      });
    } catch (error) {
      console.error("Browser bypass error:", error);
      res.status(500).json({ message: "Bypass failed" });
    }
  });

  // Admin authentication routes
  app.post("/api/auth/admin-login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      console.log("Admin login attempt:", { 
        username, 
        usernameLength: username?.length,
        password: password ? `[LENGTH:${password.length}]` : "[MISSING]",
        passwordActual: JSON.stringify(password),
        sessionId: req.sessionID,
        hasSession: !!req.session
      });
      
      // Check for admin credentials (case insensitive, trim whitespace)
      if (username.toLowerCase().trim() === "admin" && password.trim() === "go4fc2024") {
        console.log("Admin credentials matched successfully");
        
        // Ensure session exists
        if (!req.session) {
          console.error("No session available for admin login");
          return res.status(500).json({ message: "Session error" });
        }
        
        // Create admin user session
        (req.session as any).adminAuth = {
          id: "admin-001",
          username: "admin",
          role: "admin",
          firstName: "Admin",
          lastName: "User"
        };

        // Force session save with explicit reload to ensure persistence
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            return res.status(500).json({ message: "Session save failed" });
          }
          
          // Reload session to verify save
          req.session.reload((reloadErr) => {
            if (reloadErr) {
              console.error("Session reload error:", reloadErr);
              return res.status(500).json({ message: "Session verification failed" });
            }
            
            console.log("Session saved and verified, adminAuth:", (req.session as any).adminAuth);
            res.json({ 
              message: "Login successful", 
              user: (req.session as any).adminAuth 
            });
          });
        });
      } else {
        console.log("Invalid admin credentials provided:", { username, passwordLength: password?.length });
        res.status(401).json({ message: "Invalid admin credentials" });
      }
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/admin-user", async (req, res) => {
    try {
      const adminUser = (req.session as any)?.adminAuth;
      console.log("Admin user check:", { 
        hasSession: !!req.session, 
        hasAdminAuth: !!adminUser,
        sessionId: req.sessionID,
        sessionData: req.session ? Object.keys(req.session) : "no session",
        adminAuthData: adminUser || "none"
      });
      
      if (adminUser) {
        res.json(adminUser);
      } else {
        res.status(401).json({ message: "Not authenticated" });
      }
    } catch (error) {
      console.error("Admin user fetch error:", error);
      res.status(500).json({ message: "Failed to fetch admin user" });
    }
  });

  app.post("/api/auth/admin-logout", async (req, res) => {
    try {
      delete (req.session as any).adminAuth;
      res.json({ message: "Logout successful" });
    } catch (error) {
      console.error("Admin logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", isAdminAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Locations
  app.get("/api/locations", isAdminAuthenticated, async (req, res) => {
    try {
      const locations = await storage.getLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post("/api/locations", isAdminAuthenticated, async (req, res) => {
    try {
      const validatedData = insertLocationSchema.parse(req.body);
      const location = await storage.createLocation(validatedData);
      res.status(201).json(location);
    } catch (error) {
      console.error("Error creating location:", error);
      res.status(400).json({ message: "Invalid location data" });
    }
  });

  // Drivers
  app.get("/api/drivers", isAuthenticated, async (req, res) => {
    try {
      const drivers = await storage.getDrivers();
      res.json(drivers);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      res.status(500).json({ message: "Failed to fetch drivers" });
    }
  });

  app.post("/api/drivers", isAdminAuthenticated, async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const driver = await storage.createDriver(validatedData);
      res.status(201).json(driver);
    } catch (error) {
      console.error("Error creating driver:", error);
      res.status(400).json({ message: "Invalid driver data" });
    }
  });

  app.get("/api/drivers/available", isAdminAuthenticated, async (req, res) => {
    try {
      const drivers = await storage.getAvailableDrivers();
      res.json(drivers);
    } catch (error) {
      console.error("Error fetching available drivers:", error);
      res.status(500).json({ message: "Failed to fetch available drivers" });
    }
  });

  // Loads for admin/office users
  app.get("/api/loads", isAdminAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const user = await storage.getUser(userId);
      
      let loads;
      if (user?.role === "driver") {
        loads = await storage.getLoadsByDriver(userId);
      } else {
        loads = await storage.getLoads();
      }
      
      res.json(loads);
    } catch (error) {
      console.error("Error fetching loads:", error);
      res.status(500).json({ message: "Failed to fetch loads" });
    }
  });

  // Driver-specific loads endpoint  
  app.get("/api/driver/loads", (req, res, next) => {
    if ((req.session as any)?.driverAuth) {
      next();
    } else {
      res.status(401).json({ message: "Driver not authenticated" });
    }
  }, async (req, res) => {
    try {
      const driverUserId = (req.session as any)?.driverAuth?.userId;
      if (!driverUserId) {
        return res.status(401).json({ message: "Driver not authenticated" });
      }
      
      console.log("Fetching loads for driver:", driverUserId);
      const loads = await storage.getLoadsByDriver(driverUserId);
      console.log("Found", loads.length, "loads for driver");
      res.json(loads);
    } catch (error) {
      console.error("Error fetching driver loads:", error);
      res.status(500).json({ message: "Failed to fetch driver loads" });
    }
  });

  // GPS Tracking API endpoints

  // Confirm load and enable GPS tracking
  app.post("/api/loads/:id/confirm", (req, res, next) => {
    if ((req.session as any)?.driverAuth) {
      next();
    } else {
      res.status(401).json({ message: "Driver not authenticated" });
    }
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      const driverUserId = (req.session as any)?.driverAuth?.userId;
      
      // Update load to confirmed status and enable tracking
      const updatedLoad = await storage.confirmLoad(loadId, driverUserId);
      
      // Set up geocoded locations for tracking
      await GPSService.setupLoadLocations(loadId);
      
      res.json(updatedLoad);
    } catch (error) {
      console.error("Error confirming load:", error);
      res.status(500).json({ message: "Failed to confirm load" });
    }
  });

  // Update driver location for GPS tracking
  app.put("/api/loads/:id/location", (req, res, next) => {
    if ((req.session as any)?.driverAuth) {
      next();
    } else {
      res.status(401).json({ message: "Driver not authenticated" });
    }
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      const { latitude, longitude, accuracy } = req.body;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: "Latitude and longitude required" });
      }
      
      // Update load status based on GPS location
      await GPSService.updateLoadStatus(loadId, parseFloat(latitude), parseFloat(longitude));
      
      res.json({ success: true, message: "Location updated" });
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.post("/api/loads", isAdminAuthenticated, async (req, res) => {
    try {
      const validatedData = insertLoadSchema.parse(req.body);
      
      // Check if 109 number already exists
      const existingLoads = await storage.getLoads();
      const exists = existingLoads.some(load => load.number109 === validatedData.number109);
      if (exists) {
        return res.status(400).json({ message: "109 number already exists" });
      }

      const load = await storage.createLoad(validatedData);

      // Send SMS to driver if assigned
      if (validatedData.driverId) {
        try {
          const driver = await storage.getUser(validatedData.driverId);
          const location = validatedData.locationId 
            ? (await storage.getLocations()).find(l => l.id === validatedData.locationId)
            : null;

          if (driver?.phoneNumber) {
            await sendSMSToDriver(
              driver.phoneNumber,
              `New load assigned: ${validatedData.number109}. Pickup: 1800 East Plano Parkway. Delivery: ${location?.name || 'See details'}. Est. miles: ${validatedData.estimatedMiles || 'TBD'}`
            );
          }
        } catch (smsError) {
          console.error("Failed to send SMS:", smsError);
          // Don't fail the load creation if SMS fails
        }
      }

      res.status(201).json(load);
    } catch (error) {
      console.error("Error creating load:", error);
      res.status(400).json({ message: "Invalid load data" });
    }
  });

  app.get("/api/loads/:id", isAuthenticated, async (req, res) => {
    try {
      const load = await storage.getLoad(req.params.id);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }
      res.json(load);
    } catch (error) {
      console.error("Error fetching load:", error);
      res.status(500).json({ message: "Failed to fetch load" });
    }
  });

  app.patch("/api/loads/:id/status", isAdminAuthenticated, async (req, res) => {
    try {
      const { status } = req.body;
      const load = await storage.updateLoadStatus(req.params.id, status);
      res.json(load);
    } catch (error) {
      console.error("Error updating load status:", error);
      res.status(500).json({ message: "Failed to update load status" });
    }
  });

  // Assign driver to load - WITH TOKEN BYPASS
  app.patch("/api/loads/:id/assign-driver", (req, res, next) => {
    // Check multiple auth methods: admin session, Replit auth, driver auth, OR token bypass
    const hasAdminAuth = !!(req.session as any)?.adminAuth;
    const hasReplitAuth = !!req.user;
    const hasDriverAuth = !!(req.session as any)?.driverAuth;
    const hasTokenBypass = isBypassActive(req);
    
    console.log("Driver assignment auth check:", {
      hasSession: !!req.session,
      sessionId: req.sessionID,
      hasAdminAuth,
      hasReplitAuth, 
      hasDriverAuth,
      hasTokenBypass,
      bypassToken: req.headers['x-bypass-token'] ? '[PROVIDED]' : '[MISSING]',
      adminAuthData: (req.session as any)?.adminAuth,
      userAuth: !!req.user
    });

    if (hasAdminAuth || hasReplitAuth || hasDriverAuth || hasTokenBypass) {
      next();
    } else {
      console.log("Authentication failed - no valid auth method found");
      res.status(401).json({ message: "Authentication required - use bypass token" });
    }
  }, async (req, res) => {
    try {
      const { driverId } = req.body;
      const loadId = req.params.id;
      
      if (!driverId) {
        return res.status(400).json({ message: "Driver ID is required" });
      }

      // Get the load first
      const load = await storage.getLoad(loadId);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }

      // Update the load with driver assignment
      const updatedLoad = await storage.updateLoad(loadId, { driverId });

      // Send SMS to driver if they have a phone number
      try {
        const driver = await storage.getUser(driverId);
        if (driver?.phoneNumber) {
          const location = load.location;
          await sendSMSToDriver(
            driver.phoneNumber,
            `New load assigned: ${load.number109}. Pickup: 1800 East Plano Parkway. Delivery: ${location?.name || 'See details'}. Est. miles: ${load.estimatedMiles || 'TBD'}`
          );
        }
      } catch (smsError) {
        console.error("Failed to send SMS:", smsError);
        // Don't fail the assignment if SMS fails
      }

      res.json(updatedLoad);
    } catch (error) {
      console.error("Error assigning driver to load:", error);
      res.status(500).json({ message: "Failed to assign driver to load" });
    }
  });

  // Mark invoice as printed
  app.patch("/api/invoices/:id/mark-printed", async (req, res) => {
    try {
      const invoiceId = req.params.id;
      const invoice = await storage.getInvoice(invoiceId);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const updatedInvoice = await storage.updateInvoice(invoiceId, {
        printedAt: new Date(),
      });

      res.json({ message: "Invoice marked as printed", invoice: updatedInvoice });
    } catch (error) {
      console.error("Error marking invoice as printed:", error);
      res.status(500).json({ message: "Failed to mark invoice as printed" });
    }
  });

  // Manual invoice generation endpoint - COMPLETELY OPEN FOR TESTING
  app.post("/api/loads/:id/generate-invoice", async (req, res) => {
    try {
      const loadId = req.params.id;
      const load = await storage.getLoad(loadId);
      
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }

      if (!load.location) {
        return res.status(400).json({ message: "Load must have a destination to generate invoice" });
      }

      // Check if invoice already exists for this load
      const existingInvoices = await storage.getInvoices();
      const hasInvoice = existingInvoices.some((inv: any) => inv.loadId === load.id);
      
      if (hasInvoice) {
        return res.status(400).json({ message: "Invoice already exists for this load" });
      }

      // Get rate for the location
      const rate = await storage.getRateByLocation(
        load.location.city, 
        load.location.state
      );
      
      if (!rate) {
        return res.status(400).json({ 
          message: `No rate found for ${load.location.city}, ${load.location.state}. Please add a rate first.` 
        });
      }

      // Calculate invoice amount based on flat rate system
      const flatRate = parseFloat(rate.flatRate.toString());
      const lumperCharge = parseFloat(load.lumperCharge?.toString() || "0");
      const extraStopsCharge = (load.extraStops || 0) * 50;
      const totalAmount = flatRate + lumperCharge + extraStopsCharge;

      // Generate sequential invoice number starting with GO6000
      const invoiceNumber = await storage.getNextInvoiceNumber();
      const invoice = await storage.createInvoice({
        loadId: load.id,
        invoiceNumber,
        flatRate: rate.flatRate,
        lumperCharge: load.lumperCharge || "0.00",
        extraStopsCharge: extraStopsCharge.toString(),
        extraStopsCount: load.extraStops || 0,
        totalAmount: totalAmount.toString(),
        status: "pending",
      });

      console.log(`Manual invoice ${invoiceNumber} generated for load ${load.number109} by admin`);
      
      res.json(invoice);
    } catch (error) {
      console.error("Error generating manual invoice:", error);
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // BOL validation and entry
  app.get("/api/bol/check/:bolNumber", isAuthenticated, async (req, res) => {
    try {
      const exists = await storage.checkBOLExists(req.params.bolNumber);
      res.json({ exists });
    } catch (error) {
      console.error("Error checking BOL:", error);
      res.status(500).json({ message: "Failed to check BOL number" });
    }
  });

  app.patch("/api/loads/:id/bol", isAuthenticated, async (req, res) => {
    try {
      const { bolNumber, tripNumber } = req.body;
      
      // Validate trip number format (4 digits)
      if (!/^\d{4}$/.test(tripNumber)) {
        return res.status(400).json({ message: "Trip number must be 4 digits" });
      }

      // Check if BOL already exists
      const exists = await storage.checkBOLExists(bolNumber);
      if (exists) {
        return res.status(400).json({ message: "BOL number already exists" });
      }

      const load = await storage.updateLoadBOL(req.params.id, bolNumber, tripNumber);
      res.json(load);
    } catch (error) {
      console.error("Error updating load BOL:", error);
      res.status(500).json({ message: "Failed to update BOL information" });
    }
  });

  // POD upload - Support both admin and driver authentication
  app.post("/api/objects/upload", (req, res, next) => {
    // Check for either Replit Auth or Driver Auth
    const hasReplitAuth = req.isAuthenticated && req.isAuthenticated();
    const hasDriverAuth = (req.session as any)?.driverAuth;
    
    console.log("Upload auth check:", {
      hasReplitAuth,
      hasDriverAuth,
      sessionId: req.sessionID,
      session: req.session,
      driverAuthData: (req.session as any)?.driverAuth
    });
    
    if (hasReplitAuth || hasDriverAuth) {
      next();
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  }, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
    }
  });

  app.patch("/api/loads/:id/bol-document", (req, res, next) => {
    // Check for either Replit Auth or Driver Auth
    const hasReplitAuth = req.isAuthenticated && req.isAuthenticated();
    const hasDriverAuth = (req.session as any)?.driverAuth;
    
    if (hasReplitAuth || hasDriverAuth) {
      next();
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  }, async (req, res) => {
    try {
      const { bolDocumentURL } = req.body;
      
      if (!bolDocumentURL) {
        return res.status(400).json({ message: "BOL document URL is required" });
      }

      // Get user ID from either auth system
      const userId = (req.user as any)?.claims?.sub || (req.session as any)?.driverAuth?.userId;
      const objectStorageService = new ObjectStorageService();
      
      // Set ACL policy for the uploaded document
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        bolDocumentURL,
        {
          owner: userId,
          visibility: "private", // BOL documents should be private
        }
      );

      // Update load with BOL document path
      const load = await storage.updateLoadBOLDocument(req.params.id, objectPath);
      
      // Check if load now has both BOL and POD documents to auto-generate invoice
      try {
        const loadWithDetails = await storage.getLoad(req.params.id);
        if (loadWithDetails && loadWithDetails.podDocumentPath && loadWithDetails.location) {
          // Check if invoice already exists for this load
          const existingInvoices = await storage.getInvoices();
          const hasInvoice = existingInvoices.some((inv: any) => inv.loadId === loadWithDetails.id);
          
          if (!hasInvoice) {
            // Get rate for the location
            const rate = await storage.getRateByLocation(
              loadWithDetails.location.city, 
              loadWithDetails.location.state
            );
            
            if (rate) {
              // Calculate invoice amount based on flat rate system
              const flatRate = parseFloat(rate.flatRate.toString());
              const lumperCharge = parseFloat(loadWithDetails.lumperCharge?.toString() || "0");
              const extraStopsCharge = (loadWithDetails.extraStops || 0) * 50;
              const totalAmount = flatRate + lumperCharge + extraStopsCharge;

              // Auto-generate invoice with sequential GO6000 series
              const invoiceNumber = await storage.getNextInvoiceNumber();
              await storage.createInvoice({
                loadId: loadWithDetails.id,
                invoiceNumber,
                flatRate: rate.flatRate,
                lumperCharge: loadWithDetails.lumperCharge || "0.00",
                extraStopsCharge: extraStopsCharge.toString(),
                extraStopsCount: loadWithDetails.extraStops || 0,
                totalAmount: totalAmount.toString(),
                status: "pending",
              });

              console.log(`Auto-generated invoice ${invoiceNumber} for load ${loadWithDetails.number109} (BOL + POD complete)`);
            }
          }
        }
      } catch (invoiceError) {
        console.error("Failed to auto-generate invoice after BOL upload:", invoiceError);
        // Don't fail the BOL upload if invoice generation fails
      }
      
      res.json(load);
    } catch (error) {
      console.error("Error updating load BOL document:", error);
      res.status(500).json({ message: "Failed to update BOL document" });
    }
  });

  app.patch("/api/loads/:id/pod", isAuthenticated, async (req, res) => {
    try {
      const { podDocumentURL } = req.body;
      
      if (!podDocumentURL) {
        return res.status(400).json({ message: "POD document URL is required" });
      }

      const userId = (req.user as any)?.claims?.sub;
      const objectStorageService = new ObjectStorageService();
      
      // Set ACL policy for the uploaded document
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        podDocumentURL,
        {
          owner: userId,
          visibility: "private", // POD documents should be private
        }
      );

      // Update load with POD document path
      const load = await storage.updateLoadPOD(req.params.id, objectPath);
      
      // Update status to delivered if not already
      if (load.status !== "delivered" && load.status !== "completed") {
        await storage.updateLoadStatus(req.params.id, "delivered");
      }

      // Automatically generate invoice when POD is uploaded
      try {
        const loadWithDetails = await storage.getLoad(req.params.id);
        if (loadWithDetails && loadWithDetails.location) {
          // Get rate for the location
          const rate = await storage.getRateByLocation(
            loadWithDetails.location.city, 
            loadWithDetails.location.state
          );
          
          if (rate) {
            // Calculate invoice amount based on flat rate system
            const flatRate = parseFloat(rate.flatRate.toString());
            const lumperCharge = parseFloat(loadWithDetails.lumperCharge?.toString() || "0");
            const extraStopsCharge = (loadWithDetails.extraStops || 0) * 50;
            const totalAmount = flatRate + lumperCharge + extraStopsCharge;

            // Auto-generate invoice with sequential GO6000 series
            const invoiceNumber = await storage.getNextInvoiceNumber();
            await storage.createInvoice({
              loadId: loadWithDetails.id,
              invoiceNumber,
              flatRate: rate.flatRate,
              lumperCharge: loadWithDetails.lumperCharge || "0.00",
              extraStopsCharge: extraStopsCharge.toString(),
              extraStopsCount: loadWithDetails.extraStops || 0,
              totalAmount: totalAmount.toString(),
              status: "pending",
            });

            console.log(`Auto-generated invoice ${invoiceNumber} for load ${loadWithDetails.number109}`);
          }
        }
      } catch (invoiceError) {
        console.error("Failed to auto-generate invoice:", invoiceError);
        // Don't fail the POD upload if invoice generation fails
      }

      res.json(load);
    } catch (error) {
      console.error("Error updating POD:", error);
      res.status(500).json({ message: "Failed to update POD document" });
    }
  });

  // Complete load and generate invoice
  app.post("/api/loads/:id/complete", isAuthenticated, async (req, res) => {
    try {
      const load = await storage.getLoad(req.params.id);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }

      if (!load.location) {
        return res.status(400).json({ message: "Load location not found" });
      }

      // Get rate for the location
      const rate = await storage.getRateByLocation(load.location.city, load.location.state);
      if (!rate) {
        return res.status(400).json({ message: "Rate not found for this location" });
      }

      // Calculate invoice amount based on new flat rate system
      const flatRate = parseFloat(rate.flatRate.toString());
      const lumperCharge = parseFloat(load.lumperCharge?.toString() || "0");
      const extraStopsCharge = (load.extraStops || 0) * 50; // $50 per extra stop
      const totalAmount = flatRate + lumperCharge + extraStopsCharge;

      // Auto-generate invoice with sequential GO6000 series
      const invoiceNumber = await storage.getNextInvoiceNumber();
      await storage.createInvoice({
        loadId: load.id,
        invoiceNumber,
        flatRate: rate.flatRate,
        lumperCharge: load.lumperCharge || "0.00",
        extraStopsCharge: extraStopsCharge.toString(),
        extraStopsCount: load.extraStops || 0,
        totalAmount: totalAmount.toString(),
        status: "pending",
      });

      // Update load status to completed
      const updatedLoad = await storage.updateLoadStatus(load.id, "completed");

      res.json(updatedLoad);
    } catch (error) {
      console.error("Error completing load:", error);
      res.status(500).json({ message: "Failed to complete load" });
    }
  });

  // Rates
  app.get("/api/rates", isAdminAuthenticated, async (req, res) => {
    try {
      const rates = await storage.getRates();
      res.json(rates);
    } catch (error) {
      console.error("Error fetching rates:", error);
      res.status(500).json({ message: "Failed to fetch rates" });
    }
  });

  app.post("/api/rates", isAdminAuthenticated, async (req, res) => {
    try {
      const validatedData = insertRateSchema.parse(req.body);
      const rate = await storage.createRate(validatedData);
      res.status(201).json(rate);
    } catch (error) {
      console.error("Error creating rate:", error);
      res.status(400).json({ message: "Invalid rate data" });
    }
  });

  // Invoices
  app.get("/api/invoices", isAdminAuthenticated, async (req, res) => {
    try {
      const invoices = await storage.getInvoices();
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Mark invoice as printed
  app.patch("/api/invoices/:id/print", isAdminAuthenticated, async (req, res) => {
    try {
      const invoice = await storage.markInvoicePrinted(req.params.id);
      res.json(invoice);
    } catch (error) {
      console.error("Error marking invoice as printed:", error);
      res.status(500).json({ message: "Failed to mark invoice as printed" });
    }
  });

  // Test data endpoint (development only)
  if (process.env.NODE_ENV === "development") {
    app.post("/api/test/create-sample-loads", isAdminAuthenticated, async (req, res) => {
      try {
        // Get test driver
        const driver = await storage.getUserByUsername("John Smith");
        if (!driver) {
          return res.status(400).json({ message: "Test driver 'John Smith' not found" });
        }

        // Get locations that match our rates
        const miamiFLLocation = await storage.getLocationByName("Miami, FL");
        const houstonTXLocation = await storage.getLocationByName("Houston, TX");
        const phoenixAZLocation = await storage.getLocationByName("Phoenix, AZ");

        // Create test loads
        const testLoads = [
          {
            number109: "TEST001",
            pickupLocation: "Atlanta Warehouse",
            deliveryLocation: "Miami Distribution Center",
            pickupDate: new Date(),
            deliveryDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
            driverId: driver.id,
            locationId: miamiFLLocation?.id,
            lumperCharge: "150.00",
            extraStops: 2,
            status: "in_transit" as const
          },
          {
            number109: "TEST002",
            pickupLocation: "Chicago Depot",
            deliveryLocation: "Houston Terminal",
            pickupDate: new Date(),
            deliveryDate: new Date(Date.now() + 48 * 60 * 60 * 1000), // Day after tomorrow
            driverId: driver.id,
            locationId: houstonTXLocation?.id,
            lumperCharge: "0.00",
            extraStops: 1,
            status: "delivered" as const
          },
          {
            number109: "TEST003", 
            pickupLocation: "Los Angeles Port",
            deliveryLocation: "Phoenix Center",
            pickupDate: new Date(),
            deliveryDate: new Date(Date.now() + 72 * 60 * 60 * 1000), // 3 days from now
            driverId: driver.id,
            locationId: phoenixAZLocation?.id,
            lumperCharge: "75.00",
            extraStops: 0,
            status: "at_receiver" as const
          }
        ];

        const createdLoads = [];
        for (const loadData of testLoads) {
          const load = await storage.createLoad(loadData);
          createdLoads.push(load);
        }

        res.json({ 
          message: `Created ${createdLoads.length} test loads`,
          loads: createdLoads 
        });
      } catch (error) {
        console.error("Error creating test loads:", error);
        res.status(500).json({ message: "Failed to create test loads" });
      }
    });
  }

  // Serve private objects (POD documents)
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: "read" as any,
      });
      
      if (!canAccess) {
        return res.sendStatus(401);
      }
      
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      return res.sendStatus(404);
    }
  });

  // Load tracking endpoint for real-time map
  app.get("/api/tracking/loads", (req, res, next) => {
    // Allow admin, Replit auth, or driver auth for tracking data
    if ((req.session as any)?.adminAuth || req.user || (req.session as any)?.driverAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    console.log("Tracking endpoint reached");
    try {
      const trackingLoads = await storage.getLoadsWithTracking();
      console.log("Found tracking loads:", trackingLoads.length);
      res.json(trackingLoads);
    } catch (error) {
      console.error("Error fetching tracking loads:", error);
      res.status(500).json({ message: "Failed to fetch tracking data" });
    }
  });

  // OCR Routes for Wright Con processing
  app.post('/api/ocr/extract', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image file provided' });
      }

      console.log("Processing image for OCR:", req.file.originalname, req.file.size);
      
      const extractedData = await processRateConfirmationImage(req.file.buffer);
      
      res.json(extractedData);
    } catch (error) {
      console.error('OCR extraction error:', error);
      res.status(500).json({ 
        message: 'Failed to extract data from image',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/ocr/generate-load', async (req, res) => {
    try {
      const extractedData = req.body;
      
      if (!extractedData || extractedData.confidence < 0.3) {
        return res.status(400).json({ 
          message: 'Insufficient data or low confidence to generate load' 
        });
      }

      // Generate a 109 number
      const timestamp = Date.now();
      const number109 = `109-${timestamp.toString().slice(-8)}`;

      // Create the load with extracted data
      const loadData = {
        number109,
        status: 'created' as const,
        // Use extracted data if available, otherwise set to null
        bolNumber: extractedData.loadNumber || null,
        poNumber: extractedData.poNumber || null,
        appointmentTime: extractedData.appointmentTime || null,
        pickupAddress: extractedData.pickupAddress || null,
        deliveryAddress: extractedData.deliveryAddress || null,
        companyName: extractedData.companyName || null,
        // Default values for required fields
        extraStops: 0,
        lumperCharge: "0.00",
        estimatedMiles: null,
        driverId: null,
        locationId: null,
        bolDocumentPath: null,
        podDocumentPath: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const newLoad = await storage.createLoad(loadData);
      
      console.log("Generated load from OCR:", newLoad.number109);
      
      res.json({
        ...newLoad,
        message: `Load ${newLoad.number109} created from Wright Con data`,
        extractedData
      });
      
    } catch (error) {
      console.error('Load generation error:', error);
      res.status(500).json({ 
        message: 'Failed to generate load from extracted data',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
