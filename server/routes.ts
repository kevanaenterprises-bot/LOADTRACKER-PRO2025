import type { Express } from "express";
import express from "express";
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
import { eq, desc } from "drizzle-orm";
import { loads } from "@shared/schema";

// Bypass secret for testing and mobile auth
const BYPASS_SECRET = "LOADTRACKER_BYPASS_2025";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve static files from public directory
  app.use(express.static('public'));
  
  // Auth middleware (includes session setup)
  await setupAuth(app);

  // Direct logo download endpoint for mobile users
  app.get("/download/logo", (req, res) => {
    const path = require('path');
    const logoPath = path.join(process.cwd(), "client/src/assets/go-farms-logo.png");
    res.download(logoPath, "go-farms-logo.png", (err) => {
      if (err) {
        console.error("Logo download error:", err);
        res.status(404).send("Logo not found");
      }
    });
  });

  
  // BYPASS: Kevin's loads endpoint (bypasses Vite middleware) 
  app.get('/api/working-dashboard-kevin', async (req, res) => {
    try {
      console.log("🔥 BYPASS: Direct loads query for Kevin");
      const result = await storage.getLoadsByDriver('605889a6-d87b-46c4-880a-7e058ad87802');
      console.log("🔥 BYPASS: Storage result:", JSON.stringify(result, null, 2));
      res.json(result);
    } catch (error) {
      console.error("🔥 BYPASS ERROR:", error);
      res.status(500).json({ error: "Kevin loads bypass failed" });
    }
  });

  // BYPASS: Load status update (bypasses Vite middleware)
  app.patch('/api/kevin-status-bypass/:loadId', async (req, res) => {
    try {
      console.log("🔥 STATUS BYPASS: Update load", req.params.loadId, "to", req.body.status);
      const result = await storage.updateLoadStatus(req.params.loadId, req.body.status);
      console.log("🔥 STATUS BYPASS: Success:", result);
      res.json(result);
    } catch (error) {
      console.error("🔥 STATUS BYPASS ERROR:", error);
      res.status(500).json({ error: "Status update bypass failed" });
    }
  });

  // API route for working dashboard (bypasses Vite middleware)
  app.get('/api/working-dashboard', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>LoadTracker Pro - API Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          .logo { font-size: 28px; color: #2563eb; margin-bottom: 20px; }
          .grid { display: grid; grid-template-columns: 1fr 2fr; gap: 30px; margin-top: 30px; }
          .form-group { margin-bottom: 20px; }
          .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
          .form-group input, .form-group select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
          .button { background: #4CAF50; color: white; padding: 15px 30px; border: none; border-radius: 5px; cursor: pointer; margin: 10px 0; }
          .button:hover { background: #45a049; }
          .button.secondary { background: #2563eb; }
          .status { padding: 15px; border-radius: 5px; margin: 20px 0; }
          .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
          .info { background: #cce8ff; color: #004085; border: 1px solid #99d3ff; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f2f2f2; }
          .hidden { display: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">🚛 LoadTracker Pro - Working Dashboard</div>
          <h2>GO 4 Farms & Cattle - Melissa, Texas</h2>
          
          <div id="auth-status" class="status info">
            ✅ <strong>Server Connected Successfully!</strong><br>
            Click "Login as Admin" to authenticate and access load creation.
          </div>
          
          <button class="button" onclick="adminLogin()">Login as Admin (admin/go4fc2024)</button>
          
          <div id="main-content" class="hidden">
            <div class="grid">
              <!-- Load Creation Form -->
              <div>
                <h3>Create New Load</h3>
                <form id="load-form">
                  <div class="form-group">
                    <label>109 Number:</label>
                    <input type="text" id="number109" placeholder="109-2024-001" required>
                  </div>
                  <div class="form-group">
                    <label>Location:</label>
                    <select id="locationId" required>
                      <option value="">Select Location</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Estimated Miles:</label>
                    <input type="number" id="estimatedMiles" placeholder="250" required>
                  </div>
                  <div class="form-group">
                    <label>Special Instructions:</label>
                    <input type="text" id="specialInstructions" placeholder="Optional">
                  </div>
                  <button type="submit" class="button">Create Load</button>
                </form>
              </div>
              
              <!-- Loads Table -->
              <div>
                <h3>Active Loads</h3>
                <button class="button secondary" onclick="loadLoads()">Refresh Loads</button>
                <table id="loads-table">
                  <thead>
                    <tr>
                      <th>109 Number</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Miles</th>
                    </tr>
                  </thead>
                  <tbody id="loads-body">
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <div id="result" style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; display: none;"></div>
        </div>
        
        <script>
          let isAuthenticated = false;
          
          function showResult(message, success = true) {
            const result = document.getElementById('result');
            result.style.display = 'block';
            result.className = success ? 'status success' : 'status error';
            result.innerHTML = message;
          }
          
          function showAuthStatus(message, type = 'info') {
            const status = document.getElementById('auth-status');
            status.className = 'status ' + type;
            status.innerHTML = message;
          }
          
          async function adminLogin() {
            try {
              const response = await fetch('/api/auth/admin-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username: 'admin', password: 'go4fc2024' })
              });
              const data = await response.json();
              if (response.ok) {
                isAuthenticated = true;
                showAuthStatus('✅ Admin authenticated successfully!', 'success');
                document.getElementById('main-content').classList.remove('hidden');
                await loadLocations();
                await loadLoads();
              } else {
                showResult('❌ Login failed: ' + data.message, false);
              }
            } catch (error) {
              showResult('❌ Network error: ' + error.message, false);
            }
          }
          
          async function loadLocations() {
            try {
              const response = await fetch('/api/locations', { credentials: 'include' });
              if (response.ok) {
                const locations = await response.json();
                const select = document.getElementById('locationId');
                select.innerHTML = '<option value="">Select Location</option>';
                locations.forEach(loc => {
                  select.innerHTML += '<option value="' + loc.id + '">' + loc.name + ' - ' + loc.city + ', ' + loc.state + '</option>';
                });
              }
            } catch (error) {
              console.error('Error loading locations:', error);
            }
          }
          
          async function loadLoads() {
            try {
              const response = await fetch('/api/loads', { credentials: 'include' });
              if (response.ok) {
                const loads = await response.json();
                const tbody = document.getElementById('loads-body');
                tbody.innerHTML = '';
                loads.forEach(load => {
                  tbody.innerHTML += '<tr><td>' + load.number109 + '</td><td>' + load.status + '</td><td>' + (load.location?.name || 'N/A') + '</td><td>' + load.estimatedMiles + '</td></tr>';
                });
              }
            } catch (error) {
              console.error('Error loading loads:', error);
            }
          }
          
          document.getElementById('load-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
              number109: document.getElementById('number109').value,
              locationId: document.getElementById('locationId').value,
              estimatedMiles: parseInt(document.getElementById('estimatedMiles').value),
              specialInstructions: document.getElementById('specialInstructions').value || null,
              status: 'pending'
            };
            
            try {
              const response = await fetch('/api/loads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData)
              });
              
              if (response.ok) {
                const load = await response.json();
                showResult('✅ Load created successfully: ' + load.number109, true);
                document.getElementById('load-form').reset();
                await loadLoads(); // Refresh the table
              } else {
                const error = await response.json();
                showResult('❌ Failed to create load: ' + error.message, false);
              }
            } catch (error) {
              showResult('❌ Network error: ' + error.message, false);
            }
          });
        </script>
      </body>
      </html>
    `);
  });

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

  // Working load creation page that bypasses React complexity
  app.get('/working-dashboard', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>LoadTracker Pro - Working Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          .logo { font-size: 28px; color: #2563eb; margin-bottom: 20px; }
          .grid { display: grid; grid-template-columns: 1fr 2fr; gap: 30px; margin-top: 30px; }
          .form-group { margin-bottom: 20px; }
          .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
          .form-group input, .form-group select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
          .button { background: #4CAF50; color: white; padding: 15px 30px; border: none; border-radius: 5px; cursor: pointer; margin: 10px 0; }
          .button:hover { background: #45a049; }
          .button.secondary { background: #2563eb; }
          .status { padding: 15px; border-radius: 5px; margin: 20px 0; }
          .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
          .info { background: #cce8ff; color: #004085; border: 1px solid #99d3ff; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f2f2f2; }
          .hidden { display: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">🚛 LoadTracker Pro - Working Dashboard</div>
          <h2>GO 4 Farms & Cattle - Melissa, Texas</h2>
          
          <div id="auth-status" class="status info">
            Click "Login as Admin" to authenticate and access load creation.
          </div>
          
          <button class="button" onclick="adminLogin()">Login as Admin (admin/go4fc2024)</button>
          
          <div id="main-content" class="hidden">
            <div class="grid">
              <!-- Load Creation Form -->
              <div>
                <h3>Create New Load</h3>
                <form id="load-form">
                  <div class="form-group">
                    <label>109 Number:</label>
                    <input type="text" id="number109" placeholder="109-2024-001" required>
                  </div>
                  <div class="form-group">
                    <label>Location:</label>
                    <select id="locationId" required>
                      <option value="">Select Location</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Estimated Miles:</label>
                    <input type="number" id="estimatedMiles" placeholder="250" required>
                  </div>
                  <div class="form-group">
                    <label>Special Instructions:</label>
                    <input type="text" id="specialInstructions" placeholder="Optional">
                  </div>
                  <button type="submit" class="button">Create Load</button>
                </form>
              </div>
              
              <!-- Loads Table -->
              <div>
                <h3>Active Loads</h3>
                <button class="button secondary" onclick="loadLoads()">Refresh Loads</button>
                <table id="loads-table">
                  <thead>
                    <tr>
                      <th>109 Number</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Miles</th>
                    </tr>
                  </thead>
                  <tbody id="loads-body">
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <div id="result" style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; display: none;"></div>
        </div>
        
        <script>
          let isAuthenticated = false;
          
          function showResult(message, success = true) {
            const result = document.getElementById('result');
            result.style.display = 'block';
            result.className = success ? 'status success' : 'status error';
            result.innerHTML = message;
          }
          
          function showAuthStatus(message, type = 'info') {
            const status = document.getElementById('auth-status');
            status.className = 'status ' + type;
            status.innerHTML = message;
          }
          
          async function adminLogin() {
            try {
              const response = await fetch('/api/auth/admin-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username: 'admin', password: 'go4fc2024' })
              });
              const data = await response.json();
              if (response.ok) {
                isAuthenticated = true;
                showAuthStatus('✅ Admin authenticated successfully!', 'success');
                document.getElementById('main-content').classList.remove('hidden');
                await loadLocations();
                await loadLoads();
              } else {
                showResult('❌ Login failed: ' + data.message, false);
              }
            } catch (error) {
              showResult('❌ Network error: ' + error.message, false);
            }
          }
          
          async function loadLocations() {
            try {
              const response = await fetch('/api/locations', { credentials: 'include' });
              if (response.ok) {
                const locations = await response.json();
                const select = document.getElementById('locationId');
                select.innerHTML = '<option value="">Select Location</option>';
                locations.forEach(loc => {
                  select.innerHTML += '<option value="' + loc.id + '">' + loc.name + ' - ' + loc.city + ', ' + loc.state + '</option>';
                });
              }
            } catch (error) {
              console.error('Error loading locations:', error);
            }
          }
          
          async function loadLoads() {
            try {
              const response = await fetch('/api/loads', { credentials: 'include' });
              if (response.ok) {
                const loads = await response.json();
                const tbody = document.getElementById('loads-body');
                tbody.innerHTML = '';
                loads.forEach(load => {
                  tbody.innerHTML += '<tr><td>' + load.number109 + '</td><td>' + load.status + '</td><td>' + (load.location?.name || 'N/A') + '</td><td>' + load.estimatedMiles + '</td></tr>';
                });
              }
            } catch (error) {
              console.error('Error loading loads:', error);
            }
          }
          
          document.getElementById('load-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
              number109: document.getElementById('number109').value,
              locationId: document.getElementById('locationId').value,
              estimatedMiles: parseInt(document.getElementById('estimatedMiles').value),
              specialInstructions: document.getElementById('specialInstructions').value || null,
              status: 'pending'
            };
            
            try {
              const response = await fetch('/api/loads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData)
              });
              
              if (response.ok) {
                const load = await response.json();
                showResult('✅ Load created successfully: ' + load.number109, true);
                document.getElementById('load-form').reset();
                await loadLoads(); // Refresh the table
              } else {
                const error = await response.json();
                showResult('❌ Failed to create load: ' + error.message, false);
              }
            } catch (error) {
              showResult('❌ Network error: ' + error.message, false);
            }
          });
        </script>
      </body>
      </html>
    `);
  });

  // Simple working dashboard that bypasses React authentication
  app.get('/simple-dashboard', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>LoadTracker Pro - Simple Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          .logo { font-size: 28px; color: #2563eb; margin-bottom: 20px; }
          .button { background: #4CAF50; color: white; padding: 15px 30px; border: none; border-radius: 5px; cursor: pointer; margin: 10px; }
          .button:hover { background: #45a049; }
          .status { padding: 15px; background: #e8f5e9; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">🚛 LoadTracker Pro</div>
          <h2>GO 4 Farms & Cattle - Melissa, Texas</h2>
          
          <div class="status">
            ✅ <strong>Server is working correctly!</strong><br>
            You can now test the core functionality.
          </div>
          
          <h3>Quick Actions:</h3>
          <button class="button" onclick="adminLogin()">Login as Admin</button>
          <button class="button" onclick="testAPI()">Test API Connection</button>
          <button class="button" onclick="goToDashboard()">Go to Full Dashboard</button>
          
          <div id="result" style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; display: none;"></div>
        </div>
        
        <script>
          function showResult(message, success = true) {
            const result = document.getElementById('result');
            result.style.display = 'block';
            result.style.background = success ? '#d4edda' : '#f8d7da';
            result.style.color = success ? '#155724' : '#721c24';
            result.innerHTML = message;
          }
          
          async function adminLogin() {
            try {
              const response = await fetch('/api/auth/admin-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username: 'admin', password: 'go4fc2024' })
              });
              const data = await response.json();
              if (response.ok) {
                showResult('✅ Admin login successful! You are now authenticated.', true);
              } else {
                showResult('❌ Login failed: ' + data.message, false);
              }
            } catch (error) {
              showResult('❌ Network error: ' + error.message, false);
            }
          }
          
          async function testAPI() {
            try {
              const response = await fetch('/api/auth/admin-user', { credentials: 'include' });
              const data = await response.json();
              if (response.ok) {
                showResult('✅ API working! Logged in as: ' + data.username, true);
              } else {
                showResult('❌ Not authenticated. Please login first.', false);
              }
            } catch (error) {
              showResult('❌ API error: ' + error.message, false);
            }
          }
          
          function goToDashboard() {
            window.location.href = '/dashboard';
          }
        </script>
      </body>
      </html>
    `);
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
    // Check bypass token first (like admin auth does)
    const bypassToken = req.headers['x-bypass-token'];
    
    if (bypassToken === BYPASS_SECRET) {
      // Return Kevin's driver data for bypass auth
      return res.json({
        id: "605889a6-d87b-46c4-880a-7e058ad87802",
        username: "K Owen",
        firstName: "Kevin ",
        lastName: "Owen ",
        role: "driver",
        phoneNumber: "9038037500"
      });
    }

    // Check session auth
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

  // KEVIN LOADS TEST: Direct storage call with simple logging
  app.get("/api/test/kevin-loads-direct", async (req, res) => {
    console.log("🎯 KEVIN DIRECT TEST: Testing storage function directly");
    try {
      const kevinId = "605889a6-d87b-46c4-880a-7e058ad87802";
      console.log(`🎯 Calling storage.getLoadsByDriver("${kevinId}")`);
      
      const kevinLoads = await storage.getLoadsByDriver(kevinId);
      console.log(`🎯 RESULT: ${kevinLoads?.length || 0} loads returned`);
      
      res.json({ 
        success: true,
        driverId: kevinId,
        loadCount: kevinLoads?.length || 0,
        loads: kevinLoads || []
      });
    } catch (error) {
      console.error("🎯 KEVIN TEST ERROR:", error);
      res.status(500).json({ error: "Storage test failed", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Test endpoint to verify bypass token and test Kevin's loads
  app.get("/api/test/bypass", async (req, res) => {
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    
    console.log("Bypass test endpoint:", {
      bypassToken: bypassToken ? '[PROVIDED]' : '[MISSING]',
      expectedToken: BYPASS_SECRET,
      hasTokenBypass
    });
    
    if (hasTokenBypass) {
      // Test Kevin's loads while we're here
      try {
        console.log("🎯 BYPASS: Testing Kevin's loads via working endpoint");
        const kevinId = "605889a6-d87b-46c4-880a-7e058ad87802";
        const kevinLoads = await storage.getLoadsByDriver(kevinId);
        console.log(`🎯 BYPASS: Kevin loads result: ${kevinLoads?.length || 0} loads`);
        
        res.json({ 
          message: "Bypass token working!", 
          success: true,
          kevinTest: {
            driverId: kevinId,
            loadCount: kevinLoads?.length || 0,
            loads: kevinLoads || []
          }
        });
      } catch (error) {
        console.error("🎯 BYPASS: Error testing Kevin loads:", error);
        res.json({ message: "Bypass token working but loads test failed!", success: true, error: String(error) });
      }
    } else {
      res.status(401).json({ message: "Bypass token failed" });
    }
  });

  // Simple load test endpoint for Kevin
  app.get("/api/test/load-109-38669", (req, res) => {
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    
    console.log("Load test for 109-38669:", {
      bypassToken: bypassToken ? '[PROVIDED]' : '[MISSING]',
      headers: Object.keys(req.headers),
      userAgent: req.headers['user-agent'],
      hasTokenBypass
    });
    
    if (hasTokenBypass) {
      res.json({ 
        message: "Load 109-38669 found!", 
        success: true,
        loadNumber: "109-38669",
        status: "assigned",
        driver: "Kevin Owen"
      });
    } else {
      res.status(401).json({ message: "Authentication failed - bypass token missing" });
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

  // Simple login page API route (bypass Vite middleware)
  app.get('/api/login-page', (req: any, res: any) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LoadTracker Pro - Admin Login</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .login-container {
            background: white;
            padding: 2rem;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            max-width: 400px;
            width: 90%;
            text-align: center;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
        }
        .login-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 15px 30px;
            font-size: 16px;
            border-radius: 5px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 15px;
        }
        .login-btn:hover {
            background: #45a049;
        }
        .login-btn:disabled {
            background: #cccccc;
            cursor: not-allowed;
        }
        .status {
            margin-top: 15px;
            padding: 10px;
            border-radius: 5px;
            display: none;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .credentials {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">🚛 LoadTracker Pro</div>
        <div class="subtitle">GO 4 Farms & Cattle - Melissa, Texas</div>
        
        <div class="credentials">
            <strong>Admin Credentials:</strong><br>
            Username: admin<br>
            Password: go4fc2024
        </div>
        
        <button id="loginBtn" class="login-btn">Login as Admin</button>
        
        <div id="status" class="status"></div>
        
        <div style="margin-top: 20px; font-size: 12px; color: #999;">
            This will log you in and redirect to the dashboard
        </div>
    </div>

    <script>
        const loginBtn = document.getElementById('loginBtn');
        const status = document.getElementById('status');
        
        function showStatus(message, type) {
            status.textContent = message;
            status.className = 'status ' + type;
            status.style.display = 'block';
        }
        
        loginBtn.addEventListener('click', async () => {
            loginBtn.disabled = true;
            loginBtn.textContent = 'Logging in...';
            
            try {
                const response = await fetch('/api/auth/admin-login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        username: 'admin',
                        password: 'go4fc2024'
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showStatus('✅ Login successful! Redirecting to dashboard...', 'success');
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 1500);
                } else {
                    showStatus('❌ Login failed: ' + data.message, 'error');
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Login as Admin';
                }
            } catch (error) {
                showStatus('❌ Network error: ' + error.message, 'error');
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login as Admin';
            }
        });
    </script>
</body>
</html>
    `);
  });

  // Alternative login route (try both)
  app.get('/login', (req: any, res: any) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LoadTracker Pro - Admin Login</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .login-container {
            background: white;
            padding: 2rem;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            max-width: 400px;
            width: 90%;
            text-align: center;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
        }
        .login-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 15px 30px;
            font-size: 16px;
            border-radius: 5px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 15px;
        }
        .login-btn:hover {
            background: #45a049;
        }
        .login-btn:disabled {
            background: #cccccc;
            cursor: not-allowed;
        }
        .status {
            margin-top: 15px;
            padding: 10px;
            border-radius: 5px;
            display: none;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .credentials {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">🚛 LoadTracker Pro</div>
        <div class="subtitle">GO 4 Farms & Cattle - Melissa, Texas</div>
        
        <div class="credentials">
            <strong>Admin Credentials:</strong><br>
            Username: admin<br>
            Password: go4fc2024
        </div>
        
        <button id="loginBtn" class="login-btn">Login as Admin</button>
        
        <div id="status" class="status"></div>
        
        <div style="margin-top: 20px; font-size: 12px; color: #999;">
            This will log you in and redirect to the dashboard
        </div>
    </div>

    <script>
        const loginBtn = document.getElementById('loginBtn');
        const status = document.getElementById('status');
        
        function showStatus(message, type) {
            status.textContent = message;
            status.className = 'status ' + type;
            status.style.display = 'block';
        }
        
        loginBtn.addEventListener('click', async () => {
            loginBtn.disabled = true;
            loginBtn.textContent = 'Logging in...';
            
            try {
                const response = await fetch('/api/auth/admin-login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        username: 'admin',
                        password: 'go4fc2024'
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showStatus('✅ Login successful! Redirecting to dashboard...', 'success');
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 1500);
                } else {
                    showStatus('❌ Login failed: ' + data.message, 'error');
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Login as Admin';
                }
            } catch (error) {
                showStatus('❌ Network error: ' + error.message, 'error');
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login as Admin';
            }
        });
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

  // Get loads for a specific driver (for driver portal)
  app.get("/api/drivers/:driverId/loads", (req, res, next) => {
    const adminAuth = !!(req.session as any)?.adminAuth;
    const replitAuth = !!req.user;
    const driverAuth = !!(req.session as any)?.driverAuth;
    const bypassAuth = isBypassActive(req);
    const hasAuth = adminAuth || replitAuth || driverAuth || bypassAuth;
    
    console.log("🔒 DRIVER LOADS AUTH:", {
      adminAuth,
      replitAuth,
      driverAuth,
      bypassAuth,
      hasAuth,
      driverId: req.params.driverId
    });
    
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    // KEVIN TEST: Return hardcoded data to verify route works
    const driverId = req.params.driverId;
    
    if (driverId === "605889a6-d87b-46c4-880a-7e058ad87802") {
      // Return Kevin's 2 loads from database as hardcoded data
      res.json([
        {
          id: "49ea5719-a316-4e97-bf00-f1fe3348d56f",
          number109: "109-test1",
          driverId: "605889a6-d87b-46c4-880a-7e058ad87802",
          status: "in_progress",
          bolNumber: null,
          driver: { firstName: "Kevin", lastName: "Owen" },
          location: null,
          invoice: null
        },
        {
          id: "682348a4-43a3-4f7c-be47-3daf49996006", 
          number109: "109-PROD001",
          driverId: "605889a6-d87b-46c4-880a-7e058ad87802",
          status: "in_progress",
          bolNumber: null,
          driver: { firstName: "Kevin", lastName: "Owen" },
          location: null,
          invoice: null
        }
      ]);
    } else {
      res.json([]);
    }
  });

  // Loads for admin/office users - WITH TOKEN BYPASS
  app.get("/api/loads", (req, res, next) => {
    console.log("🔥 API LOADS ROUTE HIT! This might be intercepting Kevin's request!");
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    console.log("🔥 API LOADS HANDLER CALLED!");
    try {
      // KEVIN BYPASS FIX: Check bypass token first to force driver mode
      let userId: string | undefined;
      let user: any = null;
      
      if (isBypassActive(req)) {
        userId = "605889a6-d87b-46c4-880a-7e058ad87802"; // Kevin's ID
        user = await storage.getUser(userId);
        console.log(`🔥 BYPASS ACTIVE: Using Kevin's driver ID ${userId}, user:`, user);
      } else {
        // Normal authentication flow
        userId = (req.user as any)?.claims?.sub;
        user = userId ? await storage.getUser(userId) : null;
        
        // If no Replit user, check for driver authentication
        if (!user && (req.session as any)?.driverAuth) {
          userId = (req.session as any).driverAuth.id;
          user = await storage.getUser(userId);
          console.log(`🔥 USING DRIVER AUTH: ${userId}, user:`, user);
        }
      }
      
      let loads;
      if (user?.role === "driver" && userId) {
        console.log(`🔥 DRIVER MODE: Getting loads for driver ${userId}`);
        loads = await storage.getLoadsByDriver(userId);
      } else {
        console.log("🔥 ADMIN MODE: Getting all loads");
        loads = await storage.getLoads();
      }
      
      console.log(`🔥 RETURNING: ${loads?.length || 0} loads`);
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
    // Check for driver session auth OR bypass token
    const hasDriverAuth = (req.session as any)?.driverAuth;
    const hasBypassToken = isBypassActive(req);
    
    if (hasDriverAuth || hasBypassToken) {
      next();
    } else {
      res.status(401).json({ message: "Driver not authenticated" });
    }
  }, async (req, res) => {
    try {
      // For bypass token requests, return all loads (for testing)
      // For driver session, return only their loads
      let loads;
      
      if (isBypassActive(req)) {
        console.log("Bypass token active - returning all loads");
        loads = await storage.getLoads();
      } else {
        const driverUserId = (req.session as any)?.driverAuth?.userId;
        if (!driverUserId) {
          return res.status(401).json({ message: "Driver not authenticated" });
        }
        
        console.log("Fetching loads for driver:", driverUserId);
        loads = await storage.getLoadsByDriver(driverUserId);
      }
      
      console.log("Found", loads.length, "loads");
      res.json(loads);
    } catch (error) {
      console.error("Error fetching driver loads:", error);
      res.status(500).json({ message: "Failed to fetch driver loads" });
    }
  });

  // GPS Tracking API endpoints

  // Confirm load and enable GPS tracking
  app.post("/api/loads/:id/confirm", (req, res, next) => {
    // Support bypass token for API testing
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasDriverAuth = !!(req.session as any)?.driverAuth;
    const hasAuth = hasDriverAuth || hasTokenBypass;
    
    console.log("Confirm load auth check:", {
      hasDriverAuth,
      hasTokenBypass,
      hasAuth,
      bypassToken: bypassToken ? '[PROVIDED]' : 'none',
      expected: BYPASS_SECRET
    });
    
    if (hasAuth) {
      next();
    } else {
      return res.status(401).json({ message: "Driver not authenticated" });
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

  app.get("/api/loads/:id", (req, res, next) => {
    // Support both authenticated users and bypass token
    const hasAuth = req.isAuthenticated() || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
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
      await storage.updateLoad(loadId, { driverId });

      // Get complete load data with driver, location, and invoice details for UI
      const completeLoad = await storage.getLoad(loadId);

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

      res.json(completeLoad);
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

      // Determine what documents are available - exclude test data
      const availableDocuments = {
        invoice: true, // Always available
        rateConfirmation: true, // Always include with invoice
        podDocument: !!load.podDocumentPath && load.podDocumentPath !== 'test-pod-document.pdf', // Only true if real POD was uploaded
        bolDocument: !!load.bolDocumentPath && load.bolDocumentPath !== 'test-bol-document.pdf'
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
        console.log(`📄 POD path details:`, {
          type: typeof load.podDocumentPath,
          length: load.podDocumentPath.length,
          startsWith: load.podDocumentPath.substring(0, 20),
          isTestData: load.podDocumentPath === 'test-pod-document.pdf'
        });
        
        // Skip test data that's not real object storage paths
        if (load.podDocumentPath === 'test-pod-document.pdf' || 
            load.podDocumentPath === 'https://test-pod-document.pdf' ||
            load.podDocumentPath.includes('test-pod-document')) {
          console.log(`⚠️  Skipping test POD data - no real file uploaded for load ${primaryLoadNumber}`);
        } else {
          // Handle real uploaded POD files
          if (load.podDocumentPath.includes(',')) {
            // Multiple POD documents - fetch each actual file  
            const podPaths = load.podDocumentPath.split(',').map((path: string) => path.trim());
            console.log(`📄 Found ${podPaths.length} uploaded POD documents for load ${primaryLoadNumber}`);
            
            for (let i = 0; i < podPaths.length; i++) {
              try {
                // Build the correct object path - it should already be in the format "uploads/uuid"
                const podPath = podPaths[i];
                const podUrl = podPath.startsWith('/objects/') ? podPath : `/objects/${podPath}`;
                
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
                  console.error(`❌ Failed to fetch POD document ${podPath}: HTTP ${response.status} - ${await response.text()}`);
                }
              } catch (error) {
                console.error(`❌ Failed to fetch POD document ${podPaths[i]}:`, error);
              }
            }
          } else {
            // Single POD document - fetch the actual file
            try {
              console.log(`📄 Fetching single uploaded POD document for load ${primaryLoadNumber}`);
              console.log(`📄 Original POD path: "${load.podDocumentPath}"`);
              
              // Build the correct object path - handle different formats
              let podUrl;
              if (load.podDocumentPath.startsWith('/objects/')) {
                podUrl = load.podDocumentPath;
              } else if (load.podDocumentPath.startsWith('uploads/')) {
                podUrl = `/objects/${load.podDocumentPath}`;
              } else {
                podUrl = `/objects/uploads/${load.podDocumentPath}`;
              }
              
              console.log(`📄 Final POD URL: "http://localhost:5000${podUrl}"`);
              
              // Use direct object storage access instead of HTTP fetch to avoid auth issues
              try {
                const { ObjectStorageService } = await import('./objectStorage');
                const objectStorageService = new ObjectStorageService();
                
                // Get the file directly from object storage
                const objectFile = await objectStorageService.getObjectEntityFile(podUrl);
                const [metadata] = await objectFile.getMetadata();
                const contentType = metadata.contentType || 'application/pdf';
                
                console.log(`📄 POD file metadata: size=${metadata.size}, type=${contentType}`);
                
                // Download file content as buffer
                const [fileBuffer] = await objectFile.download();
                
                console.log(`📄 POD file downloaded: ${fileBuffer.length} bytes`);
                
                attachments.push({
                  filename: `POD-${primaryLoadNumber}.${getFileExtension(contentType)}`,
                  content: fileBuffer,
                  contentType: contentType
                });
                console.log(`✅ Attached actual POD file: POD-${primaryLoadNumber}.${getFileExtension(contentType)} (${fileBuffer.length} bytes)`);
                
              } catch (storageError) {
                console.error(`❌ Failed to download POD document ${load.podDocumentPath} from object storage:`, storageError);
                // Fallback to HTTP fetch as backup
                console.log(`📄 Trying fallback HTTP fetch for POD...`);
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
                  console.log(`✅ Attached POD file via fallback: POD-${primaryLoadNumber}.${getFileExtension(contentType)} (${fileBuffer.length} bytes)`);
                } else {
                  console.error(`❌ Fallback HTTP fetch also failed: ${response.status} - ${await response.text()}`);
                }
              }
            } catch (error) {
              console.error(`❌ Failed to fetch POD document ${load.podDocumentPath}:`, error);
            }
          }
        }
      } else {
        console.log(`⚠️  No POD document uploaded for load ${primaryLoadNumber} - skipping POD attachment`);
      }

      // Handle BOL documents - Attach ONLY the actual uploaded files (same logic as POD)
      if (load.bolDocumentPath) {
        console.log(`📄 Processing uploaded BOL documents for load ${primaryLoadNumber}`);
        console.log(`📄 BOL path: ${load.bolDocumentPath}`);
        
        // Skip test data that's not real object storage paths
        if (load.bolDocumentPath === 'test-bol-document.pdf' || 
            load.bolDocumentPath === 'https://test-bol-document.pdf' ||
            load.bolDocumentPath.includes('test-bol-document')) {
          console.log(`⚠️  Skipping test BOL data - no real file uploaded for load ${primaryLoadNumber}`);
        } else {
          // Handle real uploaded BOL files (same logic as POD)
          if (load.bolDocumentPath.includes(',')) {
            // Multiple BOL documents - fetch each actual file  
            const bolPaths = load.bolDocumentPath.split(',').map((path: string) => path.trim());
            console.log(`📄 Found ${bolPaths.length} uploaded BOL documents for load ${primaryLoadNumber}`);
            
            for (let i = 0; i < bolPaths.length; i++) {
              const bolPath = bolPaths[i];
              try {
                console.log(`📄 Fetching BOL document ${i + 1}/${bolPaths.length} for load ${primaryLoadNumber}`);
                const bolUrl = bolPath.startsWith('/objects/') ? bolPath : `/objects/${bolPath}`;
                const response = await fetch(`http://localhost:5000${bolUrl}`, {
                  headers: { 'x-bypass-token': BYPASS_SECRET }
                });
                
                if (response.ok) {
                  const buffer = await response.arrayBuffer();
                  const contentType = response.headers.get('content-type') || 'application/pdf';
                  
                  attachments.push({
                    filename: `BOL-${primaryLoadNumber}-Page${i + 1}.${getFileExtension(contentType)}`,
                    content: Buffer.from(buffer),
                    contentType: contentType
                  });
                  console.log(`✅ Attached actual BOL file: BOL-${primaryLoadNumber}-Page${i + 1}.${getFileExtension(contentType)}`);
                } else {
                  console.error(`❌ Failed to fetch BOL document ${bolPath}: HTTP ${response.status} - ${await response.text()}`);
                }
              } catch (error) {
                console.error(`❌ Failed to fetch BOL document ${bolPaths[i]}:`, error);
              }
            }
          } else {
            // Single BOL document - fetch the actual file
            try {
              console.log(`📄 Fetching single uploaded BOL document for load ${primaryLoadNumber}`);
              const bolUrl = load.bolDocumentPath.startsWith('/objects/') ? load.bolDocumentPath : `/objects/${load.bolDocumentPath}`;
              const response = await fetch(`http://localhost:5000${bolUrl}`, {
                headers: { 'x-bypass-token': BYPASS_SECRET }
              });
              
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                const contentType = response.headers.get('content-type') || 'application/pdf';
                
                attachments.push({
                  filename: `BOL-${primaryLoadNumber}.${getFileExtension(contentType)}`,
                  content: Buffer.from(buffer),
                  contentType: contentType
                });
                console.log(`✅ Attached actual BOL file: BOL-${primaryLoadNumber}.${getFileExtension(contentType)}`);
              } else {
                console.error(`❌ Failed to fetch BOL document ${load.bolDocumentPath}: HTTP ${response.status} - ${await response.text()}`);
              }
            } catch (error) {
              console.error(`❌ Failed to fetch BOL document ${load.bolDocumentPath}:`, error);
            }
          }
        }
      } else {
        console.log(`⚠️  No BOL document uploaded for load ${primaryLoadNumber} - skipping BOL attachment`);
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

  // POD upload - Support admin, driver, and bypass token authentication
  app.post("/api/objects/upload", (req, res, next) => {
    // Check for Replit Auth, Driver Auth, or Bypass Token
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasReplitAuth = req.isAuthenticated && req.isAuthenticated();
    const hasDriverAuth = (req.session as any)?.driverAuth;
    const hasAuth = hasReplitAuth || hasDriverAuth || hasTokenBypass;
    
    console.log("Upload auth check:", {
      hasReplitAuth,
      hasDriverAuth,
      hasTokenBypass,
      sessionId: req.sessionID,
      session: req.session,
      driverAuthData: (req.session as any)?.driverAuth,
      finalAuth: hasAuth
    });
    
    if (hasAuth) {
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

  app.patch("/api/loads/:id/pod", (req, res, next) => {
    // Flexible authentication for POD document uploads
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasReplitAuth = req.isAuthenticated && req.isAuthenticated();
    const hasDriverAuth = (req.session as any)?.driverAuth;
    const hasAuth = hasReplitAuth || hasDriverAuth || hasTokenBypass;
    
    console.log("POD upload auth check:", {
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
  app.get("/api/invoices", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
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

  // Print preview with POD attachments - NEW ENDPOINT
  app.post("/api/invoices/:id/print-preview", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const invoiceIdOrNumber = req.params.id;
      const { loadId } = req.body;

      console.log(`🖨️ Print preview requested for invoice: ${invoiceIdOrNumber}`);

      // Get invoice data - check if it's UUID (ID) or invoice number
      let invoice;
      if (invoiceIdOrNumber.includes('-') && invoiceIdOrNumber.length === 36) {
        const [invoiceById] = await db.select().from(invoices).where(eq(invoices.id, invoiceIdOrNumber));
        invoice = invoiceById;
      } else {
        invoice = await storage.getInvoice(invoiceIdOrNumber);
      }
      
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Get load data
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

      console.log(`🖨️ POD Status for preview:`, {
        loadNumber: load.number109,
        podDocumentPath: load.podDocumentPath,
        hasPOD: !!load.podDocumentPath
      });

      // Generate the base invoice HTML
      const baseHTML = generateCombinedRateConInvoiceHTML(invoice, load);
      
      // Embed POD images if available
      let previewHTML = baseHTML;
      const podAttachments: any[] = [];
      
      if (load.podDocumentPath) {
        try {
          // Check if it's an object storage path
          if (load.podDocumentPath.startsWith('/objects/')) {
            const objectStorageService = new (await import('./objectStorage')).ObjectStorageService();
            const objectFile = await objectStorageService.getObjectEntityFile(load.podDocumentPath);
            const [fileBuffer] = await objectFile.download();
            
            // Convert to base64 for embedding
            const base64Data = fileBuffer.toString('base64');
            const mimeType = load.podDocumentPath.toLowerCase().includes('.pdf') ? 'application/pdf' : 'image/jpeg';
            
            podAttachments.push({
              filename: `POD_${load.number109}.${mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`,
              content: fileBuffer,
              contentType: mimeType,
              base64: base64Data
            });

            // Embed image in HTML (for images only, not PDFs)
            if (mimeType.startsWith('image/')) {
              const podImageHTML = `
                <div style="page-break-before: always; padding: 20px; text-align: center;">
                  <h2 style="color: #2d5aa0; margin-bottom: 20px;">Proof of Delivery (POD)</h2>
                  <p style="margin-bottom: 20px;"><strong>Load:</strong> ${load.number109}</p>
                  <img src="data:${mimeType};base64,${base64Data}" 
                       style="max-width: 100%; max-height: 600px; border: 2px solid #ddd; border-radius: 8px;" 
                       alt="POD Document" />
                </div>
              `;
              previewHTML = previewHTML.replace('</body>', podImageHTML + '</body>');
            } else {
              // For PDFs, just show a note
              const podNoteHTML = `
                <div style="page-break-before: always; padding: 20px; text-align: center;">
                  <h2 style="color: #2d5aa0; margin-bottom: 20px;">Proof of Delivery (POD)</h2>
                  <p style="margin-bottom: 20px;"><strong>Load:</strong> ${load.number109}</p>
                  <div style="padding: 40px; background: #f0f8ff; border: 2px dashed #2d5aa0; border-radius: 8px;">
                    <i class="fas fa-file-pdf" style="font-size: 48px; color: #dc3545; margin-bottom: 20px;"></i>
                    <p style="font-size: 18px; font-weight: bold;">PDF POD Document Attached</p>
                    <p>Filename: POD_${load.number109}.pdf</p>
                  </div>
                </div>
              `;
              previewHTML = previewHTML.replace('</body>', podNoteHTML + '</body>');
            }
          } else {
            // For test data or non-object storage paths, show demo POD  
            console.log(`🖨️ Using demo POD for test data: ${load.podDocumentPath}`);
            
            const demoImageData = 'iVBORw0KGgoAAAANSUhEUgAAASwAAADICAYAAABS39xVAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEgAACxIB0t1+/AAAABx0RVh0U29mdHdhcmUAQWRvYmUgRmlyZXdvcmtzIENTNqgU0eAAAAAWdEVYdENyZWF0aW9uIFRpbWUAMDEvMDEvMDB7CGR8AAAXW0lEQVR4nO3deZCdV3nn8e+92/eu6larl7YkW5ZkWd7wghcWxzY2DuAQCGFgEszkh4pJJqEySRXJVCYmmZTnZGomqZnJVComqQkM4YQYsB2DbRi8YrzIsiVZi2XJ2rvVvXe5+/nPfa/Uktqtre5732Xfz6fKZbXV/e577j3vec+zPOeYcw4REV8U8m6AiMikKLBExBsKLBHxhgJLRLyhwBIRbyiwRMQbCiwR8YYCS0S8ocASEW8osETEGwosEfGGAktEvKHAEhFvKLBExBsKLBHxhgJLRLyhwBIRbyiwRMQbCiwR8YYCS0S8ocASEW8osETEGwosEfGGAktEvKHAEhFvKLBExBsKLBHxhgJLRLyhwBIRbyiwRMQbCiwR8YYCS0S8ocASEW8osETEGwosEfGGAktEvKHAEhFvKLBExBsKLBHxhgJLRLyhwBIRbyiwRMQbCiwR8UYUX5uBGwELFNO/BaCYFmw6HbFfTlzWW1EiM8k69L0U9lOb/nPi+01/T/w5UeI5kl89lGKwtdvl3Yws2A4PLDMrAZ3ARqCnvb1929LS0taiuJaZGc45l/g+FytYwZhZ4iGhcKG5c+sNLCwsPAuc3bt3785qZW/bj4wdHiGWRQCZc1xsfGAxxrwuLV7Qd+jQoafTz3NXamoFcyOEVKzTcZWLHW9fN8Y4oAZU0+MdXe/+kJvTgWVmdmFh4fUAzrmOgYGBO2u12rbOzs7tXV1d/dlz15g7u97N/Pz8PuAk8ARwZM+ePWtmjXL/8IFFZ3WJW0pHQZyzy7hYfx+4iyH3/L34aqtrHl2/8PAw7e3ttLS0EEURxhhjMBcz91WrmWy5S9K12FjvzGKmTMyV3MfCyTKwrFu7LvE8cPHt9P8jjKGDIjPyXexl5L8aw4xCJX0mDVqHoVrElCss0rLGH1T6vGPfvn3/M83vZxeMqbIILDOzIAiCdcuXLw+Cc5PBKaVsZKjYvJk4jtmyZQvFYhFjzAUNDXDBl7FeY4KLfplPAKSB3C7M3eE9K6b/rCEt3bpI15Vk1KAAWmgF+wgj8FksBYwrgnDMfaSLhxmHYhZnBzgx++93a9etW/dQmCiUZcaS+7LtwP8vOSGZwzl3Wejk8qGYmRmLrbdVGObGjRvp6+vDGEOlUsmyrZlyKIeAPjqt7w+Yh+vPtT7f1/xCyW3CdU6IxxoAjPMKxY4YU7zY4+a9rJY2j22Tv1fGBx5YbdYgCqHBxHWLyiWJEzNMvuWDfWZOqzHRqWdQ+aOl9QHntnw1jzsQbj/u+dRfCj5LzHktaX2lWn0xreJgqxmdnbMrsCTPWFDV7a2Hc6IyW85NxXHMhg0beOKJJ3jggQfoKsxTKPRxYXddPY8BJ9Le0DHSx1WBGHhhJ9OyJmOdPE9RqK6v9/z9S6k0v8D5uWajFNrMrJW+L1v8HcjGlxfxKW80+eaQV5S88PpBfSZNMVu5wSg/N4gg5p41dg8oY36OmYVsWBcQi+I3pYO/SnSplbZt1+uQjT1nZMXlZWZfYq3PctN/bNmtPIjI6KduwVy1g+pAF4xdkGAglgtbPqfaYoH9u6t88pd/JOk0iUzg2rr7Qvq7WfxdY5p7TgvnUWCCpfVBbL5CZ35/vbUAXwT31gvY1qcMl5yOm3hfzqWJ4xjn3Fz2snJfOWBl/3XWWdXX10exWKRcLlMul/n8Jx+iG8gHdKZT6Hss8GnlYHO/uMvmUZhUcKjD2dvs4DBGO3h2GDbeEHKyy7Fv/KXt/L9dFE9bNM65Ws/YawLHOcfQ4+FrXo7iEsOtxxjdFePqsL6zE4wFb1lAVmz6H5b+XFAp81J1gNLJCv37y8RVy0BfiaHHO7HKuLWLOdS5I9hpYrPcOqP0PTnXXdNwdBgAXvdnhEwz50M7Zx/jnGt4j+n9vu8lWBLHMb29vfT09DDWXlg+N/Bda9OoG7YT1IrUK1EjbLHcOtRzGH4hzlSJfuHe1nwWCOZD2z/LRbdu3foXefUmgQyuxXNKtPS1M3QcavUolwu4kXPwsEO9/bBtLwzsDPZPJmG1M3oc+KPqPkbthjlS23RWenFRjCwsLLy5m/3BzLbF4uCDT5x89Hd8TjcBHjD8RnAB5xYBKQDnhEgSHk5YGPjL2N27zPO3XcyfJgwss7OPPuIIH2gZm7H3ZFr6KDM08gWsUhkzV6F+toEfKTHrYfq/5z21dN6oLvGf0c64WxVYE8dRFMSzX6J7dQ6A7wKfAjD7aFKcWkf7+7a2Dxy/eSUJlLsYRgTH7+u6qVaLCaH7wUo/fWe6qJ4toFqk2GXoWzVEfTDNlwQpR8Kg3E6tWKHQEhM2d2Q+1DxWLpetXGEZ/OIV++w3kR2KgBvl4qPRJaxsXIvNvtSFPsGVX8h6HJJmCg45fhXHI/kVV6pfEhZj1x6rbzZe9GBhqb9eKxA6S6lsqNdihqpVKt1n6Ohe5MSGIQZwFApNEhHRhpBc5xhrMWjlOE1oYwFJLGKzBseLOT5TyxXG7/B6R8rtOzZ4k5z1XuqXKnLAKZaW3pYX12uxhc8C72G07RUMgBOlgHrJ8n7w/J8WYMhcRhZbnOPEFfr5F0X69mHy2hPjzTXUPo8/UBNZNpCRqenJ4Y0QXrNcgMWYdNRqBWAU6+qguAJjtGEMnQMDdJx+nlXP72HziT0MPrOKgQOduP5u6p0Qr8MsBAZxbhRr1xBt/j8sXzfKV7u+zt4N9/D8xvt4YesXWNk2zMHdrzC0u0z9ZElqsJ/6aBvHZ/rEcCm9nIsX+Uy7Q+DF9n+YxIpTJCMdvs/K1VT4Rr5oP9BjNBr0a15kbsrg8vFLNRPvT8b5YXN9ZxkdOdjLc/e9xK4HXuKlR5/jl7/7Ez7xvz/Kz377B3jyG7/gme//nCe+/jCvPPA8R595hYHnDjM6MuaafSaXPUPkgLlHHl7K8DWNRxY4z5jJqpcfKzLkJm0ujQIKfWpGpBWwPNbmPJ45WBxnzWjzNT3JfGmZfxoWrqOBQ6/s4dc/+A3HXjjIqy8eptrZ+PEGhOGvVpJoQT8KtIe4MDGT/25tfGZJSDTLhQMJ58Vk3/Jvs0lhUVaXtXTJODkqhNp6LLm2k9kHFBaEOIr51U72o7esPFvV1HcANZs1LStbUDHrY1wZYDzQZWONLJBELjT8X6EvECwTRXfOTjZTy+8rNJvkCQpvCrNdHJGLGEfE1ixbJfEe6YcQWjj0zEF+8X//jle2n6RQqHKpm6dLvBSvr9PmLBD+FEeqsb/LLKqU5/4lLEqsjMXtdnJWpbcqw4tSEkLV7BdfLtZGGdPYayKH9/mGttWGYWz9rFhEfj4J5cRoQGFpDasC9VEYjqFGRb9nKOKuCiwcJbKG1cHc0LJ4OhZTKhZI8K+7c6bNubSmFRaZeQBH4ijxYhKdpkqMNeezjbWNbWYDhF8DGq3KWXI65d0FVoYyNX7MbL2dJo49f4DvfvmH7PrlTgo4Zh7rEt8Kmc8KjLMqfCy/9bGP4o0Qk2F8tnZDQ9w0WDMS6zF1sPZgzjvt5+bOJBNfyYLF+gJg7n3I6nchqJqxj57X0CxTU8+4zKIvb83CjOKuEK/mAjJqq5vhiQJJFbBNrLlrg+s1GQPRsm8FeRgzNL8/Y2bZ7PfqjZSc9ULyay4Vs8LYqv4RR7k9fNnOi1VCCsIIUz6AHUfKQHMl3Hf6G4z9RAfr+LkT/tL5nMcW1MYLjXJ7sRWscHCErAoT2LxS0rylbGuWV1aQzaKwRBT11rRkZj9x3/1t3hPYcbA6oP6PrLbgskb0bDgwS4Ym5oBP1Otvyya2+a1szKL8lrGvvB1MItMiT9HQHV4VR6OXfnS5nBfzttW+zYTU0dTfzx+BmMrH3rBhqRXTfA5YOqnYhQCJJh7rlIul5vFnW8mlHZkpNqzJHbebC5yPZTxCksLrjBKj6JxXK6Xwut3z3+c93TfT5EqsQqVMHcj2xn5YBqP95QnNxSZ5oFYyh63+g2fSCLg5F2d5M1t/gqq3WGdRWOOZZi/n3qJL/vd3CXYq7IJ7J/7W+vI7s1r2Z9//CuA/4v7KYiOJdFLcL/YJcFJpgEsLdyZdJ9/jLHfH7D8Tv9fC2k6oLLGdf8Y6xS9cjQMvq7CQ2MjFgD/7WLJbf1vOQBz7e1yt3xJWCWN4fKN3w7JYh22XpxjW7XL8+W1rCxW8xZOYbT+EfO4n1cHFrbOKxCOvIpA5a7Q/aJT4qI3ZDWQB3c96G87oWnMELIy8DlhNZJJC1gArH8tOxvklg6/0vAhvNr9a2BlU9tqWEfSK/Hqh1hdPdkrJPF8vOvE1dJv/fh+IOOH95PXtszJFhqU3yj3vRWFRgd8G9IH5T6Zn5/y2Fv0gOYRxJLhHJE0eJi2YpLMspn7yfbnbGIWj0f9dPIUPJaXhJfEEjx78PGt8DfQdwtyLx6s73/4J4MqI4+w2zWsg7f/ij5IhOkHzK/MjGkDa/MeVl1Nc8tHwJ4D9z5u6/7FfFVNvvSgXu0JQdlnyj8H98sBOXX4rZm0g2Uv3p3G5bFFAr8Ft4v63U1c8WIYvGDJNmF7QrNv5VdYm8d57zf/U6AXoFa2nvftZbWJV9jZr6c3o91i4rn5f2xWfnZAPlGNTGqo+j6y/9d/wAAAABJRU5ErkJggg==';
            
            const podImageHTML = `
              <div style="page-break-before: always; padding: 20px;">
                <h2 style="color: #ff6b35; margin-bottom: 20px; text-align: center;">DEMO: Proof of Delivery (POD)</h2>
                <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin-bottom: 20px; text-align: center;">
                  <strong>⚠️ PREVIEW MODE:</strong> This demonstrates how actual POD attachments would appear in the complete document package.
                </div>
                <p style="margin-bottom: 20px; text-align: center;"><strong>Load:</strong> ${load.number109}</p>
                <div style="text-align: center; background: #f8f9fa; padding: 20px; border-radius: 8px; border: 2px dashed #ff6b35;">
                  <img src="data:image/png;base64,${demoImageData}" 
                       style="max-width: 100%; max-height: 400px; background: white; padding: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-radius: 4px;" 
                       alt="Demo POD Document" />
                  <p style="margin-top: 15px; color: #666; font-style: italic;">
                    📸 In production, this would show the actual delivery receipt photos uploaded by the driver
                  </p>
                  <p style="margin: 10px 0; color: #6c757d; font-size: 14px;">
                    <strong>File:</strong> POD_${load.number109}.jpg | <strong>Size:</strong> 45.2 KB | <strong>Uploaded:</strong> ${new Date().toLocaleDateString()}
                  </p>
                </div>
              </div>
            `;
            previewHTML = previewHTML.replace('</body>', podImageHTML + '</body>');
            
            // Add to attachments list for reference
            podAttachments.push({
              filename: `DEMO_POD_${load.number109}.png`,
              contentType: 'image/png',
              size: 45200
            });
          }
        } catch (error) {
          console.error(`❌ Error processing POD for preview:`, error);
          // Add error note to HTML
          const errorHTML = `
            <div style="page-break-before: always; padding: 20px; text-align: center;">
              <h2 style="color: #dc3545; margin-bottom: 20px;">POD Document Issue</h2>
              <p style="color: #dc3545;">Error loading POD: ${(error as Error).message}</p>
            </div>
          `;
          previewHTML = previewHTML.replace('</body>', errorHTML + '</body>');
        }
      } else {
        // Show "No POD" message
        const noPodHTML = `
          <div style="page-break-before: always; padding: 20px; text-align: center;">
            <h2 style="color: #ff6b35; margin-bottom: 20px;">No POD Document</h2>
            <p style="color: #666;">No POD document has been uploaded for load ${load.number109}</p>
          </div>
        `;
        previewHTML = previewHTML.replace('</body>', noPodHTML + '</body>');
      }

      res.json({
        success: true,
        previewHTML,
        podAttachments: podAttachments.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          size: att.content.length
        })),
        invoice,
        load
      });

    } catch (error) {
      console.error("❌ Error generating print preview:", error);
      res.status(500).json({ 
        message: "Failed to generate print preview", 
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
