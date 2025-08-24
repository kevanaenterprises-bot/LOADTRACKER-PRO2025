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
  type Location,
  invoices
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

// Bypass secret for testing and mobile auth
const BYPASS_SECRET = "LOADTRACKER_BYPASS_2025";

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

  // Use the BYPASS_SECRET already defined above
  
  function isBypassActive(req: any): boolean {
    const token = req.headers['x-bypass-token'];
    const isActive = token === BYPASS_SECRET;
    console.log("Bypass check:", { token: token ? '[PROVIDED]' : '[MISSING]', expected: BYPASS_SECRET, isActive });
    return isActive;
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

  // Test endpoint to verify bypass token
  app.get("/api/test/bypass", (req, res) => {
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    
    console.log("Bypass test endpoint:", {
      bypassToken: bypassToken ? '[PROVIDED]' : '[MISSING]',
      expectedToken: BYPASS_SECRET,
      hasTokenBypass
    });
    
    if (hasTokenBypass) {
      res.json({ message: "Bypass token working!", success: true });
    } else {
      res.status(401).json({ message: "Bypass token failed" });
    }
  });

  // Direct production debug endpoint
  app.get("/api/debug/production", (req, res) => {
    const driverAuth = (req.session as any)?.driverAuth;
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    
    console.log("PRODUCTION DEBUG:", {
      sessionId: req.sessionID,
      hasDriverAuth: !!driverAuth,
      driverData: driverAuth || 'none',
      hasTokenBypass,
      bypassToken: bypassToken ? '[PROVIDED]' : '[MISSING]',
      headers: Object.keys(req.headers),
      userAgent: req.headers['user-agent']
    });
    
    res.json({
      sessionActive: !!driverAuth,
      bypassActive: hasTokenBypass,
      userId: driverAuth?.userId || 'none',
      username: driverAuth?.username || 'none',
      timestamp: new Date().toISOString()
    });
  });

  // Serve static debug HTML file
  app.get("/debug-mobile", (req, res) => {
    res.sendFile(__dirname + '/../debug-mobile.html');
  });

  // Serve mobile auth fix script
  app.get("/fix-mobile-auth.js", (req, res) => {
    res.sendFile(__dirname + '/../fix-mobile-auth.js');
  });

  // Server-side test page for mobile debugging
  app.get("/mobile-test", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mobile Test - LoadTracker</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          input, button { width: 100%; padding: 12px; margin: 8px 0; border-radius: 4px; border: 1px solid #ddd; }
          button { background: #007bff; color: white; cursor: pointer; font-size: 16px; }
          button:disabled { background: #ccc; }
          .result { margin: 10px 0; padding: 10px; border-radius: 4px; font-size: 14px; }
          .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
          h1 { color: #333; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Mobile API Test</h1>
          <input type="text" id="bolInput" placeholder="Enter BOL number" value="5469">
          <button onclick="testBOL()">Test BOL Validation</button>
          <button onclick="testStatus()">Test Status Update</button>
          <div id="result"></div>
        </div>
        
        <script>
          function showResult(message, isSuccess) {
            const result = document.getElementById('result');
            result.innerHTML = message;
            result.className = 'result ' + (isSuccess ? 'success' : 'error');
          }
          
          async function testBOL() {
            const bolNumber = document.getElementById('bolInput').value;
            if (!bolNumber) {
              showResult('Please enter a BOL number', false);
              return;
            }
            
            try {
              console.log('Testing BOL:', bolNumber);
              const response = await fetch('/api/bol/check/' + bolNumber, {
                headers: { 'X-Bypass-Token': 'LOADTRACKER_BYPASS_2025' }
              });
              
              console.log('BOL Response status:', response.status);
              
              if (response.ok) {
                const data = await response.json();
                console.log('BOL Success:', data);
                showResult('BOL Check SUCCESS: ' + (data.exists ? 'BOL exists' : 'BOL not found'), true);
              } else {
                const error = await response.text();
                console.log('BOL Error:', error);
                showResult('BOL Check ERROR (' + response.status + '): ' + error, false);
              }
            } catch (error) {
              console.error('BOL Exception:', error);
              showResult('BOL Check EXCEPTION: ' + error.message, false);
            }
          }
          
          async function testStatus() {
            try {
              console.log('Testing status update - attempting request...');
              
              // First, let's test if we can reach the endpoint at all
              const testResponse = await fetch('/api/test/bypass', {
                headers: { 'X-Bypass-Token': 'LOADTRACKER_BYPASS_2025' }
              });
              console.log('Bypass test response:', testResponse.status);
              
              // Now try the actual status update
              const response = await fetch('/api/loads/1d4df59c-1f72-4e3d-8812-472ae3414453/status', {
                method: 'PATCH',
                headers: { 
                  'Content-Type': 'application/json',
                  'X-Bypass-Token': 'LOADTRACKER_BYPASS_2025' 
                },
                body: JSON.stringify({ status: 'at_shipper' })
              });
              
              console.log('Status Response status:', response.status);
              console.log('Status Response headers:', Array.from(response.headers.entries()));
              
              if (response.ok) {
                const data = await response.json();
                console.log('Status Success:', data);
                showResult('Status Update SUCCESS: Updated to ' + data.status, true);
              } else {
                const error = await response.text();
                console.log('Status Error Response Body:', error);
                showResult('Status Update ERROR (' + response.status + '): ' + error, false);
              }
            } catch (error) {
              console.error('Status Exception Details:', error);
              showResult('Status Update EXCEPTION: ' + error.message, false);
            }
          }
          
          // Auto-test BOL on load
          setTimeout(() => {
            console.log('Page loaded, ready for tests');
          }, 1000);
        </script>
      </body>
      </html>
    `);
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

  // Dashboard stats - WITH TOKEN BYPASS
  app.get("/api/dashboard/stats", (req, res, next) => {
    const hasAdminAuth = !!(req.session as any)?.adminAuth;
    const hasReplitAuth = !!req.user;
    const hasTokenBypass = isBypassActive(req);
    
    console.log("Dashboard stats auth check:", {
      hasAdminAuth,
      hasReplitAuth,
      hasTokenBypass,
      headers: Object.keys(req.headers),
      bypassToken: req.headers['x-bypass-token'] ? '[PROVIDED]' : '[MISSING]'
    });
    
    if (hasAdminAuth || hasReplitAuth || hasTokenBypass) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Locations
  app.get("/api/locations", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const locations = await storage.getLocations();
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post("/api/locations", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      console.log("Location creation request body:", req.body);
      const validatedData = insertLocationSchema.parse(req.body);
      console.log("Location validation successful:", validatedData);
      const location = await storage.createLocation(validatedData);
      console.log("Location created successfully:", location.id);
      res.status(201).json(location);
    } catch (error: any) {
      console.error("Error creating location - full details:", error);
      if (error?.name === 'ZodError') {
        console.error("Location validation errors:", error.errors);
        res.status(400).json({ message: "Invalid location data", errors: error.errors });
      } else {
        res.status(400).json({ message: error?.message || "Invalid location data" });
      }
    }
  });

  // Drivers - WITH TOKEN BYPASS
  app.get("/api/drivers", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const drivers = await storage.getDrivers();
      res.json(drivers);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      res.status(500).json({ message: "Failed to fetch drivers" });
    }
  });

  app.post("/api/drivers", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      console.log("Driver creation request body:", req.body);
      const validatedData = insertUserSchema.parse(req.body);
      console.log("Driver validation successful:", validatedData);
      const driver = await storage.createDriver(validatedData);
      console.log("Driver created successfully:", driver.id);
      res.status(201).json(driver);
    } catch (error: any) {
      console.error("Error creating driver - full details:", error);
      if (error?.name === 'ZodError') {
        console.error("Driver validation errors:", error.errors);
        res.status(400).json({ message: "Invalid driver data", errors: error.errors });
      } else {
        res.status(400).json({ message: error?.message || "Invalid driver data" });
      }
    }
  });

  app.get("/api/drivers/available", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const drivers = await storage.getAvailableDrivers();
      res.json(drivers);
    } catch (error) {
      console.error("Error fetching available drivers:", error);
      res.status(500).json({ message: "Failed to fetch available drivers" });
    }
  });

  // Loads for admin/office users - WITH TOKEN BYPASS
  app.get("/api/loads", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
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

  // Check if BOL number exists - FOR DUPLICATE VALIDATION
  app.get("/api/bol/check/:bolNumber", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const bolNumber = req.params.bolNumber;
      const excludeLoadId = req.query.excludeLoadId as string;
      
      // Use the smarter check that can exclude a specific load
      const exists = await storage.checkBOLExistsForDifferentLoad(bolNumber, excludeLoadId);
      res.json({ exists });
    } catch (error) {
      console.error("Error checking BOL number:", error);
      res.status(500).json({ message: "Failed to check BOL number" });
    }
  });

  // Get load by number - FOR STANDALONE BOL UPLOAD
  app.get("/api/loads/by-number/:number", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const load = await storage.getLoadByNumber(req.params.number);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }
      res.json(load);
    } catch (error) {
      console.error("Error fetching load by number:", error);
      res.status(500).json({ message: "Failed to fetch load" });
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

  app.post("/api/loads", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    console.log("Load creation auth check:", {
      hasAdminAuth: !!(req.session as any)?.adminAuth,
      hasReplitAuth: !!req.user,
      hasDriverAuth: !!(req.session as any)?.driverAuth,
      hasTokenBypass: isBypassActive(req),
      sessionId: req.sessionID,
      requestBody: JSON.stringify(req.body).substring(0, 200),
      headers: Object.keys(req.headers)
    });
    if (hasAuth) {
      next();
    } else {
      console.error("Load creation failed - no authentication found");
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      console.log("Load creation - validating request body:", JSON.stringify(req.body));
      
      // Validate location exists if provided
      if (req.body.locationId) {
        const location = await storage.getLocation(req.body.locationId);
        if (!location) {
          console.log("Load creation failed - location not found:", req.body.locationId);
          return res.status(400).json({ message: "Selected location does not exist. Please add the location first." });
        }
        console.log("Location validated:", location.name);
      }
      
      const validatedData = insertLoadSchema.parse(req.body);
      console.log("Load creation - validation successful, creating load:", validatedData);
      
      // Check if 109 number already exists
      const existingLoads = await storage.getLoads();
      const exists = existingLoads.some(load => load.number109 === validatedData.number109);
      if (exists) {
        console.log("Load creation failed - 109 number already exists:", validatedData.number109);
        return res.status(400).json({ message: "109 number already exists" });
      }

      const load = await storage.createLoad(validatedData);
      console.log("Load creation successful:", load.id);

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
    } catch (error: any) {
      console.error("Error creating load - full details:", error);
      if (error?.name === 'ZodError') {
        console.error("Zod validation errors:", error.errors);
        res.status(400).json({ message: "Invalid load data", errors: error.errors });
      } else if (error?.code === '23503') {
        // Foreign key constraint violation
        console.error("Foreign key constraint violation:", error.detail);
        res.status(400).json({ message: "Selected location or driver does not exist. Please refresh and try again." });
      } else {
        res.status(400).json({ message: error?.message || "Invalid load data" });
      }
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

  app.patch("/api/loads/:id/status", (req, res, next) => {
    // Flexible authentication for driver status updates
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || hasTokenBypass;
    
    console.log("Load status update auth check:", {
      hasAdminAuth: !!(req.session as any)?.adminAuth,
      hasReplitAuth: !!req.user,
      hasDriverAuth: !!(req.session as any)?.driverAuth,
      hasTokenBypass,
      finalAuth: hasAuth
    });
    
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      console.log("MOBILE DEBUG - Status update request:", {
        loadId: req.params.id,
        requestBody: req.body,
        headers: Object.keys(req.headers),
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent']?.substring(0, 50)
      });
      
      const { status } = req.body;
      
      if (!status) {
        console.log("MOBILE DEBUG - Missing status in request body");
        return res.status(400).json({ message: "Status is required" });
      }
      
      console.log(`Updating load ${req.params.id} status to: ${status}`);
      const load = await storage.updateLoadStatus(req.params.id, status);
      console.log(`Load status updated successfully: ${load.status}`);
      res.json(load);
    } catch (error) {
      console.error("MOBILE DEBUG - Error updating load status:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        loadId: req.params.id,
        requestBody: req.body
      });
      res.status(500).json({ message: "Failed to update load status" });
    }
  });

  // Assign driver to load - WITH TOKEN BYPASS (both endpoints for compatibility)
  app.patch("/api/loads/:id/assign", (req, res, next) => {
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

  // Driver unassign endpoint  
  app.post("/api/loads/:id/unassign", (req, res, next) => {
    // Flexible authentication for driver unassignment
    const hasAdminAuth = !!(req.session as any)?.adminAuth;
    const hasReplitAuth = !!req.user;
    const hasDriverAuth = !!(req.session as any)?.driverAuth;
    const hasTokenBypass = isBypassActive(req);
    
    console.log("Driver unassign auth check:", {
      hasAdminAuth,
      hasReplitAuth,
      hasDriverAuth,
      hasTokenBypass
    });
    
    if (hasAdminAuth || hasReplitAuth || hasDriverAuth || hasTokenBypass) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      
      console.log(`🚛 Driver unassigning from load: ${loadId}`);
      
      // Get current load to verify it exists
      const currentLoad = await storage.getLoad(loadId);
      if (!currentLoad) {
        return res.status(404).json({ message: "Load not found" });
      }
      
      // Unassign driver from load (set driverId to null)
      const updatedLoad = await storage.updateLoad(loadId, { driverId: null });
      
      console.log(`✅ Driver unassigned from load ${currentLoad.number109}`);
      
      res.json({ 
        success: true, 
        message: `Unassigned from load ${currentLoad.number109}`,
        load: updatedLoad 
      });
    } catch (error) {
      console.error("Error unassigning driver from load:", error);
      res.status(500).json({ message: "Failed to unassign from load" });
    }
  });

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
      const invoiceNumber = req.params.id;
      const invoice = await storage.getInvoice(invoiceNumber);
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const updatedInvoice = await storage.updateInvoice(invoiceNumber, {
        printedAt: new Date(),
      });

      res.json({ message: "Invoice marked as printed", invoice: updatedInvoice });
    } catch (error) {
      console.error("Error marking invoice as printed:", error);
      res.status(500).json({ message: "Failed to mark invoice as printed" });
    }
  });

  // Send invoice via email
  app.post("/api/invoices/:id/email", async (req, res) => {
    try {
      const invoiceNumber = req.params.id;
      const { emailAddress, includeRateConfirmation } = req.body;
      
      if (!emailAddress) {
        return res.status(400).json({ message: "Email address is required" });
      }
      
      const invoice = await storage.getInvoice(invoiceNumber);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      if (!invoice.loadId) {
        return res.status(400).json({ message: "Invoice has no associated load" });
      }
      
      const load = await storage.getLoad(invoice.loadId);
      if (!load) {
        return res.status(404).json({ message: "Load not found for invoice" });
      }

      // Generate email HTML content
      let emailHTML;
      let subject;
      
      if (includeRateConfirmation) {
        emailHTML = generateCombinedRateConInvoiceHTML(invoice, load);
        subject = `Rate Confirmation & Invoice ${invoice.invoiceNumber} - GO 4 Farms & Cattle`;
      } else {
        emailHTML = generateInvoiceHTML(invoice, load);
        subject = `Invoice ${invoice.invoiceNumber} - GO 4 Farms & Cattle`;
      }

      // Send actual email using Outlook SMTP
      const { sendEmail } = await import('./emailService');
      
      const emailResult = await sendEmail({
        to: emailAddress,
        subject,
        html: emailHTML
      });
      
      res.json({ 
        message: "Invoice email sent successfully",
        emailAddress,
        invoiceNumber: invoice.invoiceNumber,
        includeRateConfirmation,
        messageId: emailResult.messageId,
        recipients: emailResult.recipients
      });
      
    } catch (error) {
      console.error("Error sending invoice email:", error);
      res.status(500).json({ message: "Failed to send invoice email" });
    }
  });

  // Email complete document package - WITH FLEXIBLE AUTHENTICATION
  app.post("/api/invoices/:id/email-complete-package", (req, res, next) => {
    console.log("🔍 EMAIL ROUTE HIT - Starting email process");
    console.log("🔍 Request params:", req.params);
    console.log("🔍 Request body:", req.body);
    
    // Manual bypass check
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || hasTokenBypass;
    
    if (!hasAuth) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  }, async (req, res) => {
    try {
      const invoiceIdOrNumber = req.params.id;
      const { emailAddress, loadId } = req.body;

      if (!emailAddress) {
        return res.status(400).json({ message: "Email address is required" });
      }

      if (invoiceIdOrNumber === 'undefined' || !invoiceIdOrNumber) {
        return res.status(400).json({ message: "Invoice ID is required" });
      }

      // Get invoice data - check if it's UUID (ID) or invoice number
      let invoice;
      if (invoiceIdOrNumber.includes('-') && invoiceIdOrNumber.length === 36) {
        // It's a UUID like 165aa75a-b9f9-4ba7-94dd-a1b011ea8c4a
        const [invoiceById] = await db.select().from(invoices).where(eq(invoices.id, invoiceIdOrNumber));
        invoice = invoiceById;
      } else {
        // It's an invoice number like GO6000, INV-1755572280561, etc.
        invoice = await storage.getInvoice(invoiceIdOrNumber);
      }
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Get load data (either from loadId parameter or from invoice)
      let load;
      if (loadId) {
        load = await storage.getLoad(loadId);
      } else if (invoice.loadId) {
        load = await storage.getLoad(invoice.loadId);
      } else {
        return res.status(400).json({ message: "No load ID available" });
      }
      
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }

      console.log(`📄 Load POD Document Status:`, {
        loadNumber: load.number109,
        podDocumentPath: load.podDocumentPath,
        hasPOD: !!load.podDocumentPath,
        podType: load.podDocumentPath ? (load.podDocumentPath.includes(',') ? 'multiple' : 'single') : 'none'
      });

      // Determine what documents are available
      const availableDocuments = {
        invoice: true, // Always available
        rateConfirmation: true, // Always include with invoice
        podDocument: !!load.podDocumentPath, // Only true if POD was actually uploaded
        bolDocument: !!load.bolDocumentPath
      };
      
      console.log(`📋 Document availability for load ${load.number109}:`, availableDocuments);

      // Generate email with all available documents - Use primary load number as identifier (any format)
      const primaryLoadNumber = load.number109 || 'Unknown';
      const subject = `Complete Package - Load ${primaryLoadNumber} - Invoice ${invoice.invoiceNumber}`;
      
      let emailHTML = generateCompletePackageEmailHTML(invoice, load, availableDocuments);
      
      // Send actual email using Outlook SMTP
      console.log("🔍 Attempting to send email to:", emailAddress);
      console.log("🔍 Email credentials check:", {
        hasEmail: !!process.env.OUTLOOK_EMAIL,
        hasPassword: !!process.env.OUTLOOK_PASSWORD,
        emailLength: process.env.OUTLOOK_EMAIL?.length || 0
      });
      
      const { sendEmail, testEmailConnection, generatePDF } = await import('./emailService');
      
      // Test connection first
      console.log("🔍 Testing email connection...");
      const connectionOk = await testEmailConnection();
      if (!connectionOk) {
        throw new Error("Email server connection failed - please check credentials");
      }
      
      // Generate PDF attachments
      console.log("🔍 Generating PDF attachments...");
      const attachments = [];
      
      // Generate invoice PDF
      const invoiceHTML = generateCombinedRateConInvoiceHTML(invoice, load);
      const invoicePDF = await generatePDF(invoiceHTML);
      attachments.push({
        filename: `Invoice-${invoice.invoiceNumber}.pdf`,
        content: invoicePDF,
        contentType: 'application/pdf'
      });
      
      // Handle POD documents - Attach ONLY the actual uploaded files
      if (load.podDocumentPath) {
        console.log(`📄 Processing uploaded POD documents for load ${primaryLoadNumber}`);
        console.log(`📄 POD path: ${load.podDocumentPath}`);
        
        if (load.podDocumentPath.includes(',')) {
          // Multiple POD documents - fetch each actual file  
          const podPaths = load.podDocumentPath.split(',').map((path: string) => path.trim());
          console.log(`📄 Found ${podPaths.length} uploaded POD documents for load ${primaryLoadNumber}`);
          
          for (let i = 0; i < podPaths.length; i++) {
            try {
              // For testing: Create a direct URL to the POD file
              const podPath = podPaths[i];
              const podUrl = `/objects/${podPath}`;
              
              // Fetch the actual file directly
              const response = await fetch(`http://localhost:5000${podUrl}`, {
                headers: { 'x-bypass-token': process.env.BYPASS_SECRET || 'LOADTRACKER_BYPASS_2025' }
              });
              
              if (response.ok) {
                const fileBuffer = Buffer.from(await response.arrayBuffer());
                const contentType = response.headers.get('content-type') || 'application/pdf';
                
                attachments.push({
                  filename: `POD-${primaryLoadNumber}-Page${i + 1}.${getFileExtension(contentType)}`,
                  content: fileBuffer,
                  contentType: contentType
                });
                console.log(`✅ Attached actual POD file: POD-${primaryLoadNumber}-Page${i + 1}.${getFileExtension(contentType)}`);
              } else {
                console.error(`❌ Failed to fetch POD document ${podPath}: HTTP ${response.status}`);
              }
            } catch (error) {
              console.error(`❌ Failed to fetch POD document ${podPaths[i]}:`, error);
            }
          }
        } else {
          // Single POD document - fetch the actual file
          try {
            console.log(`📄 Fetching single uploaded POD document for load ${primaryLoadNumber}`);
            const podUrl = `/objects/${load.podDocumentPath}`;
            
            // Fetch the actual file directly  
            const response = await fetch(`http://localhost:5000${podUrl}`, {
              headers: { 'x-bypass-token': process.env.BYPASS_SECRET || 'LOADTRACKER_BYPASS_2025' }
            });
            
            if (response.ok) {
              const fileBuffer = Buffer.from(await response.arrayBuffer());
              const contentType = response.headers.get('content-type') || 'application/pdf';
              
              attachments.push({
                filename: `POD-${primaryLoadNumber}.${getFileExtension(contentType)}`,
                content: fileBuffer,
                contentType: contentType
              });
              console.log(`✅ Attached actual POD file: POD-${primaryLoadNumber}.${getFileExtension(contentType)}`);
            } else {
              console.error(`❌ Failed to fetch POD document ${load.podDocumentPath}: HTTP ${response.status}`);
            }
          } catch (error) {
            console.error(`❌ Failed to fetch POD document ${load.podDocumentPath}:`, error);
          }
        }
      } else {
        console.log(`⚠️  No POD document uploaded for load ${primaryLoadNumber} - skipping POD attachment`);
      }

      // Include BOL document if available
      if (load.bolDocumentPath) {
        console.log(`📄 Including BOL document for load ${primaryLoadNumber}`);
        // Note: BOL is usually an image/PDF that was uploaded, so we include a reference
        // The actual BOL file would need to be fetched from object storage if needed
      }
      
      console.log(`🔍 Generated ${attachments.length} PDF attachments for load ${primaryLoadNumber}:`);
      attachments.forEach(att => console.log(`  - ${att.filename}`));
      
      const emailResult = await sendEmail({
        to: emailAddress,
        subject,
        html: emailHTML,
        attachments
      });
      
      res.json({ 
        message: "Complete document package sent successfully",
        emailAddress,
        invoiceNumber: invoice.invoiceNumber,
        loadNumber: load.number109,
        documentsIncluded: Object.entries(availableDocuments).filter(([, included]) => included).map(([doc]) => doc),
        messageId: emailResult.messageId,
        recipients: emailResult.recipients
      });
      
    } catch (error) {
      console.error("Error sending complete package email:", error);
      console.error("Error details:", error instanceof Error ? error.message : error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        message: "Failed to send complete package email",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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

  // BOL validation and entry - WITH FLEXIBLE AUTHENTICATION
  app.get("/api/bol/check/:bolNumber", (req, res, next) => {
    // Manual bypass check
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || hasTokenBypass;
    
    console.log("BOL validation auth check:", {
      hasAdminAuth: !!(req.session as any)?.adminAuth,
      hasReplitAuth: !!req.user,
      hasDriverAuth: !!(req.session as any)?.driverAuth,
      hasTokenBypass,
      bypassToken: bypassToken ? '[PROVIDED]' : '[MISSING]',
      expectedToken: BYPASS_SECRET,
      finalAuth: hasAuth
    });
    
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      console.log(`BOL validation request for: ${req.params.bolNumber}`);
      const exists = await storage.checkBOLExists(req.params.bolNumber);
      console.log(`BOL ${req.params.bolNumber} exists: ${exists}`);
      res.json({ exists });
    } catch (error) {
      console.error("Error checking BOL:", error);
      res.status(500).json({ message: "Failed to check BOL number" });
    }
  });

  app.patch("/api/loads/:id/bol", (req, res, next) => {
    // Manual bypass check - same pattern as BOL validation
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || hasTokenBypass;
    
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
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
    // Flexible authentication for BOL document uploads
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasReplitAuth = req.isAuthenticated && req.isAuthenticated();
    const hasDriverAuth = (req.session as any)?.driverAuth;
    const hasAuth = hasReplitAuth || hasDriverAuth || hasTokenBypass;
    
    console.log("BOL document upload auth check:", {
      hasReplitAuth,
      hasDriverAuth,
      hasTokenBypass,
      finalAuth: hasAuth
    });
    
    if (hasAuth) {
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

      // For testing: use the URL directly without object storage ACL
      const objectPath = bolDocumentURL;

      // Update load with BOL document path
      const load = await storage.updateLoadBOLDocument(req.params.id, objectPath);
      
      console.log("📋 BOL document updated successfully, checking for invoice generation...");

      // Auto-generate invoice when BOL is uploaded to a completed/delivered load
      try {
        const loadWithDetails = await storage.getLoad(req.params.id);
        
        // Check if load is completed/delivered and has location data
        if (loadWithDetails && 
            (loadWithDetails.status === 'completed' || loadWithDetails.status === 'delivered') && 
            loadWithDetails.location) {
          
          console.log("🧾 BOL uploaded to completed load - triggering invoice generation");
          
          // Check if invoice already exists for this load
          const existingInvoices = await storage.getInvoices();
          const hasInvoice = existingInvoices.some((inv: any) => inv.loadId === loadWithDetails.id);
          
          if (!hasInvoice) {
            console.log("🧾 No existing invoice found - generating new invoice");
            
            // Get rate for the location
            const rate = await storage.getRateByLocation(
              loadWithDetails.location.city, 
              loadWithDetails.location.state
            );
            
            if (rate) {
              console.log("🧾 Rate found - calculating invoice amount");
              
              // Calculate invoice amount based on flat rate system
              const flatRate = parseFloat(rate.flatRate.toString());
              const lumperCharge = parseFloat(loadWithDetails.lumperCharge?.toString() || "0");
              const extraStopsCharge = (loadWithDetails.extraStops || 0) * 50;
              const totalAmount = flatRate + lumperCharge + extraStopsCharge;

              // Auto-generate invoice with sequential GO6000 series
              const invoiceNumber = await storage.getNextInvoiceNumber();
              const invoice = await storage.createInvoice({
                loadId: loadWithDetails.id,
                invoiceNumber,
                flatRate: rate.flatRate,
                lumperCharge: loadWithDetails.lumperCharge || "0.00",
                extraStopsCharge: extraStopsCharge.toString(),
                extraStopsCount: loadWithDetails.extraStops || 0,
                totalAmount: totalAmount.toString(),
                status: "pending",
              });

              console.log(`🧾 ✅ Auto-generated invoice ${invoiceNumber} for load ${loadWithDetails.number109} - ready for admin inbox!`);
              console.log(`🧾 Invoice details: $${totalAmount} (Rate: $${flatRate}, Lumper: $${lumperCharge}, Extra stops: $${extraStopsCharge})`);
            } else {
              console.log("🧾 ❌ No rate found for location:", loadWithDetails.location.city, loadWithDetails.location.state);
            }
          } else {
            console.log("🧾 ℹ️ Invoice already exists for this load");
          }
        } else {
          console.log("🧾 ❌ Load not eligible for auto-invoice:", {
            status: loadWithDetails?.status,
            hasLocation: !!loadWithDetails?.location
          });
        }
      } catch (invoiceError) {
        console.error("❌ Failed to auto-generate invoice after BOL upload:", invoiceError);
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
      
      // Handle multiple POD documents (comma-separated URLs)
      const podUrls = podDocumentURL.split(',').map((url: string) => url.trim());
      const processedPaths: string[] = [];
      
      console.log(`📄 Processing ${podUrls.length} POD document(s) for load ${req.params.id}`);
      
      // Set ACL policy for each uploaded document
      for (const url of podUrls) {
        if (url) {
          const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
            url,
            {
              owner: userId,
              visibility: "private", // POD documents should be private
            }
          );
          processedPaths.push(objectPath);
        }
      }

      // Store all POD document paths as comma-separated string
      const finalPodPath = processedPaths.join(',');
      
      // Update load with POD document path(s)
      const load = await storage.updateLoadPOD(req.params.id, finalPodPath);
      
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
  if (false && process.env.NODE_ENV === "development") {
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

  // Simple email test endpoint
  app.post("/api/test-email", async (req, res) => {
    console.log("🔍 TEST EMAIL ENDPOINT HIT");
    try {
      const { testEmailConnection, sendEmail } = await import('./emailService');
      
      console.log("🔍 Testing email connection...");
      const connectionTest = await testEmailConnection();
      
      if (!connectionTest) {
        return res.status(500).json({ message: "Email connection failed" });
      }
      
      const result = await sendEmail({
        to: "test@example.com",
        subject: "Test Email from LoadTracker",
        html: "<h1>Test Email</h1><p>This is a test email from your LoadTracker system.</p>"
      });
      
      res.json({ message: "Test email sent successfully", result });
      
    } catch (error) {
      console.error("❌ Test email failed:", error);
      res.status(500).json({ 
        message: "Test email failed", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function generateInvoiceHTML(invoice: any, load: any): string {
  const currentDate = new Date().toLocaleDateString();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${invoice?.invoiceNumber || 'N/A'}</title>
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
          margin-bottom: 30px;
          gap: 20px;
        }
        .company-info-section {
          text-align: center;
        }
        .company-name {
          font-size: 28px;
          font-weight: bold;
          color: #2d5aa0;
          margin-bottom: 5px;
        }
        .company-info {
          font-size: 14px;
          color: #666;
        }
        .invoice-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .invoice-number {
          font-size: 24px;
          font-weight: bold;
          color: #333;
        }
        .details-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .details-table th,
        .details-table td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        .details-table th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .total-section {
          margin-top: 30px;
          text-align: right;
        }
        .total-amount {
          font-size: 20px;
          font-weight: bold;
          color: #2d5aa0;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-info-section">
          <div class="company-name">GO 4 Farms & Cattle</div>
          <div class="company-info">
            1510 Crystal Valley Way<br>
            Melissa, TX 75454<br>
            Phone: 214-878-1230<br>
            Email: accounting@go4fc.com
          </div>
        </div>
      </div>

      <div class="invoice-details">
        <div>
          <div class="invoice-number">INVOICE ${invoice?.invoiceNumber || 'N/A'}</div>
          <div>Date: ${currentDate}</div>
          <div>Load: ${load?.number_109 || load?.number109 || 'N/A'}</div>
          <div>BOL: ${load?.bolNumber || '374'}</div>
          <div>Trip: ${load?.tripNumber || generateTripNumber()}</div>
        </div>
        <div>
          <div><strong>Status:</strong> ${invoice?.status || 'Pending'}</div>
          <div><strong>Generated:</strong> ${invoice?.generatedAt ? new Date(invoice.generatedAt).toLocaleDateString() : currentDate}</div>
        </div>
      </div>

      <table class="details-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Transportation Service - Load ${load?.number_109 || load?.number109 || 'N/A'} (BOL: ${load?.bolNumber || '374'}, Trip: ${load?.tripNumber || generateTripNumber()})</td>
            <td>${load?.origin || 'N/A'}</td>
            <td>${load?.destination || 'N/A'}</td>
            <td>$${invoice?.flatRate || '0.00'}</td>
          </tr>
          ${invoice?.lumperCharge && parseFloat(invoice.lumperCharge) > 0 ? `
          <tr>
            <td>Lumper Service Charge</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.lumperCharge}</td>
          </tr>
          ` : ''}
          ${invoice?.extraStopsCharge && parseFloat(invoice.extraStopsCharge) > 0 ? `
          <tr>
            <td>Extra Stops (${invoice.extraStopsCount || 0} stops @ $50 each)</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.extraStopsCharge}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="total-section">
        <div style="font-size: 16px; margin-bottom: 10px;">
          <strong>Total Amount: <span class="total-amount">$${invoice?.totalAmount || '0.00'}</span></strong>
        </div>
        <div style="font-size: 14px; color: #666;">
          Payment Terms: Net 30 Days
        </div>
      </div>

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>For questions about this invoice, please contact us at billing@go4farms.com or (555) 123-4567</p>
      </div>
    </body>
    </html>
  `;
}

function generateCombinedRateConInvoiceHTML(invoice: any, load: any): string {
  const currentDate = new Date().toLocaleDateString();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Rate Confirmation & Invoice - ${invoice?.invoiceNumber || 'N/A'}</title>
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
          .page-break { page-break-before: always; }
        }
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
          margin-bottom: 30px;
          gap: 20px;
        }
        .company-info-section {
          text-align: center;
        }
        .company-name {
          font-size: 28px;
          font-weight: bold;
          color: #2d5aa0;
          margin-bottom: 5px;
        }
        .company-info {
          font-size: 14px;
          color: #666;
        }
        .section-title {
          font-size: 22px;
          font-weight: bold;
          color: #2d5aa0;
          margin: 30px 0 20px 0;
          text-align: center;
          border-bottom: 1px solid #ddd;
          padding-bottom: 10px;
        }
        .details-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .details-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .details-table th,
        .details-table td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        .details-table th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .total-section {
          margin-top: 30px;
          text-align: right;
        }
        .total-amount {
          font-size: 20px;
          font-weight: bold;
          color: #2d5aa0;
        }
        .signature-section {
          margin-top: 50px;
          display: flex;
          justify-content: space-between;
        }
        .signature-box {
          width: 45%;
          border: 1px solid #333;
          padding: 20px;
          text-align: center;
          min-height: 80px;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <!-- RATE CONFIRMATION SECTION -->
      <div class="header">
        <div class="company-info-section">
          <div class="company-name">GO 4 Farms & Cattle</div>
          <div class="company-info">
            1510 Crystal Valley Way<br>
            Melissa, TX 75454<br>
            Phone: 214-878-1230<br>
            Email: accounting@go4fc.com
          </div>
        </div>
      </div>

      <div class="section-title">RATE CONFIRMATION</div>

      <div class="details-section">
        <div>
          <div><strong>Load Number:</strong> ${load?.number109 || 'N/A'}</div>
          <div><strong>BOL Number:</strong> ${load?.bolNumber || 'N/A'}</div>
          <div><strong>Trip Number:</strong> ${load?.tripNumber || generateTripNumber()}</div>
        </div>
        <div>
          <div><strong>Date:</strong> ${currentDate}</div>
          <div><strong>Status:</strong> Confirmed</div>
        </div>
      </div>

      <table class="details-table">
        <thead>
          <tr>
            <th>Service Type</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Transportation Service</td>
            <td>${load?.origin || 'N/A'}</td>
            <td>${load?.destination || 'N/A'}</td>
            <td>$${invoice?.flatRate || '0.00'}</td>
          </tr>
          ${invoice?.lumperCharge && parseFloat(invoice.lumperCharge) > 0 ? `
          <tr>
            <td>Lumper Service</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.lumperCharge}</td>
          </tr>
          ` : ''}
          ${invoice?.extraStopsCharge && parseFloat(invoice.extraStopsCharge) > 0 ? `
          <tr>
            <td>Extra Stops (${invoice.extraStopsCount || 0})</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.extraStopsCharge}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="total-section">
        <div style="font-size: 18px; margin-bottom: 10px;">
          <strong>Total Agreed Rate: <span class="total-amount">$${invoice?.totalAmount || '0.00'}</span></strong>
        </div>
      </div>

      <div class="signature-section">
        <div class="signature-box">
          <div><strong>Customer Acceptance</strong></div>
          <div style="margin-top: 40px;">_________________________</div>
          <div>Signature & Date</div>
        </div>
        <div class="signature-box">
          <div><strong>GO 4 Farms & Cattle</strong></div>
          <div style="margin-top: 40px;">_________________________</div>
          <div>Authorized Signature & Date</div>
        </div>
      </div>

      <!-- INVOICE SECTION -->
      <div class="page-break"></div>
      
      <div class="header">
        <div class="company-info-section">
          <div class="company-name">GO 4 Farms & Cattle</div>
          <div class="company-info">
            1510 Crystal Valley Way<br>
            Melissa, TX 75454<br>
            Phone: 214-878-1230<br>
            Email: accounting@go4fc.com
          </div>
        </div>
      </div>

      <div class="section-title">INVOICE</div>

      <div class="details-section">
        <div>
          <div style="font-size: 24px; font-weight: bold; color: #333;">INVOICE ${invoice?.invoiceNumber || 'N/A'}</div>
          <div><strong>Load:</strong> ${load?.number_109 || load?.number109 || 'N/A'}</div>
          <div><strong>BOL:</strong> ${load?.bolNumber || '374'}</div>
          <div><strong>Trip:</strong> ${load?.tripNumber || generateTripNumber()}</div>
        </div>
        <div>
          <div><strong>Invoice Date:</strong> ${currentDate}</div>
          <div><strong>Status:</strong> ${invoice?.status || 'Pending'}</div>
          <div><strong>Generated:</strong> ${invoice?.generatedAt ? new Date(invoice.generatedAt).toLocaleDateString() : currentDate}</div>
        </div>
      </div>

      <table class="details-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Transportation Service - Load ${load?.number_109 || load?.number109 || 'N/A'}</td>
            <td>${load?.origin || 'N/A'}</td>
            <td>${load?.destination || 'N/A'}</td>
            <td>$${invoice?.flatRate || '0.00'}</td>
          </tr>
          ${invoice?.lumperCharge && parseFloat(invoice.lumperCharge) > 0 ? `
          <tr>
            <td>Lumper Service Charge</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.lumperCharge}</td>
          </tr>
          ` : ''}
          ${invoice?.extraStopsCharge && parseFloat(invoice.extraStopsCharge) > 0 ? `
          <tr>
            <td>Extra Stops (${invoice.extraStopsCount || 0} stops @ $50 each)</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.extraStopsCharge}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="total-section">
        <div style="font-size: 20px; margin-bottom: 10px;">
          <strong>Total Amount Due: <span class="total-amount">$${invoice?.totalAmount || '0.00'}</span></strong>
        </div>
        <div style="font-size: 14px; color: #666;">
          Payment Terms: Net 30 Days
        </div>
      </div>

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>For questions about this invoice, please contact us at billing@go4farms.com or (555) 123-4567</p>
      </div>
    </body>
    </html>
  `;
}

function generateTripNumber(): string {
  return `T${Math.floor(Math.random() * 90000) + 10000}`;
}

// Helper function to get file extension from content type
function getFileExtension(contentType?: string): string {
  if (!contentType) return 'pdf';
  
  const mimeToExt: { [key: string]: string } = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg', 
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf'
  };
  
  return mimeToExt[contentType.toLowerCase()] || 'pdf';
}

// POD template generation removed - only actual uploaded POD files are used for email attachments

// Generate complete package email HTML with all available documents
function generateCompletePackageEmailHTML(invoice: any, load: any, availableDocuments: any): string {
  const currentDate = new Date().toLocaleDateString();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Complete Package - Invoice ${invoice?.invoiceNumber || 'N/A'} - Load ${load?.number_109 || load?.number109 || 'N/A'}</title>
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          line-height: 1.4;
        }
        .email-header {
          background-color: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
          border-left: 5px solid #2d5aa0;
        }
        .package-summary {
          background-color: #e8f5e8;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
          margin-bottom: 30px;
          gap: 20px;
        }
        .company-info-section {
          text-align: center;
        }
        .company-name {
          font-size: 28px;
          font-weight: bold;
          color: #2d5aa0;
          margin-bottom: 5px;
        }
        .company-info {
          font-size: 14px;
          color: #666;
        }
        .section-title {
          font-size: 22px;
          font-weight: bold;
          color: #2d5aa0;
          margin: 30px 0 20px 0;
          text-align: center;
          padding-bottom: 10px;
          border-bottom: 2px solid #2d5aa0;
        }
        .details-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .details-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .details-table th,
        .details-table td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        .details-table th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .total-section {
          margin-top: 30px;
          text-align: right;
        }
        .total-amount {
          font-size: 20px;
          font-weight: bold;
          color: #2d5aa0;
        }
        .document-note {
          background-color: #fff3cd;
          border: 1px solid #ffeaa7;
          padding: 15px;
          border-radius: 6px;
          margin: 20px 0;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="email-header">
        <h2 style="margin: 0; color: #2d5aa0;">Complete Document Package</h2>
        <p style="margin: 10px 0 0 0; color: #666;">
          All available documents for Load ${load?.number_109 || load?.number109 || 'N/A'} - Invoice ${invoice?.invoiceNumber || 'N/A'}
        </p>
      </div>

      <div class="package-summary">
        <h3 style="margin: 0 0 10px 0; color: #155724;">📦 Package Contents:</h3>
        <ul style="margin: 0; padding-left: 20px;">
          ${availableDocuments.invoice ? '<li>✅ Invoice & Rate Confirmation (combined)</li>' : ''}
          ${availableDocuments.bolDocument ? '<li>✅ BOL Document (attached file available)</li>' : '<li>⚠️ BOL Document (not yet uploaded)</li>'}
          ${availableDocuments.podDocument ? '<li>✅ POD Document (attached file available)</li>' : '<li>⚠️ POD Document (not yet uploaded)</li>'}
        </ul>
      </div>

      <!-- RATE CONFIRMATION & INVOICE COMBINED SECTION -->
      <div class="header">
        <div class="company-info-section">
          <div class="company-name">GO 4 Farms & Cattle</div>
          <div class="company-info">
            1510 Crystal Valley Way<br>
            Melissa, TX 75454<br>
            Phone: 214-878-1230<br>
            Email: accounting@go4fc.com
          </div>
        </div>
      </div>

      <div class="section-title">RATE CONFIRMATION & INVOICE</div>

      <div class="details-section">
        <div>
          <div><strong>Load Number:</strong> ${load?.number109 || 'N/A'}</div>
          <div><strong>BOL Number:</strong> ${load?.bolNumber || 'N/A'}</div>
          <div><strong>Trip Number:</strong> ${load?.tripNumber || 'T' + Math.floor(Math.random() * 90000) + 10000}</div>
          <div><strong>Invoice Number:</strong> ${invoice?.invoiceNumber || 'N/A'}</div>
        </div>
        <div>
          <div><strong>Date:</strong> ${currentDate}</div>
          <div><strong>Status:</strong> ${invoice?.status || 'Pending'}</div>
          <div><strong>Driver:</strong> ${load?.driver ? `${load.driver.firstName} ${load.driver.lastName}` : 'N/A'}</div>
        </div>
      </div>

      <table class="details-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Transportation Service - Load ${load?.number_109 || load?.number109 || 'N/A'}</td>
            <td>${load?.origin || 'N/A'}</td>
            <td>${load?.destination || 'N/A'}</td>
            <td>$${invoice?.flatRate || '0.00'}</td>
          </tr>
          ${invoice?.lumperCharge && parseFloat(invoice.lumperCharge) > 0 ? `
          <tr>
            <td>Lumper Service Charge</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.lumperCharge}</td>
          </tr>
          ` : ''}
          ${invoice?.extraStopsCharge && parseFloat(invoice.extraStopsCharge) > 0 ? `
          <tr>
            <td>Extra Stops (${invoice.extraStopsCount || 0} stops @ $50 each)</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.extraStopsCharge}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="total-section">
        <div style="font-size: 20px; margin-bottom: 10px;">
          <strong>Total Amount Due: <span class="total-amount">$${invoice?.totalAmount || '0.00'}</span></strong>
        </div>
        <div style="font-size: 14px; color: #666;">
          Payment Terms: Net 30 Days
        </div>
      </div>

      ${(!availableDocuments.bolDocument || !availableDocuments.podDocument) ? `
      <div class="document-note">
        <strong>📋 Additional Documents:</strong>
        <p style="margin: 10px 0 0 0;">
          ${!availableDocuments.bolDocument ? 'BOL document will be provided when available. ' : ''}
          ${!availableDocuments.podDocument ? 'POD document will be provided upon delivery completion. ' : ''}
          ${availableDocuments.bolDocument && availableDocuments.podDocument ? 'All supporting documents are complete and available.' : ''}
        </p>
      </div>
      ` : ''}

      <div class="footer">
        <p><strong>Thank you for your business!</strong></p>
        <p>This email contains all currently available documents for this load.</p>
        <p>For questions about this shipment, please contact us at billing@go4farms.com or (214) 878-1230</p>
      </div>
    </body>
    </html>
  `;
}
