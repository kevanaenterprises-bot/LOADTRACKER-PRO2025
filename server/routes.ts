import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService } from "./objectStorage";
import { sendSMSToDriver } from "./smsService";
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
  // Auth middleware
  await setupAuth(app);

  // Admin authentication middleware
  const isAdminAuthenticated = (req: any, res: any, next: any) => {
    // Check if user is authenticated via Replit Auth or Admin Auth
    const isReplitAuth = req.isAuthenticated() && req.user?.claims?.sub;
    const isAdminAuth = (req.session as any)?.adminAuth;
    
    if (isReplitAuth || isAdminAuth) {
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

  // Driver login with username/password
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

      // Make username search case-insensitive
      const driver = await storage.getDriverByUsername(username.toLowerCase());
      console.log("Driver lookup result:", driver ? "Found" : "Not found", "for username:", username.toLowerCase());
      
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
        passwordActual: JSON.stringify(password)
      });
      
      // Check for admin credentials (case insensitive, trim whitespace)
      if (username.toLowerCase().trim() === "admin" && password.trim() === "go4fc2024") {
        console.log("Admin credentials matched successfully");
        // Create admin user session
        (req.session as any).adminAuth = {
          id: "admin-001",
          username: "admin",
          role: "admin",
          firstName: "Admin",
          lastName: "User"
        };

        res.json({ 
          message: "Login successful", 
          user: (req.session as any).adminAuth 
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
        sessionId: req.sessionID
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

  // Loads
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

  app.patch("/api/loads/:id/status", isAuthenticated, async (req, res) => {
    try {
      const { status } = req.body;
      const load = await storage.updateLoadStatus(req.params.id, status);
      res.json(load);
    } catch (error) {
      console.error("Error updating load status:", error);
      res.status(500).json({ message: "Failed to update load status" });
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

  // POD upload
  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
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

            // Generate invoice
            const invoiceNumber = `INV-${Date.now()}`;
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

      // Generate invoice
      const invoiceNumber = `INV-${Date.now()}`;
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

  const httpServer = createServer(app);
  return httpServer;
}
