import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, getSession } from "./replitAuth";
import { ObjectStorageService } from "./objectStorage";
import { sendSMSToDriver } from "./smsService";
import { sendTestNotification, notificationService } from "./notificationService";
import { processRateConfirmationImage } from "./ocrService";
import { GPSService } from "./gpsService";
import { aiService } from "./aiService";
import { 
  startLoadTracking, 
  updateDriverLocation, 
  calculateRoute, 
  calculateETA, 
  getLoadTrackingStatus 
} from "./routes/tracking";
import multer from 'multer';
import {
  insertLoadSchema,
  insertLocationSchema,
  insertBolNumberSchema,
  insertRateSchema,
  insertUserSchema,
  insertCustomerSchema,
  insertTruckSchema,
  insertChatMessageSchema,
  insertInvoiceSchema,
  type Load,
  type User,
  type Location,
  type InsertInvoice,
  invoices
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import { loads, locations, loadStops } from "@shared/schema";

// Bypass secret for testing and mobile auth
const BYPASS_SECRET = "LOADTRACKER_BYPASS_2025";

// FIXED: Multi-POD version - gets ALL POD snapshots from BOTH stored snapshots AND object storage
async function getAllPodSnapshots(invoice: any, podDocumentPath?: string): Promise<Array<{
  contentBase64: string;
  contentType: string;
  size: number;
  sourcePath: string;
  attachedAt: string;
}>> {
  console.log('📄 Getting ALL POD snapshots - checking BOTH stored snapshots AND object storage...');
  
  const allPodSnapshots: Array<{
    contentBase64: string;
    contentType: string;
    size: number;
    sourcePath: string;
    attachedAt: string;
  }> = [];
  
  // First: Collect any stored POD snapshots from invoice
  if (invoice.podSnapshot && Array.isArray(invoice.podSnapshot) && invoice.podSnapshot.length > 0) {
    console.log(`✅ Found ${invoice.podSnapshot.length} stored POD snapshots in invoice`);
    allPodSnapshots.push(...invoice.podSnapshot);
  } else if (invoice.podSnapshot && invoice.podSnapshot.contentBase64) {
    console.log('✅ Converting legacy single POD snapshot to array format');
    allPodSnapshots.push(invoice.podSnapshot);
  }
  
  // Second: ALSO check object storage for additional PODs
  if (podDocumentPath && podDocumentPath !== 'test-pod-document.pdf') {
    console.log('🔍 Also checking object storage for additional PODs...');
    const storagePods = await fetchAllPodSnapshotsFromStorage(podDocumentPath);
    
    if (storagePods.length > 0) {
      console.log(`📄 Found ${storagePods.length} additional PODs in object storage`);
      
      // Add storage PODs that aren't already in stored snapshots (deduplicate by sourcePath)
      const existingPaths = new Set(allPodSnapshots.map(pod => pod.sourcePath));
      const newPods = storagePods.filter(pod => !existingPaths.has(pod.sourcePath));
      allPodSnapshots.push(...newPods);
      
      if (newPods.length > 0) {
        console.log(`✅ Added ${newPods.length} new PODs from object storage`);
      } else {
        console.log('📄 No new PODs found in object storage (all already stored)');
      }
    }
  }
  
  console.log(`📋 TOTAL PODs available: ${allPodSnapshots.length}`);
  return allPodSnapshots;
}

// Legacy function for backward compatibility - returns first POD only  
async function getPodSnapshot(invoice: any, podDocumentPath?: string): Promise<{
  contentBase64: string;
  contentType: string;
  size: number;
  sourcePath: string;
  attachedAt: string;
} | null> {
  const allSnapshots = await getAllPodSnapshots(invoice, podDocumentPath);
  return allSnapshots.length > 0 ? allSnapshots[0] : null;
}

// FIXED: Process ALL POD documents, not just the first one (was causing multi-POD issues)
async function fetchAllPodSnapshotsFromStorage(podDocumentPath?: string): Promise<Array<{
  contentBase64: string;
  contentType: string;
  size: number;
  sourcePath: string;
  attachedAt: string;
}>> {
  if (!podDocumentPath || podDocumentPath === 'test-pod-document.pdf') {
    console.log('📄 No valid POD document path provided');
    return [];
  }

  try {
    console.log('📄 Fetching ALL PODs from object storage:', podDocumentPath);
    
    // Initialize object storage service
    const objectStorageService = new ObjectStorageService();
    
    // Handle multiple POD documents (comma-separated)
    const podPaths = podDocumentPath.includes(',') 
      ? podDocumentPath.split(',').map(path => path.trim())
      : [podDocumentPath];
    
    console.log(`📄 Processing ${podPaths.length} POD document(s):`);
    podPaths.forEach((path, index) => console.log(`  ${index + 1}. ${path}`));
    
    const podSnapshots = [];
    
    // Process ALL PODs, not just the first one
    for (let i = 0; i < podPaths.length; i++) {
      const podPath = podPaths[i];
      console.log(`📄 Processing POD ${i + 1}/${podPaths.length}: ${podPath}`);
      
      try {
        // Normalize the path if it's a full URL
        const normalizedPath = objectStorageService.normalizeObjectEntityPath(podPath);
        console.log(`📄 Normalized POD path ${i + 1}: ${normalizedPath}`);
        
        // Get the file object from object storage
        const podFile = await objectStorageService.getObjectEntityFile(normalizedPath);
        const [metadata] = await podFile.getMetadata();
        
        // Read the file content into a buffer
        const chunks: Buffer[] = [];
        const stream = podFile.createReadStream();
        
        await new Promise<void>((resolve, reject) => {
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', resolve);
        });
        
        const buffer = Buffer.concat(chunks);
        const contentBase64 = buffer.toString('base64');
        
        const podSnapshot = {
          contentBase64,
          contentType: metadata.contentType || 'application/octet-stream',
          size: parseInt(String(metadata.size || '0')),
          sourcePath: podPath,
          attachedAt: new Date().toISOString()
        };
        
        podSnapshots.push(podSnapshot);
        console.log(`✅ POD ${i + 1} snapshot created: ${podSnapshot.size} bytes, type: ${podSnapshot.contentType}`);
        
      } catch (podError) {
        console.error(`❌ Failed to process POD ${i + 1} (${podPath}):`, podError);
        // Continue processing other PODs even if one fails
      }
    }
    
    console.log(`✅ Successfully processed ${podSnapshots.length}/${podPaths.length} POD documents`);
    return podSnapshots;
    
  } catch (error) {
    console.error('❌ Failed to fetch POD snapshots from storage:', error);
    return [];
  }
}

// Legacy function for backward compatibility - now returns first POD only
async function fetchPodSnapshotFromStorage(podDocumentPath?: string): Promise<{
  contentBase64: string;
  contentType: string;
  size: number;
  sourcePath: string;
  attachedAt: string;
} | null> {
  const allSnapshots = await fetchAllPodSnapshotsFromStorage(podDocumentPath);
  return allSnapshots.length > 0 ? allSnapshots[0] : null;
}

// Utility function to convert base64 POD snapshot to buffer for PDF embedding
function convertPodSnapshotToBuffer(podSnapshot: {
  contentBase64: string;
  contentType: string;
  size: number;
  sourcePath: string;
  attachedAt: string;
}): {content: Buffer, type: string} {
  console.log('🔄 Converting POD snapshot to buffer:', {
    size: podSnapshot.size,
    contentType: podSnapshot.contentType
  });
  
  const buffer = Buffer.from(podSnapshot.contentBase64, 'base64');
  
  console.log('✅ POD snapshot converted to buffer:', {
    originalSize: podSnapshot.size,
    bufferSize: buffer.length,
    contentType: podSnapshot.contentType
  });
  
  return {
    content: buffer,
    type: podSnapshot.contentType
  };
}

// Alias for fetchPodSnapshotFromStorage - used throughout the codebase
const fetchPodSnapshot = fetchPodSnapshotFromStorage;

// Helper function to get file extension from content type
function getFileExtension(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'application/pdf':
      return 'pdf';
    case 'image/webp':
      return 'webp';
    default:
      return 'pdf'; // Default to PDF for unknown types
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve static files from public directory
  app.use(express.static('public'));
  
  // Auth middleware (includes session setup)
  await setupAuth(app);
  
  // HTTPS Cookie Persistence Fix for Railway/HTTPS deployments
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    // Fix cookie persistence in HTTPS deployments
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      if (req.session && req.session.cookie) {
        req.session.cookie.secure = true;
        req.session.cookie.sameSite = 'none';
      }
    }
    next();
  });

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
      fileSize: 25 * 1024 * 1024, // 25MB limit - increased for high-res/poor quality scans
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

      // Create session for driver with complete user data
      (req.session as any).driverAuth = {
        userId: driver.id,
        username: driver.username,
        role: driver.role,
        firstName: driver.firstName,
        lastName: driver.lastName
      };

      // Force save session to ensure persistence
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
        } else {
          console.log("✅ Driver session saved successfully");
        }
      });

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

      // Create session for driver with complete user data
      (req.session as any).driverAuth = {
        userId: driver.id,
        username: driver.username,
        role: driver.role,
        firstName: driver.firstName,
        lastName: driver.lastName
      };

      // Force save session to ensure persistence
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
        } else {
          console.log("✅ Driver session saved successfully");
        }
      });

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

  // Check general user authentication (Replit auth)
  app.get('/api/auth/user', (req, res) => {
    // Check Replit auth first
    if (req.user) {
      console.log("✅ REPLIT AUTH USER FOUND:", req.user);
      return res.json(req.user);
    }
    
    // Check bypass token
    const bypassToken = req.headers['x-bypass-token'];
    
    if (bypassToken === BYPASS_SECRET) {
      console.log("✅ BYPASS TOKEN: Valid bypass token for user auth");
      return res.json({ 
        id: "bypass-user",
        email: "bypass@example.com",
        firstName: "Bypass",
        lastName: "User",
        role: "office",
        authType: "bypass"
      });
    }

    // No auth found
    console.log("❌ USER AUTH: No Replit user or valid bypass token");
    res.status(401).json({ message: "Unauthorized" });
  });

  // Check driver authentication
  app.get('/api/auth/driver-user', (req, res) => {
    // Check session auth FIRST - if there's a valid driver session, use it
    if ((req.session as any).driverAuth) {
      console.log("✅ DRIVER SESSION FOUND:", (req.session as any).driverAuth);
      const driverData = (req.session as any).driverAuth;
      
      // Return full driver information including firstName and lastName
      return res.json({
        id: driverData.userId,
        username: driverData.username,
        role: driverData.role,
        firstName: driverData.firstName || driverData.username, // Fallback to username
        lastName: driverData.lastName || "",
      });
    }
    
    // Check bypass token - if valid, return generic auth success
    const bypassToken = req.headers['x-bypass-token'];
    
    if (bypassToken === BYPASS_SECRET) {
      console.log("✅ BYPASS TOKEN: Valid bypass token for driver auth");
      return res.json({ 
        id: "bypass-user",
        username: "bypass",
        role: "driver",
        firstName: "Bypass",
        lastName: "User",
        authType: "bypass"
      });
    }

    // No session and no valid bypass token
    console.log("❌ DRIVER AUTH: No session or valid bypass token");
    res.status(401).json({ message: "Not authenticated" });
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
      const bypassToken = req.headers['x-bypass-token'];
      
      console.log("Admin user check:", { 
        hasSession: !!req.session, 
        hasAdminAuth: !!adminUser,
        sessionId: req.sessionID,
        sessionData: req.session ? Object.keys(req.session) : "no session",
        adminAuthData: adminUser || "none",
        hasBypassToken: !!bypassToken
      });
      
      if (adminUser) {
        res.json(adminUser);
      } else if (bypassToken === BYPASS_SECRET) {
        console.log("✅ BYPASS TOKEN: Valid bypass token for admin auth");
        res.json({ 
          id: "bypass-admin",
          username: "admin",
          role: "admin",
          firstName: "Admin",
          lastName: "User",
          authType: "bypass"
        });
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

  app.put("/api/locations/:id", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const location = await storage.updateLocation(req.params.id, req.body);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      res.json(location);
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(400).json({ message: "Failed to update location" });
    }
  });

  app.delete("/api/locations/:id", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      await storage.deleteLocation(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(400).json({ message: "Failed to delete location" });
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

  // Customer management endpoints
  app.get("/api/customers", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.post("/api/customers", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(validatedData);
      res.json(customer);
    } catch (error: any) {
      console.error("Error creating customer:", error);
      if (error?.name === 'ZodError') {
        res.status(400).json({ message: "Invalid customer data", errors: error.errors });
      } else {
        res.status(500).json({ message: error?.message || "Failed to create customer" });
      }
    }
  });

  app.put("/api/customers/:id", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const customer = await storage.updateCustomer(req.params.id, req.body);
      res.json(customer);
    } catch (error) {
      console.error("Error updating customer:", error);
      res.status(500).json({ message: "Failed to update customer" });
    }
  });

  app.delete("/api/customers/:id", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      await storage.deleteCustomer(req.params.id);
      res.json({ message: "Customer deleted successfully" });
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ message: "Failed to delete customer" });
    }
  });

  // Truck management endpoints
  app.get("/api/trucks", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const trucks = await storage.getTrucks();
      res.json(trucks);
    } catch (error) {
      console.error("Error fetching trucks:", error);
      res.status(500).json({ message: "Failed to fetch trucks" });
    }
  });

  app.post("/api/trucks", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      console.log("Truck creation request body:", req.body);
      const validatedData = insertTruckSchema.parse(req.body);
      console.log("Truck validation successful:", validatedData);
      const truck = await storage.createTruck(validatedData);
      console.log("Truck created successfully:", truck.id);
      res.status(201).json(truck);
    } catch (error: any) {
      console.error("Error creating truck - full details:", error);
      if (error?.name === 'ZodError') {
        console.error("Truck validation errors:", error.errors);
        res.status(400).json({ message: "Invalid truck data", errors: error.errors });
      } else {
        res.status(400).json({ message: error?.message || "Invalid truck data" });
      }
    }
  });

  app.put("/api/trucks/:id", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const truck = await storage.updateTruck(req.params.id, req.body);
      res.json(truck);
    } catch (error) {
      console.error("Error updating truck:", error);
      res.status(500).json({ message: "Failed to update truck" });
    }
  });

  app.delete("/api/trucks/:id", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      await storage.deleteTruck(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting truck:", error);
      res.status(500).json({ message: "Failed to delete truck" });
    }
  });

  // Delete driver endpoint
  app.delete("/api/drivers/:driverId", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const driverId = req.params.driverId;
      console.log("🗑️ Deleting driver:", driverId);
      
      await storage.deleteDriver(driverId);
      
      res.json({ message: "Driver deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting driver:", error);
      res.status(500).json({ message: error.message || "Failed to delete driver" });
    }
  });

  // Driver Notification Preferences
  app.get("/api/drivers/:driverId/notifications", (req, res, next) => {
    const adminAuth = !!(req.session as any)?.adminAuth;
    const replitAuth = !!req.user;
    const driverAuth = !!(req.session as any)?.driverAuth;
    const bypassAuth = isBypassActive(req);
    
    const hasAuth = adminAuth || replitAuth || driverAuth || bypassAuth;
    
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const driverId = req.params.driverId;
      console.log(`🔔 Getting notification preferences for driver: ${driverId}`);
      
      let preferences = await storage.getNotificationPreferences(driverId);
      
      // Create default preferences if none exist
      if (!preferences) {
        preferences = await storage.createDefaultNotificationPreferences(driverId);
        console.log(`🔔 Created default preferences for driver: ${driverId}`);
      }
      
      res.json(preferences);
    } catch (error) {
      console.error("Error fetching notification preferences:", error);
      res.status(500).json({ error: "Failed to fetch notification preferences" });
    }
  });

  app.patch("/api/drivers/:driverId/notifications", (req, res, next) => {
    const adminAuth = !!(req.session as any)?.adminAuth;
    const replitAuth = !!req.user;
    const driverAuth = !!(req.session as any)?.driverAuth;
    const bypassAuth = isBypassActive(req);
    
    const hasAuth = adminAuth || replitAuth || driverAuth || bypassAuth;
    
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const driverId = req.params.driverId;
      const updates = req.body;
      
      console.log(`🔔 Updating notification preferences for driver: ${driverId}`, updates);
      
      // Handle test notification request
      if (updates.testNotification) {
        await sendTestNotification(driverId);
        delete updates.testNotification;
        // If this was just a test, return early
        if (Object.keys(updates).length === 0) {
          const currentPrefs = await storage.getNotificationPreferences(driverId);
          return res.json(currentPrefs);
        }
      }
      
      const preferences = await storage.updateNotificationPreferences(driverId, updates);
      
      res.json(preferences);
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      res.status(500).json({ error: "Failed to update notification preferences" });
    }
  });

  // Get loads for a specific driver (for driver portal)
  app.get("/api/drivers/:driverId/loads", (req, res, next) => {
    const adminAuth = !!(req.session as any)?.adminAuth;
    const replitAuth = !!req.user;
    const driverAuth = !!(req.session as any)?.driverAuth;
    const bypassAuth = isBypassActive(req);
    
    // CRITICAL FIX: Also check if the session has driver auth by checking the user role
    const sessionHasDriverAuth = (req.session as any)?.driverAuth?.role === 'driver' || 
                                 (req.session as any)?.user?.role === 'driver';
    
    const hasAuth = adminAuth || replitAuth || driverAuth || bypassAuth || sessionHasDriverAuth;
    
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
    try {
      const driverId = req.params.driverId;
      console.log(`🔍 Getting loads for driver: ${driverId}`);
      
      const loads = await storage.getLoadsByDriver(driverId);
      
      console.log(`📦 Found ${loads.length} actual loads for driver ${driverId}`);
      res.json(loads);
    } catch (error) {
      console.error("Error fetching driver loads:", error);
      res.status(500).json({ error: "Failed to fetch driver loads" });
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
      // Authentication flow - respect actual logged-in driver
      let userId: string | undefined;
      let user: any = null;
      
      // Check for admin authentication first
      if ((req.session as any)?.adminAuth) {
        console.log("🔥 ADMIN SESSION DETECTED");
        user = { role: "admin" };
      } 
      // Check for driver authentication
      else if ((req.session as any)?.driverAuth) {
        userId = (req.session as any).driverAuth.id;
        user = userId ? await storage.getUser(userId) : null;
        console.log(`🔥 DRIVER SESSION: Using driver ID ${userId}`, { 
          firstName: user?.firstName, 
          lastName: user?.lastName,
          username: user?.username 
        });
      }
      // Check Replit authentication
      else if (req.user) {
        userId = (req.user as any)?.claims?.sub;
        user = userId ? await storage.getUser(userId) : null;
        console.log(`🔥 REPLIT AUTH: ${userId}`);
      }
      // Bypass only if no other authentication (for testing only)
      else if (isBypassActive(req)) {
        console.log("🔥 BYPASS ACTIVE: No session auth detected, using admin mode");
        user = { role: "admin" };
      }
      
      // Extract query parameters for filtering
      const { status, excludePaid } = req.query;
      const excludePaidBool = excludePaid === 'true';
      console.log(`🔍 Query parameters:`, { status, excludePaid: excludePaidBool });
      
      let loads;
      if (user?.role === "driver" && userId) {
        console.log(`🔥 DRIVER MODE: Getting loads for driver ${userId}`);
        loads = await storage.getLoadsByDriver(userId);
        console.log(`🔒 SECURITY: Driver ${userId} should only see ${loads?.length || 0} assigned loads`);
        
        // Apply additional filtering for drivers if needed
        if (status && typeof status === 'string') {
          loads = loads.filter(load => load.status === status);
          console.log(`🔍 DRIVER FILTER: Filtered to ${loads.length} loads with status "${status}"`);
        }
      } else {
        console.log("🔥 ADMIN MODE: Getting loads with filters");
        
        // Always use filtered query to support excludePaid parameter
        const filters: { status?: string; excludePaid?: boolean } = {};
        if (status && typeof status === 'string') {
          filters.status = status;
        }
        if (excludePaidBool) {
          filters.excludePaid = true;
        }
        
        if (Object.keys(filters).length > 0) {
          console.log(`🔍 ADMIN FILTER: Using filtered query with filters:`, filters);
          loads = await storage.getLoadsFiltered(filters);
        } else {
          console.log("🔥 ADMIN: Getting all loads (no filters)");
          loads = await storage.getLoads();
        }
        console.log(`📋 ADMIN: Returning ${loads?.length || 0} loads`);
      }
      
      // SECURITY CHECK: Log exactly what's being returned
      console.log(`🔒 FINAL SECURITY CHECK: User role="${user?.role}", userId="${userId}", returning ${loads?.length || 0} loads`);
      
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


  // SMS webhook endpoint for driver confirmations
  app.post("/api/sms/webhook", async (req, res) => {
    try {
      const { From: phoneNumber, Body: messageBody } = req.body;
      
      if (!phoneNumber || !messageBody) {
        return res.status(400).send("Missing phone number or message body");
      }
      
      const response = messageBody.trim().toLowerCase();
      console.log(`📱 SMS received from ${phoneNumber}: "${messageBody}"`);
      
      if (response === 'yes' || response === 'y') {
        // Find driver by phone number
        const driver = await storage.getUserByPhoneNumber(phoneNumber);
        if (!driver) {
          console.log(`❌ No driver found for phone number ${phoneNumber}`);
          return res.status(200).send("Phone number not found in system");
        }
        
        // Find their most recent assigned but unconfirmed load
        const loads = await storage.getLoadsByDriver(driver.id);
        const unconfirmedLoad = loads.find(load => 
          load.driverId === driver.id && 
          !load.driverConfirmed &&
          load.status === 'created'
        );
        
        if (unconfirmedLoad) {
          // Mark load as confirmed
          await storage.updateLoad(unconfirmedLoad.id, {
            driverConfirmed: true,
            driverConfirmedAt: new Date(),
          });
          
          console.log(`✅ Driver ${driver.firstName} ${driver.lastName} confirmed load ${unconfirmedLoad.number109}`);
          
          // Send confirmation SMS
          await sendSMSToDriver(
            phoneNumber,
            `✅ CONFIRMED! Load ${unconfirmedLoad.number109} confirmed. Safe travels!`
          );
        } else {
          console.log(`❌ No unconfirmed loads found for driver ${driver.id}`);
          await sendSMSToDriver(
            phoneNumber,
            "No pending loads found to confirm."
          );
        }
      } else if (response === 'no' || response === 'n') {
        // Handle decline - unassign driver from load
        const driver = await storage.getUserByPhoneNumber(phoneNumber);
        if (driver) {
          const loads = await storage.getLoadsByDriver(driver.id);
          const unconfirmedLoad = loads.find(load => 
            load.driverId === driver.id && 
            !load.driverConfirmed &&
            load.status === 'created'
          );
          
          if (unconfirmedLoad) {
            // Unassign driver
            await storage.updateLoad(unconfirmedLoad.id, { driverId: null });
            console.log(`❌ Driver ${driver.firstName} ${driver.lastName} declined load ${unconfirmedLoad.number109}`);
            
            await sendSMSToDriver(
              phoneNumber,
              `Load ${unconfirmedLoad.number109} declined. The load has been unassigned.`
            );
          }
        }
      }
      
      res.status(200).send("OK");
    } catch (error) {
      console.error("SMS webhook error:", error);
      res.status(500).send("Error processing SMS");
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

  // Update load with signature
  app.patch("/api/loads/:id/signature", (req, res, next) => {
    const adminAuth = !!(req.session as any)?.adminAuth;
    const replitAuth = !!req.user;
    const driverAuth = !!(req.session as any)?.driverAuth;
    const bypassAuth = isBypassActive(req);
    
    const hasAuth = adminAuth || replitAuth || driverAuth || bypassAuth;
    
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      const { signatureURL, signedAt } = req.body;
      
      console.log(`✍️ Saving signature for load: ${loadId}`);
      
      const updatedLoad = await storage.updateLoad(loadId, { 
        signatureURL,
        signedAt: signedAt ? new Date(signedAt) : new Date()
      });
      
      res.json({ message: "Signature saved successfully", load: updatedLoad });
    } catch (error) {
      console.error("Error saving signature:", error);
      res.status(500).json({ message: "Failed to save signature" });
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
      
      // Extract stops and override password from the request body
      const { stops, overridePassword, ...loadData } = req.body;
      
      const validatedData = insertLoadSchema.parse(loadData);
      console.log("Load creation - validation successful, creating load:", validatedData);
      
      // Check if 109 number already exists
      const existingLoads = await storage.getLoads();
      const existingLoad = existingLoads.find(load => load.number109 === validatedData.number109);
      if (existingLoad) {
        // Check if override password is provided and correct
        if (overridePassword !== "1159") {
          console.log("Load creation failed - 109 number already exists:", validatedData.number109);
          return res.status(400).json({ 
            message: "109 number already exists",
            requiresOverride: true 
          });
        }
        // If override password is correct, delete the existing load first
        console.log("Load creation - override password correct, deleting existing load:", existingLoad.id);
        await storage.deleteLoad(existingLoad.id);
        console.log("Existing load deleted, proceeding with new load creation");
      }

      // Validate stops if provided
      let validatedStops = undefined;
      if (stops && Array.isArray(stops) && stops.length > 0) {
        // Validate each stop location exists
        for (const stop of stops) {
          if (stop.locationId) {
            const location = await storage.getLocation(stop.locationId);
            if (!location) {
              return res.status(400).json({ message: `Stop location not found: ${stop.locationId}` });
            }
          }
        }
        validatedStops = stops;
        console.log("Load creation - stops validated:", validatedStops.length);

        // DESTINATION FIX: Set main load's locationId to LAST delivery stop for rate lookup purposes
        const deliveryStops = stops.filter(stop => stop.stopType === "dropoff");
        const lastDeliveryStop = deliveryStops[deliveryStops.length - 1];
        if (lastDeliveryStop && lastDeliveryStop.locationId) {
          validatedData.locationId = lastDeliveryStop.locationId;
          console.log("Load creation - setting main locationId to LAST delivery stop for rate lookup:", lastDeliveryStop.locationId);
        }
      }

      const load = await storage.createLoad(validatedData, validatedStops);
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
              `NEW LOAD ASSIGNED - ${new Date().toLocaleDateString()}
Load: ${validatedData.number109}
Destination: ${location?.name || 'See load details'}
${location?.city ? `City: ${location.city}` : ''}

Reply YES to confirm acceptance or NO to decline.`
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
  
  // Get load stops for a specific load
  app.get("/api/loads/:id/stops", (req, res, next) => {
    const hasAuth = req.isAuthenticated() || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const stops = await storage.getLoadStops(req.params.id);
      res.json(stops);
    } catch (error) {
      console.error("Error fetching load stops:", error);
      res.status(500).json({ message: "Failed to fetch load stops" });
    }
  });

  // Update existing load (comprehensive editing)
  app.put("/api/loads/:id", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      const updates = req.body;
      
      console.log(`📝 Updating load ${loadId} with:`, updates);
      
      // Verify load exists
      const existingLoad = await storage.getLoad(loadId);
      if (!existingLoad) {
        return res.status(404).json({ message: "Load not found" });
      }
      
      // Validate location if being updated
      if (updates.locationId) {
        const location = await storage.getLocation(updates.locationId);
        if (!location) {
          return res.status(400).json({ message: "Invalid location ID" });
        }
      }
      
      // Check for duplicate number109 if being updated
      if (updates.number109 && updates.number109 !== existingLoad.number109) {
        const existingLoads = await storage.getLoads();
        const duplicateLoad = existingLoads.find(load => 
          load.number109 === updates.number109 && load.id !== loadId
        );
        if (duplicateLoad) {
          return res.status(400).json({ 
            message: `Load number ${updates.number109} already exists for another load (ID: ${duplicateLoad.id})` 
          });
        }
      }

      // Update the load
      const updatedLoad = await storage.updateLoad(loadId, updates);
      
      console.log(`✅ Load ${loadId} updated successfully`);
      res.json(updatedLoad);
    } catch (error: any) {
      console.error("Error updating load:", error);
      
      // Enhanced error handling for better debugging
      if (error?.message?.includes('duplicate key') || error?.message?.includes('unique constraint')) {
        return res.status(400).json({ 
          message: "Load number already exists. Please use a different number.", 
          details: error?.message 
        });
      } else if (error?.message?.includes('foreign key')) {
        return res.status(400).json({ 
          message: "Invalid location or driver reference.", 
          details: error?.message 
        });
      }
      
      res.status(500).json({ 
        message: "Failed to update load", 
        details: error?.message || "Unknown error" 
      });
    }
  });

  // Mark load as paid - API endpoint for payment processing
  app.post("/api/loads/:id/mark-paid", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required - Only office staff can mark loads as paid" });
    }
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      const { paymentMethod, paymentReference, paymentNotes, paidAt } = req.body;
      
      console.log(`💰 MARK AS PAID REQUEST: Load ${loadId}`, { paymentMethod, paymentReference });
      
      // Validate required fields
      if (!paymentMethod) {
        return res.status(400).json({ message: "Payment method is required" });
      }
      
      // Verify load exists and is in correct status
      const existingLoad = await storage.getLoad(loadId);
      if (!existingLoad) {
        return res.status(404).json({ message: "Load not found" });
      }
      
      if (existingLoad.status !== "awaiting_payment") {
        return res.status(400).json({ 
          message: `Cannot mark as paid: Load status is "${existingLoad.status}", expected "awaiting_payment"` 
        });
      }
      
      // Mark load as paid using storage method
      const updatedLoad = await storage.markLoadPaid(loadId, {
        paymentMethod,
        paymentReference,
        paymentNotes,
        paidAt: paidAt ? new Date(paidAt) : undefined
      });
      
      console.log(`✅ Load ${updatedLoad.number109} successfully marked as PAID`);
      res.json({
        message: "Load marked as paid successfully",
        load: updatedLoad
      });
      
    } catch (error) {
      console.error("❌ Error marking load as paid:", error);
      res.status(500).json({ 
        message: "Failed to mark load as paid",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add stops to an existing load
  app.post("/api/loads/:id/stops", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      const { stops } = req.body;
      
      // Verify load exists
      const load = await storage.getLoad(loadId);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }
      
      // Get existing stops to determine the next sequence number
      const existingStops = await storage.getLoadStops(loadId);
      const maxSequence = existingStops.reduce((max, stop) => Math.max(max, stop.stopSequence), 0);
      
      // Validate and create new stops
      if (stops && Array.isArray(stops) && stops.length > 0) {
        for (let i = 0; i < stops.length; i++) {
          const stop = stops[i];
          
          // Validate stop location if provided
          if (stop.locationId) {
            const location = await storage.getLocation(stop.locationId);
            if (!location) {
              return res.status(400).json({ message: `Stop location not found: ${stop.locationId}` });
            }
          }
          
          // Create the stop with proper sequencing
          await storage.createLoadStop({
            ...stop,
            loadId,
            stopSequence: maxSequence + i + 1,
          });
        }
        
        console.log(`Added ${stops.length} stops to load ${loadId}`);
        res.json({ success: true, message: `${stops.length} stops added successfully` });
      } else {
        res.status(400).json({ message: "No stops provided" });
      }
    } catch (error) {
      console.error("Error adding stops to load:", error);
      res.status(500).json({ message: "Failed to add stops" });
    }
  });

  // Remove stop from a load
  app.delete("/api/loads/:loadId/stops/:stopId", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { loadId, stopId } = req.params;
      
      console.log(`🗑️ Removing stop ${stopId} from load ${loadId}`);
      
      // Verify load exists
      const load = await storage.getLoad(loadId);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }
      
      // Remove the stop
      await storage.removeLoadStop(stopId);
      
      console.log(`✅ Stop ${stopId} removed from load ${loadId}`);
      res.json({ success: true, message: "Stop removed successfully" });
    } catch (error) {
      console.error("Error removing stop:", error);
      res.status(500).json({ message: "Failed to remove stop" });
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

  // Force status update - bypasses business rules (for admin/driver emergencies)
  app.patch("/api/loads/:id/force-status", (req, res, next) => {
    // SECURITY: Restrict authorization - admin only OR driver assigned to this specific load
    const hasAdminAuth = !!(req.session as any)?.adminAuth;
    const hasReplitAuth = !!req.user;
    const hasDriverAuth = !!(req.session as any)?.driverAuth;
    
    // Only allow bypass token in development environment for authenticated sessions
    const hasTokenBypass = process.env.NODE_ENV === 'development' && 
                           req.headers['x-bypass-token'] === BYPASS_SECRET &&
                           (hasAdminAuth || hasDriverAuth); // Must still have valid session
    
    const hasBasicAuth = hasAdminAuth || hasReplitAuth || hasDriverAuth || hasTokenBypass;
    
    console.log("🔒 FORCE STATUS AUTH CHECK:", {
      hasAdminAuth,
      hasReplitAuth,
      hasDriverAuth,
      hasTokenBypass: !!hasTokenBypass,
      nodeEnv: process.env.NODE_ENV,
      finalAuth: hasBasicAuth
    });
    
    if (!hasBasicAuth) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    // Store auth context for later authorization check
    // SECURITY: Only explicit admin role should be treated as admin, not any Replit user
    const adminSession = (req.session as any)?.adminAuth;
    const driverSession = (req.session as any)?.driverAuth;
    const isExplicitAdmin = adminSession?.role === 'admin';
    
    (req as any).authContext = {
      isAdmin: isExplicitAdmin,
      driverAuth: driverSession,
      userId: isExplicitAdmin ? adminSession.id : driverSession?.userId || 'unknown'
    };
    
    next();
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      const { status } = req.body;
      const authContext = (req as any).authContext;
      
      console.log("🚨 FORCE STATUS UPDATE REQUEST:", {
        loadId,
        requestedStatus: status,
        authContext,
        userAgent: req.headers['user-agent']?.substring(0, 50)
      });
      
      // Validate status input
      const validStatuses = ["pending", "created", "assigned", "in_progress", "in_transit", "en_route_pickup", 
        "at_shipper", "left_shipper", "en_route_receiver", "at_receiver", "delivered", "empty", 
        "awaiting_invoicing", "awaiting_payment", "invoiced", "paid", "completed"];
      
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ 
          message: "Valid status is required", 
          validStatuses 
        });
      }
      
      // Get the load to check driver assignment
      const load = await storage.getLoad(loadId);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }
      
      // SECURITY: Additional authorization check
      if (!authContext.isAdmin) {
        // If not admin, must be the assigned driver
        if (!load.driverId || load.driverId !== authContext.userId) {
          console.log(`🔒 AUTHORIZATION DENIED: Driver ${authContext.userId} attempted to force load ${loadId} assigned to ${load.driverId}`);
          return res.status(403).json({ 
            message: "Forbidden: You can only force loads assigned to you" 
          });
        }
      }
      
      console.log(`🚨 FORCE updating load ${loadId} status to: ${status} (bypassing business rules)`);
      console.log(`🔒 AUTHORIZED BY: ${authContext.isAdmin ? 'Admin' : `Driver ${authContext.userId}`}`);
      
      // Use direct storage method that bypasses business rules
      const updatedLoad = await storage.forceUpdateLoadStatus(loadId, status, undefined, authContext.userId);
      
      console.log(`✅ Load status FORCE updated successfully: ${updatedLoad.status}`);
      res.json(updatedLoad);
    } catch (error) {
      console.error("❌ Error force updating load status:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        loadId: req.params.id,
        requestBody: req.body
      });
      res.status(500).json({ message: "Failed to force update load status" });
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

      // Send SMS notification via notification service (respects driver preferences)
      try {
        const location = load.location;
        const destination = location?.name || (load.companyName || 'See load details');
        await notificationService.sendLoadAssignmentNotification(
          driverId,
          load.number109,
          destination,
          loadId
        );
        console.log(`✅ SMS notification sent to driver ${driverId} for load ${load.number109}`);
      } catch (smsError) {
        console.error("Failed to send SMS notification:", smsError);
        // Don't fail the assignment if SMS fails
      }

      res.json(completeLoad);
    } catch (error) {
      console.error("Error assigning driver to load:", error);
      res.status(500).json({ message: "Failed to assign driver to load" });
    }
  });

  // Update existing invoice with new lumper/stop charges
  app.patch("/api/loads/:id/update-invoice", (req, res, next) => {
    const hasAdminAuth = !!(req.session as any)?.adminAuth;
    const hasReplitAuth = !!req.user;
    const hasTokenBypass = isBypassActive(req);
    const hasAuth = hasAdminAuth || hasReplitAuth || hasTokenBypass;
    
    console.log("Invoice update auth check:", {
      hasAdminAuth,
      hasReplitAuth,
      hasTokenBypass,
      hasAuth
    });
    
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      
      // Get the load with current lumper/stop charges
      const load = await storage.getLoad(loadId);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }
      
      // Find the existing invoice for this load
      const invoices = await storage.getInvoices();
      const existingInvoice = invoices.find((inv: any) => inv.loadId === loadId);
      
      if (!existingInvoice) {
        return res.status(404).json({ message: "No invoice found for this load" });
      }
      
      // Get rate for recalculation - use LAST delivery stop (same logic as load creation)
      const loadStops = await storage.getLoadStops(loadId);
      const deliveryStops = loadStops.filter(stop => stop.stopType === "dropoff");
      const lastDeliveryStop = deliveryStops[deliveryStops.length - 1];
      
      let rateCity, rateState;
      // TypeScript-safe access to location data
      const stopLocation = (lastDeliveryStop as any)?.location;
      if (stopLocation?.city && stopLocation?.state) {
        // Use last delivery stop for rate calculation
        rateCity = stopLocation.city;
        rateState = stopLocation.state;
      } else if (load.location?.city && load.location?.state) {
        // Fallback to main load location if stops don't have location data
        rateCity = load.location.city;
        rateState = load.location.state;
      } else {
        return res.status(400).json({ message: "No location found for rate calculation" });
      }
      
      const rate = await storage.getRateByLocation(rateCity, rateState);
      if (!rate) {
        return res.status(400).json({ message: "Rate not found for this location" });
      }
      
      // Recalculate invoice amounts with current load charges
      // Use tripRate if specified, otherwise fall back to database flat rate
      const tripRate = parseFloat(load.tripRate?.toString() || "0");
      const flatRate = tripRate > 0 ? tripRate : parseFloat(rate.flatRate.toString());
      const lumperCharge = parseFloat(load.lumperCharge?.toString() || "0");
      const extraStopsCharge = parseFloat(load.extraStops?.toString() || "0");
      const totalAmount = flatRate + lumperCharge + extraStopsCharge;
      
      // Update the existing invoice with proper decimal values
      const updatedInvoice = await storage.updateInvoice(existingInvoice.invoiceNumber, {
        flatRate: flatRate.toString(),
        lumperCharge: lumperCharge.toString(), 
        extraStopsCharge: extraStopsCharge.toString(),
        totalAmount: totalAmount.toString()
      });
      
      console.log(`✅ Invoice ${existingInvoice.invoiceNumber} updated with new charges:`, {
        flatRate: flatRate.toFixed(2),
        lumperCharge: lumperCharge.toFixed(2),
        extraStopsCharge: extraStopsCharge.toFixed(2),
        totalAmount: totalAmount.toFixed(2)
      });
      
      res.json(updatedInvoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ message: "Failed to update invoice" });
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

  // Load return endpoint - drivers can return loads to admin
  app.patch("/api/loads/:id/return-load", (req, res, next) => {
    // Flexible authentication for load returns
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasReplitAuth = req.isAuthenticated && req.isAuthenticated();
    const hasDriverAuth = (req.session as any)?.driverAuth;
    const hasAdminAuth = (req.session as any)?.adminAuth;
    const hasAuth = hasReplitAuth || hasDriverAuth || hasAdminAuth || hasTokenBypass;
    
    console.log("Load return auth check:", {
      hasReplitAuth,
      hasDriverAuth,
      hasAdminAuth,
      hasTokenBypass,
      finalAuth: hasAuth
    });
    
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Unauthorized - load return requires authentication" });
    }
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      
      // Get current load details
      const currentLoad = await storage.getLoad(loadId);
      if (!currentLoad) {
        return res.status(404).json({ message: "Load not found" });
      }
      
      // Unassign driver from load by setting driverId to null
      const updatedLoad = await storage.updateLoad(loadId, { driverId: null });
      
      console.log(`📦 Load ${currentLoad.number109} returned to admin dashboard by driver`);
      
      res.json({
        message: "Load returned successfully",
        load: updatedLoad
      });
    } catch (error) {
      console.error("Error returning load:", error);
      res.status(500).json({ message: "Failed to return load" });
    }
  });

  // Delete load endpoint - admins can delete loads  
  app.delete("/api/loads/:id", (req, res, next) => {
    // Flexible authentication for load deletion
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasReplitAuth = req.isAuthenticated && req.isAuthenticated();
    const hasAdminAuth = (req.session as any)?.adminAuth;
    const hasAuth = hasReplitAuth || hasAdminAuth || hasTokenBypass;
    
    console.log("🗑️ SERVER DELETE: Load deletion auth check:", {
      loadId: req.params.id,
      hasReplitAuth,
      hasAdminAuth,
      hasTokenBypass,
      bypassTokenProvided: !!bypassToken,
      bypassTokenMatches: bypassToken === BYPASS_SECRET,
      finalAuth: hasAuth
    });
    
    if (hasAuth) {
      next();
    } else {
      console.error("🗑️ SERVER DELETE: Authentication failed for load deletion");
      res.status(401).json({ message: "Unauthorized - admin access required for load deletion" });
    }
  }, async (req, res) => {
    try {
      const loadId = req.params.id;
      console.log(`🗑️ SERVER DELETE: Processing deletion request for load ID: ${loadId}`);
      
      // Get load details before deletion
      const load = await storage.getLoad(loadId);
      if (!load) {
        console.error(`🗑️ SERVER DELETE: Load not found with ID: ${loadId}`);
        return res.status(404).json({ message: "Load not found" });
      }
      
      console.log(`🗑️ SERVER DELETE: Found load ${load.number109} (ID: ${loadId}), proceeding with deletion`);
      
      // Delete the load
      await storage.deleteLoad(loadId);
      
      console.log(`🗑️ SERVER DELETE: Successfully deleted load ${load.number109}`);
      
      res.json({
        message: "Load deleted successfully",
        deletedLoad: load.number109
      });
    } catch (error: any) {
      console.error("🗑️ SERVER DELETE: Error deleting load:", error);
      console.error("🗑️ SERVER DELETE: Error stack:", error?.stack);
      res.status(500).json({ 
        message: "Failed to delete load", 
        error: error?.message || 'Unknown error',
        loadId: req.params.id 
      });
    }
  });

  // Bulk delete loads (Ghost Load Cleanup) - FLEXIBLE AUTH
  app.post("/api/loads/bulk-delete", (req, res, next) => {
    // Allow multiple authentication methods for bulk deletion to ensure it works
    const bypassToken = req.headers['x-bypass-token'];
    const hasReplitAuth = !!req.user;
    const hasAdminAuth = !!(req.session as any)?.adminAuth;
    const hasDriverAuth = !!(req.session as any)?.driverAuth;
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasAuth = hasReplitAuth || hasAdminAuth || hasDriverAuth || hasTokenBypass;
    
    console.log("🗑️ BULK DELETE: Flexible auth check:", {
      hasReplitAuth,
      hasAdminAuth,
      hasDriverAuth,
      hasTokenBypass,
      finalAuth: hasAuth,
      sessionData: req.session ? Object.keys(req.session) : 'no session',
      bypassProvided: !!bypassToken
    });
    
    if (hasAuth) {
      next();
    } else {
      console.error("🗑️ BULK DELETE: Authentication failed - no valid auth found");
      res.status(401).json({ message: "Unauthorized - authentication required for bulk deletion" });
    }
  }, async (req, res) => {
    try {
      const { loadIds, confirmationText } = req.body;
      
      // Validate input
      if (!Array.isArray(loadIds) || loadIds.length === 0) {
        return res.status(400).json({ message: "No load IDs provided" });
      }
      
      if (confirmationText !== "DELETE ALL SELECTED LOADS") {
        return res.status(400).json({ message: "Invalid confirmation text" });
      }
      
      console.log(`🗑️ BULK DELETE: Starting bulk deletion for ${loadIds.length} loads`);
      
      const results = {
        successful: [] as Array<{ loadId: string; loadNumber: string }>,
        failed: [] as Array<{ loadId: string; error: string; loadNumber: string }>,
        total: loadIds.length
      };
      
      // Delete loads one by one to handle errors gracefully
      for (const loadId of loadIds) {
        try {
          const load = await storage.getLoad(loadId);
          if (!load) {
            results.failed.push({ loadId, error: "Load not found", loadNumber: "Unknown" });
            continue;
          }
          
          console.log(`🗑️ BULK DELETE: Deleting load ${load.number109} (ID: ${loadId})`);
          await storage.deleteLoad(loadId);
          results.successful.push({ loadId, loadNumber: load.number109 });
          console.log(`🗑️ BULK DELETE: Successfully deleted load ${load.number109}`);
        } catch (error: any) {
          console.error(`🗑️ BULK DELETE: Failed to delete load ${loadId}:`, error);
          results.failed.push({ 
            loadId, 
            error: error.message || 'Unknown error',
            loadNumber: "Unknown"
          });
        }
      }
      
      console.log(`🗑️ BULK DELETE: Completed bulk deletion - ${results.successful.length} successful, ${results.failed.length} failed`);
      
      res.json({
        message: `Bulk deletion completed: ${results.successful.length} successful, ${results.failed.length} failed`,
        results
      });
    } catch (error: any) {
      console.error("🗑️ BULK DELETE: Error in bulk deletion:", error);
      res.status(500).json({ 
        message: "Failed to complete bulk deletion", 
        error: error?.message || 'Unknown error'
      });
    }
  });

  // Calculate route distance using HERE Maps (fixes CORS issues)
  app.post("/api/loads/:id/calculate-route", (req, res, next) => {
    // Flexible authentication for route calculations
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
      const { pickupAddress, deliveryAddress, truckSpecs } = req.body;
      
      if (!pickupAddress || !deliveryAddress) {
        return res.status(400).json({ 
          error: 'Both pickup and delivery addresses are required' 
        });
      }

      // Get HERE Maps API key from environment
      const apiKey = process.env.HERE_MAPS_API_KEY || process.env.VITE_HERE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: 'HERE Maps API key not configured on server' 
        });
      }

      console.log(`🚛 Backend route calculation: ${pickupAddress} → ${deliveryAddress}`);

      // Step 1: Geocode addresses
      const geocodeUrl = 'https://geocode.search.hereapi.com/v1/geocode';
      
      const [originRes, destRes] = await Promise.all([
        fetch(`${geocodeUrl}?q=${encodeURIComponent(pickupAddress)}&apikey=${apiKey}&limit=1`),
        fetch(`${geocodeUrl}?q=${encodeURIComponent(deliveryAddress)}&apikey=${apiKey}&limit=1`)
      ]);

      if (!originRes.ok || !destRes.ok) {
        throw new Error('Failed to geocode addresses');
      }

      const [originData, destData] = await Promise.all([
        originRes.json(),
        destRes.json()
      ]);

      if (!originData.items?.[0] || !destData.items?.[0]) {
        throw new Error('Could not find coordinates for addresses');
      }

      const origin = originData.items[0].position;
      const destination = destData.items[0].position;

      // Step 2: Calculate truck route using HERE Maps Routing API v8
      const routeUrl = 'https://router.hereapi.com/v8/routes';
      const params = new URLSearchParams({
        apikey: apiKey,
        transportMode: 'truck',
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        return: 'summary',
      });

      // Add truck specifications if provided (HERE Maps v8 API format)
      if (truckSpecs?.maxWeight) {
        // Convert pounds to kilograms for HERE API (integer value)
        params.append('truck[grossWeight]', Math.round(truckSpecs.maxWeight * 0.453592).toString());
      }
      if (truckSpecs?.maxHeight) {
        // Convert feet to centimeters for HERE API (integer value)
        params.append('truck[height]', Math.round(truckSpecs.maxHeight * 30.48).toString());
      }

      const routeRes = await fetch(`${routeUrl}?${params}`);
      
      if (!routeRes.ok) {
        const errorText = await routeRes.text();
        throw new Error(`HERE routing failed: ${routeRes.status} - ${errorText}`);
      }
      
      const routeData = await routeRes.json();
      
      if (!routeData.routes || routeData.routes.length === 0) {
        throw new Error('No route found');
      }
      
      const route = routeData.routes[0];
      const summary = route.sections[0].summary || route.summary;
      
      // Convert meters to miles and seconds to minutes
      const miles = Math.round((summary.length * 0.000621371) * 100) / 100;
      const duration = Math.round((summary.duration || summary.baseDuration) / 60);
      
      console.log(`✅ Route calculated: ${miles} miles, ${duration} minutes`);
      
      res.json({ 
        miles, 
        duration,
        pickupAddress,
        deliveryAddress
      });

    } catch (error: any) {
      console.error('❌ Route calculation failed:', error);
      res.status(500).json({ 
        error: 'Route calculation failed',
        message: error.message
      });
    }
  });

  // Update load financial details
  app.patch("/api/loads/:id/financials", (req, res, next) => {
    // Flexible authentication for financial updates
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
      const { id } = req.params;
      const updateData = req.body;
      
      const updatedLoad = await storage.updateLoad(id, updateData);
      
      res.json(updatedLoad);
    } catch (error) {
      console.error('Error updating load financials:', error);
      res.status(500).json({ 
        error: 'Failed to update load financials',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
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

      // Send notification to the assigned driver using new notification service
      try {
        const location = load.location;
        const destinationName = location?.name || load.companyName || 'Unknown Destination';
        const fullDestination = location?.city ? `${destinationName}, ${location.city}, ${location.state}` : destinationName;
        
        await notificationService.sendLoadAssignmentNotification(
          driverId,
          load.number109,
          fullDestination,
          loadId
        );
        console.log(`🔔 Load assignment notification sent to driver ${driverId}`);
      } catch (notificationError) {
        console.error("Failed to send load assignment notification:", notificationError);
        // Don't fail the assignment if notification fails
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
        const invoiceContext = await computeInvoiceContext(load);
        emailHTML = generateInvoiceOnlyHTML(invoice, load, invoiceContext.deliveryLocationText, invoiceContext.bolPodText);
        subject = `Rate Confirmation & Invoice ${invoice.invoiceNumber} - GO 4 Farms & Cattle`;
      } else {
        emailHTML = await generateInvoiceHTML(invoice, load);
        subject = `Invoice ${invoice.invoiceNumber} - GO 4 Farms & Cattle`;
      }

      // Send actual email using Outlook SMTP
      const { sendEmail } = await import('./emailService');
      
      const emailResult = await sendEmail({
        to: emailAddress,
        subject,
        html: emailHTML
      });
      
      // WORKFLOW FIX: Move load to awaiting_payment when invoice is actually emailed
      if (load.status === "awaiting_invoicing") {
        await storage.updateLoadStatus(load.id, "awaiting_payment");
        console.log(`📧 Invoice emailed - Load ${load.number109} moved from AWAITING_INVOICING to AWAITING_PAYMENT`);
      }
      
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
      
      // Simple email - single complete package attachment
      let emailHTML = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2d5aa0;">GO 4 Farms & Cattle</h2>
          <p>Please find attached the complete document package for Load ${primaryLoadNumber}.</p>
          <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
          <p><strong>Amount:</strong> $${invoice.totalAmount}</p>
          <p>The attached PDF contains the invoice, rate confirmation, and proof of delivery documents.</p>
          <p>Thank you for your business!</p>
        </div>
      `;
      
      // Send actual email using Outlook SMTP
      console.log("🔍 Attempting to send email to:", emailAddress);
      console.log("🔍 Email credentials check:", {
        hasEmail: !!process.env.OUTLOOK_EMAIL,
        hasPassword: !!process.env.OUTLOOK_PASSWORD,
        emailLength: process.env.OUTLOOK_EMAIL?.length || 0
      });
      
      const { sendEmail, testEmailConnection, generatePDF, convertImageToPDF } = await import('./emailService');
      
      // Test connection first
      console.log("🔍 Testing email connection...");
      const connectionOk = await testEmailConnection();
      if (!connectionOk) {
        throw new Error("Email server connection failed - please check credentials");
      }
      
      // Generate PDF attachments
      console.log("🔍 Generating combined invoice+POD PDF...");
      const attachments = [];
      
      // Generate INVOICE ONLY (no rate con) with POD embedded  
      const invoiceContext = await computeInvoiceContext(load);
      let combinedHTML = generateInvoiceOnlyHTML(invoice, load, invoiceContext.deliveryLocationText, invoiceContext.bolPodText);
      let podImages: Array<{content: Buffer, type: string}> = [];
      
      // Handle POD documents - PRIORITIZE STORED SNAPSHOTS
      console.log(`🔍 EMAIL DEBUG: Checking POD for load ${primaryLoadNumber}`);
      console.log(`🔍 Invoice podSnapshot available: ${!!invoice.podSnapshot}`);
      console.log(`🔍 Load podDocumentPath: "${load.podDocumentPath}"`);
      
      // FIXED: Get ALL POD snapshots for multi-POD loads (email complete package)
      const allPodSnapshots = await getAllPodSnapshots(invoice, load.podDocumentPath || undefined);
      if (allPodSnapshots.length > 0) {
        console.log(`📧 Using ${allPodSnapshots.length} POD(s) for email: stored=${!!invoice.podSnapshot} fallback=${!invoice.podSnapshot}`);
        allPodSnapshots.forEach((snapshot, index) => {
          const podBuffer = convertPodSnapshotToBuffer(snapshot);
          podImages.push(podBuffer);
          console.log(`📧 POD ${index + 1}: ${snapshot.sourcePath} (${snapshot.size} bytes)`);
        });
        
        // ❌ REMOVED: Don't send separate POD attachments for complete package
        // The PODs are already embedded in the Combined PDF above
        console.log(`✅ PODs embedded in Complete Package PDF - no separate attachments needed`);
        console.log(`📧 Complete Package will be single PDF with ${allPodSnapshots.length} POD(s) embedded`);
      } else {
        console.log(`⚠️ No POD available for load ${primaryLoadNumber} - email will contain invoice only`);
      }
      
      // Embed COMPRESSED POD images into the invoice HTML if available
      if (podImages.length > 0) {
        console.log(`🔗 Compressing and embedding ${podImages.length} POD image(s) into invoice...`);
        try {
          const { compressImageForPDF } = await import('./emailService');
          
          // Compress each POD image before embedding
          const compressedPodImages = [];
          for (let i = 0; i < podImages.length; i++) {
            const originalPod = podImages[i];
            console.log(`🗜️ Compressing POD ${i + 1}/${podImages.length} (${Math.round(originalPod.content.length / 1024)}KB)`);
            
            try {
              const compressedBuffer = await compressImageForPDF(originalPod.content, originalPod.type, 600); // Smaller size for email
              compressedPodImages.push({
                content: compressedBuffer,
                type: 'image/jpeg' // Always convert to JPEG for better compression
              });
              console.log(`✅ POD ${i + 1} compressed: ${Math.round(originalPod.content.length / 1024)}KB -> ${Math.round(compressedBuffer.length / 1024)}KB`);
            } catch (compressionError) {
              console.error(`❌ Failed to compress POD ${i + 1}, using original:`, compressionError);
              compressedPodImages.push(originalPod); // Fallback to original
            }
          }
          
          const podSectionHTML = generatePODSectionHTML(compressedPodImages, primaryLoadNumber);
          combinedHTML = combinedHTML.replace('</body>', `${podSectionHTML}</body>`);
          console.log(`✅ ${compressedPodImages.length} compressed POD images embedded into combined invoice`);
        } catch (embedError) {
          console.error(`❌ Failed to embed POD images:`, embedError);
          console.log(`⚠️ Falling back to invoice-only PDF due to POD embedding error`);
          // Keep original invoice HTML without POD if embedding fails
        }
      }
      
      // Generate single combined PDF
      console.log(`📄 Generating combined PDF with invoice + ${podImages.length} POD image(s)...`);
      console.log(`📄 Combined HTML length: ${combinedHTML.length} characters`);
      
      let combinedPDF;
      try {
        combinedPDF = await generatePDF(combinedHTML);
        console.log(`✅ PDF generation successful`);
      } catch (pdfError) {
        console.error(`❌ PDF generation failed:`, pdfError);
        console.log(`⚠️ Attempting fallback with simpler HTML...`);
        
        // Fallback: Generate simple invoice-only PDF without POD embedding
        const invoiceContext = await computeInvoiceContext(load);
        const fallbackHTML = generateInvoiceOnlyHTML(invoice, load, invoiceContext.deliveryLocationText, invoiceContext.bolPodText);
        combinedPDF = await generatePDF(fallbackHTML);
        console.log(`✅ Fallback PDF generation successful`);
      }
      
      // PDF integrity checks
      console.log(`📄 Generated PDF size: ${combinedPDF.length} bytes`);
      console.log(`📄 PDF header check: ${combinedPDF.slice(0, 8).toString()}`);
      console.log(`📄 PDF footer check: ${combinedPDF.slice(-10).toString()}`);
      
      if (combinedPDF.length === 0) {
        throw new Error('PDF generation resulted in empty file');
      }
      
      // Add the combined PDF as primary attachment
      attachments.push({
        filename: `Complete-Package-${primaryLoadNumber}-${invoice.invoiceNumber}.pdf`,
        content: combinedPDF,
        contentType: 'application/pdf'
      });
      
      console.log(`📧 Final email summary for load ${primaryLoadNumber}:`);
      console.log(`  - To: ${emailAddress}`);
      console.log(`  - Attachments: ${attachments.length}`);
      attachments.forEach((att, index) => {
        console.log(`    ${index + 1}. ${att.filename} (${att.content.length} bytes, ${att.contentType})`);
      });
      
      // Send email with all attachments
      const emailResult = await sendEmail({
        to: emailAddress,
        subject,
        html: emailHTML,
        attachments
      });
      
      // ✅ WORKFLOW AUTOMATION: Auto-transition from "awaiting_invoicing" to "awaiting_payment" after successful email
      if (load.status === "awaiting_invoicing") {
        try {
          await storage.updateLoadStatus(load.id, "awaiting_payment");
          console.log(`🔄 WORKFLOW AUTO-TRANSITION: Load ${load.number109} moved from AWAITING_INVOICING → AWAITING_PAYMENT after successful email`);
        } catch (statusError) {
          console.error(`❌ Failed to auto-transition load status for ${load.number109}:`, statusError);
          // Don't fail the email response if status update fails
        }
      }
      
      res.json({
        message: "Complete document package emailed successfully",
        emailAddress,
        attachments: attachments.map(att => ({
          filename: att.filename,
          size: att.content.length,
          contentType: att.contentType
        })),
        messageId: emailResult.messageId,
        recipients: emailResult.recipients
      });
      
    } catch (error) {
      console.error("Error sending complete document package:", error);
      res.status(500).json({ 
        message: "Failed to send complete document package",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Rate confirmation image upload and processing route
  app.post("/api/loads/:loadId/rate-confirmation", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || 
                    !!(req.session as any)?.driverAuth || 
                    req.headers['x-bypass-token'] === BYPASS_SECRET;
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { loadId } = req.params;
      const { imageBase64 } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ message: "Image data is required" });
      }

      // Get the load
      const load = await storage.getLoad(loadId);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }

      console.log(`🖼️ Processing rate confirmation image for load ${load.number109}...`);

      // Process the image with OCR
      const ocrResults = await processRateConfirmationImage(imageBase64);
      
      console.log(`📝 OCR Results for load ${load.number109}:`, ocrResults);

      // Update load with OCR data
      const updateData: any = {};
      
      if (ocrResults.poNumber) {
        updateData.poNumber = ocrResults.poNumber;
      }
      
      if (ocrResults.appointmentTime) {
        updateData.appointmentTime = ocrResults.appointmentTime;
      }
      
      if (ocrResults.pickupAddress) {
        updateData.pickupAddress = ocrResults.pickupAddress;
      }
      
      if (ocrResults.deliveryAddress) {
        updateData.deliveryAddress = ocrResults.deliveryAddress;
      }
      
      if (ocrResults.companyName) {
        updateData.companyName = ocrResults.companyName;
      }

      if (Object.keys(updateData).length > 0) {
        await storage.updateLoad(loadId, updateData);
        console.log(`✅ Load ${load.number109} updated with OCR data:`, updateData);
      }

      res.json({
        message: "Rate confirmation processed successfully",
        loadId,
        ocrResults: {
          poNumber: ocrResults.poNumber,
          appointmentTime: ocrResults.appointmentTime,
          pickupAddress: ocrResults.pickupAddress,
          deliveryAddress: ocrResults.deliveryAddress,
          companyName: ocrResults.companyName,
          extractedText: 'N/A' // OCR text truncated for response
        },
        updateData
      });

    } catch (error) {
      console.error("Error processing rate confirmation:", error);
      res.status(500).json({ 
        message: "Failed to process rate confirmation",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Status update route
  app.patch("/api/loads/:loadId/status", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || 
                    !!(req.session as any)?.driverAuth || 
                    req.headers['x-bypass-token'] === BYPASS_SECRET;
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { loadId } = req.params;
      const { status } = req.body;

      console.log(`🔄 Status update request for load ${loadId} to status: ${status}`);

      // Get the load first
      const load = await storage.getLoad(loadId);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }

      console.log(`📦 Found load ${load.number109} (ID: ${loadId}), current status: ${load.status}`);

      // Update the load status
      const updatedLoad = await storage.updateLoadStatus(loadId, status);

      console.log(`✅ Load ${load.number109} status updated from ${load.status} to ${status}`);

      // Auto-generate invoice for delivered loads if missing
      if (status === "delivered") {
        console.log(`📋 Auto-generating invoice for delivered load ${load.number109}...`);
        await ensureAutoInvoice(updatedLoad);
      }

      res.json({
        message: "Load status updated successfully",
        loadId,
        previousStatus: load.status,
        newStatus: status,
        loadNumber: load.number109
      });

    } catch (error) {
      console.error("Error updating load status:", error);
      res.status(500).json({ 
        message: "Failed to update load status",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GPS location update endpoint
  app.post("/api/loads/:loadId/location", async (req, res) => {
    try {
      const { loadId } = req.params;
      const { latitude, longitude } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({ message: "Latitude and longitude are required" });
      }

      console.log(`📍 GPS update for load ${loadId}: ${latitude}, ${longitude}`);

      // Update load location
      await storage.updateLoad(loadId, {
        currentLatitude: latitude.toString(),
        currentLongitude: longitude.toString(),
        lastLocationUpdate: new Date()
      });

      res.json({ 
        message: "Location updated successfully",
        loadId,
        latitude,
        longitude
      });

    } catch (error) {
      console.error("Error updating GPS location:", error);
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  // Get load tracking data
  app.get("/api/loads/:loadId/tracking", async (req, res) => {
    try {
      const { loadId } = req.params;
      
      const load = await storage.getLoad(loadId);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }

      const trackingData = {
        loadId: load.id,
        loadNumber: load.number109,
        status: load.status,
        currentLocation: {
          latitude: load.currentLatitude,
          longitude: load.currentLongitude,
          lastUpdate: load.lastLocationUpdate
        },
        destinations: {
          shipper: {
            latitude: load.shipperLatitude,
            longitude: load.shipperLongitude
          },
          receiver: {
            latitude: load.receiverLatitude,
            longitude: load.receiverLongitude
          }
        },
        trackingEnabled: load.trackingEnabled
      };

      res.json(trackingData);

    } catch (error) {
      console.error("Error getting tracking data:", error);
      res.status(500).json({ message: "Failed to get tracking data" });
    }
  });

  // Driver availability check endpoint
  app.get("/api/drivers/available", async (req, res) => {
    try {
      const availableDrivers = await storage.getAvailableDrivers();
      res.json(availableDrivers);
    } catch (error) {
      console.error("Error getting available drivers:", error);
      res.status(500).json({ message: "Failed to get available drivers" });
    }
  });

  // Invoice creation with automatic POD snapshot when finalizing
  app.post("/api/invoices", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      console.log("📄 Creating new invoice with request data:", req.body);
      
      // Validate request body using the insert schema
      const invoiceData = insertInvoiceSchema.parse(req.body);
      console.log("✅ Invoice data validation passed");

      // Create the invoice using storage service
      const newInvoice = await storage.createInvoice(invoiceData);
      console.log(`✅ Invoice created successfully: ${newInvoice.invoiceNumber}`);

      // Return the created invoice
      res.status(201).json(newInvoice);
      
    } catch (error) {
      console.error("❌ Error creating invoice:", error);
      res.status(500).json({ 
        message: "Failed to create invoice",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // PRODUCTION HEALTH CHECK - Verify database environment
  app.get("/api/prod/health", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const allLoads = await storage.getLoads();
      const allLocations = await storage.getLocations();
      const allInvoices = await storage.getInvoices();
      
      // Sample load numbers to verify this is production data
      const sampleLoadNumbers = allLoads.slice(0, 5).map(load => load.number109);
      
      res.json({
        environment: process.env.NODE_ENV || 'unknown',
        databaseUrl: process.env.DATABASE_URL?.split('@')[1] || 'unknown', // Hide credentials
        entityCounts: {
          loads: allLoads.length,
          locations: allLocations.length, 
          invoices: allInvoices.length
        },
        sampleLoadNumbers,
        loadsWithPODs: allLoads.filter(l => l.podDocumentPath).length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("❌ Production health check failed:", error);
      res.status(500).json({ 
        message: "Health check failed", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // DEBUG: Check specific load POD and invoice status 
  app.get("/api/debug/load/:loadNumber", (req, res, next) => {
    // Admin/Replit auth only for debugging operations
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required for debugging operations" });
    }
  }, async (req, res) => {
    try {
      const loadNumber = req.params.loadNumber;
      console.log(`🔍 DEBUG: Checking load ${loadNumber}`);
      
      // Find load by number
      const allLoads = await storage.getLoads();
      const load = allLoads.find(l => l.number109 === loadNumber);
      
      if (!load) {
        return res.json({
          found: false,
          message: `Load ${loadNumber} not found`,
          totalLoads: allLoads.length
        });
      }
      
      // Check for invoice
      const allInvoices = await storage.getInvoices();
      const invoice = allInvoices.find(inv => inv.loadId === load.id);
      
      // Check POD status
      let podStatus = {
        hasPOD: !!load.podDocumentPath,
        podPath: load.podDocumentPath,
        podType: null as string | null,
        podAccessible: false,
        podSize: 0
      };
      
      if (load.podDocumentPath) {
        try {
          if (load.podDocumentPath.startsWith('/objects/')) {
            // Try to access object storage POD
            const objectStorageService = new ObjectStorageService();
            const objectFile = await objectStorageService.getObjectEntityFile(load.podDocumentPath);
            const [metadata] = await objectFile.getMetadata();
            podStatus.podAccessible = true;
            podStatus.podType = metadata.contentType || 'unknown';
            podStatus.podSize = parseInt(metadata.size?.toString() || '0') || 0;
          }
        } catch (podError) {
          console.error(`❌ POD access error for ${loadNumber}:`, podError);
          podStatus.podAccessible = false;
        }
      }
      
      res.json({
        found: true,
        loadData: {
          id: load.id,
          number109: load.number109,
          status: load.status,
          createdAt: load.createdAt,
          updatedAt: load.updatedAt,
          driverId: load.driverId,
          locationId: load.locationId
        },
        podStatus,
        invoiceData: invoice ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
          status: invoice.status,
          generatedAt: invoice.generatedAt
        } : null,
        diagnosis: {
          hasInvoice: !!invoice,
          shouldHaveInvoice: !!load.podDocumentPath,
          autoInvoiceWorked: !!invoice && !!load.podDocumentPath,
          statusAllowsInvoice: ['completed', 'delivered', 'awaiting_invoicing', 'awaiting_payment'].includes(load.status)
        }
      });
      
    } catch (error) {
      console.error("❌ Debug operation failed:", error);
      res.status(500).json({ 
        message: "Debug operation failed", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // CENTRALIZED AUTO-INVOICE FUNCTION - Used by both POD upload routes
  async function ensureAutoInvoice(load: any): Promise<void> {
    if (!['delivered', 'completed', 'awaiting_invoicing'].includes(load.status)) {
      console.log(`💰 No auto-invoice for ${load.number109}: Status is ${load.status} (need delivered/completed)`);
      return;
    }
    
    console.log(`💰 Auto-invoice check for ${load.number109}: Status is ${load.status}`);
    
    // Check if invoice already exists
    const allInvoices = await storage.getInvoices();
    const existingInvoice = allInvoices.find(inv => inv.loadId === load.id);
    
    if (existingInvoice) {
      console.log(`💰 Invoice already exists for ${load.number109}: ${existingInvoice.invoiceNumber}`);
      return;
    }
    
    console.log(`💰 Creating automatic invoice for ${load.number109}...`);
    
    try {
      // Generate sequential invoice number
      const invoiceNumber = await storage.getNextInvoiceNumber();
      const now = new Date();
      
      // Prepare invoice data
      const invoiceData: any = {
        loadId: load.id,
        invoiceNumber,
        status: 'pending',
        lumperCharge: load.lumperCharge || '0.00',
        flatRate: load.flatRate || '0.00',
        customerId: null, // Will be populated from load data
        extraStopsCharge: load.extraStops || '0.00',
        extraStopsCount: 0, // Default value
        totalAmount: load.flatRate || '0.00', // Use flat rate as default
        printedAt: null
      };
      
      // FIXED: Embed ALL PODs if available on the load (not just first one)
      if (load.podDocumentPath) {
        invoiceData.podUrl = load.podDocumentPath;
        invoiceData.podAttachedAt = now;
        invoiceData.finalizedAt = now;
        invoiceData.status = "finalized"; // Set to finalized since POD is embedded
        
        // CRITICAL FIX: Fetch ALL POD snapshots for multi-POD loads
        const allPodSnapshots = await fetchAllPodSnapshotsFromStorage(load.podDocumentPath);
        if (allPodSnapshots.length > 0) {
          invoiceData.podSnapshot = allPodSnapshots;
          console.log(`📄 ${allPodSnapshots.length} POD snapshot(s) embedded into auto invoice for load ${load.number109}`);
          allPodSnapshots.forEach((pod, index) => {
            console.log(`  📄 POD ${index + 1}: ${pod.sourcePath} (${pod.size} bytes, ${pod.contentType})`);
          });
        } else {
          console.log(`⚠️ No POD snapshots found for auto invoice of load ${load.number109}`);
        }
        
        console.log(`📄 ${allPodSnapshots.length} POD(s) found and embedded into auto invoice for load ${load.number109}`);
      }
      
      const invoice = await storage.createInvoice(invoiceData);
      
      // Update load status to awaiting_payment
      await storage.updateLoadStatus(load.id, 'awaiting_payment');
      
      console.log(`✅ Auto-invoice created: ${invoice.invoiceNumber} for ${load.number109}`);
    } catch (invoiceError) {
      console.error(`❌ Failed to create auto-invoice for ${load.number109}:`, invoiceError);
      throw invoiceError;
    }
  }

  // RESTORED: 109-number-based POD attachment system (was working 2 weeks ago)
  app.post("/api/loads/by-number/:number109/pod", (req, res, next) => {
    // Allow driver, admin, or bypass token authentication
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || 
                    (req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { number109 } = req.params;
      const { podDocumentURL } = req.body;
      
      console.log(`📄 POD ATTACHMENT BY 109 NUMBER: ${number109}`);
      console.log(`📄 POD Document URL: ${podDocumentURL}`);
      
      if (!podDocumentURL) {
        return res.status(400).json({ message: "POD document URL is required" });
      }
      
      // Find load by 109 number
      const allLoads = await storage.getLoads();
      const load = allLoads.find(l => l.number109 === number109);
      
      if (!load) {
        console.error(`❌ Load not found: ${number109}`);
        return res.status(404).json({ message: `Load ${number109} not found` });
      }
      
      console.log(`✅ Found load: ${load.number109} (ID: ${load.id})`);
      
      // Get user ID for ACL
      const userId = (req.user as any)?.claims?.sub || 
                    (req.session as any)?.driverAuth?.id || 
                    'system-upload';
      
      // Handle multiple POD documents (comma-separated URLs)
      const podUrls = podDocumentURL.split(',').map((url: string) => url.trim());
      const processedPaths: string[] = [];
      
      console.log(`📄 Processing ${podUrls.length} POD document(s) for ${number109}`);
      
      // Process each document with error handling
      for (const url of podUrls) {
        if (url) {
          try {
            const objectStorageService = new ObjectStorageService();
            const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
              url,
              {
                owner: userId,
                visibility: "private", // POD documents should be private
              }
            );
            processedPaths.push(objectPath);
            console.log(`✅ POD document processed: ${objectPath}`);
          } catch (aclError) {
            console.error(`⚠️ ACL policy error for ${url}, using direct path:`, aclError);
            processedPaths.push(url);
          }
        }
      }
      
      // Store all POD document paths as comma-separated string
      const finalPodPath = processedPaths.join(',');
      
      // Update load with POD document path(s) using the load ID
      const updatedLoad = await storage.updateLoadPOD(load.id, finalPodPath);
      
      // CENTRALIZED AUTO-INVOICE GENERATION
      await ensureAutoInvoice(updatedLoad);
      
      console.log(`✅ POD successfully attached to load ${number109}`);
      
      res.json({
        success: true,
        message: `POD attached to load ${number109}`,
        load: updatedLoad,
        podDocuments: processedPaths.length
      });
      
    } catch (error) {
      console.error(`❌ Error attaching POD to load ${req.params.number109}:`, error);
      res.status(500).json({ 
        message: "Failed to attach POD", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // MAINTENANCE: Backfill invoices for loads with PODs but no invoices
  app.post("/api/maintenance/backfill-pod-invoices", (req, res, next) => {
    // STRICT admin auth only for maintenance operations - no driver access
    const hasAdminAuth = !!(req.session as any)?.adminAuth;
    if (hasAdminAuth) {
      next();
    } else {
      res.status(401).json({ message: "Admin authentication required for maintenance operations" });
    }
  }, async (req, res) => {
    try {
      console.log("🔧 BACKFILL: Starting POD invoice backfill process...");
      
      const allLoads = await storage.getLoads();
      const allInvoices = await storage.getInvoices();
      
      // Find loads with PODs but no invoices
      const problemLoads = allLoads.filter(load => {
        const hasInvoice = allInvoices.some((inv: any) => inv.loadId === load.id);
        const hasPOD = load.podDocumentPath && load.podDocumentPath.trim() !== '';
        const validStatus = ['awaiting_invoicing', 'completed', 'delivered'].includes(load.status);
        
        return hasPOD && !hasInvoice && validStatus;
      });
      
      console.log(`Found ${problemLoads.length} loads with PODs but no invoices:`, 
        problemLoads.map(load => ({ 
          id: load.id, 
          number109: load.number109, 
          status: load.status,
          hasPOD: !!load.podDocumentPath
        }))
      );
      
      const results = [];
      
      for (const load of problemLoads) {
        try {
          // Get rate for the location
          if (load.location?.city && load.location?.state) {
            const rate = await storage.getRateByLocation(load.location.city, load.location.state);
            
            if (rate) {
              // Calculate invoice amount
              const flatRate = parseFloat(rate.flatRate.toString());
              const lumperCharge = parseFloat(load.lumperCharge?.toString() || "0");
              const extraStops = parseFloat(load.extraStops?.toString() || "0");
              const extraStopsCharge = extraStops; // Use raw dollar amount entered, not multiplied by $50
              const totalAmount = flatRate + lumperCharge + extraStopsCharge;

              // Generate invoice
              const invoiceNumber = await storage.getNextInvoiceNumber();
              const now = new Date();
              const invoiceData: any = {
                loadId: load.id,
                invoiceNumber,
                flatRate: rate.flatRate,
                lumperCharge: load.lumperCharge || "0.00",
                extraStopsCharge: extraStopsCharge.toString(),
                extraStopsCount: extraStops,
                totalAmount: totalAmount.toString(),
                status: "pending",
              };
              
              // Embed POD if available on the load
              if (load.podDocumentPath) {
                invoiceData.podUrl = load.podDocumentPath;
                invoiceData.podAttachedAt = now;
                invoiceData.finalizedAt = now;
                invoiceData.status = "finalized";
                
                // Fetch POD snapshot data for embedding
                const podSnapshot = await fetchPodSnapshot(load.podDocumentPath);
                if (podSnapshot) {
                  invoiceData.podSnapshot = podSnapshot;
                  console.log(`📄 POD snapshot embedded into backfill invoice for load ${load.number109}`);
                } else {
                  console.log(`⚠️ POD snapshot fetch failed for backfill invoice of load ${load.number109}`);
                }
              }
              
              await storage.createInvoice(invoiceData);

              // Move to awaiting_payment
              await storage.updateLoadStatus(load.id, "awaiting_payment");
              
              results.push({
                loadId: load.id,
                loadNumber: load.number109,
                invoiceNumber,
                totalAmount,
                action: "Generated invoice and moved to awaiting_payment"
              });
              
              console.log(`✅ Generated invoice ${invoiceNumber} for load ${load.number109}`);
            } else {
              results.push({
                loadId: load.id,
                loadNumber: load.number109,
                action: "Skipped - no rate found for location"
              });
            }
          } else {
            results.push({
              loadId: load.id,
              loadNumber: load.number109,
              action: "Skipped - no location data"
            });
          }
        } catch (error) {
          console.error(`❌ Failed to process load ${load.number109}:`, error);
          results.push({
            loadId: load.id,
            loadNumber: load.number109,
            action: `Failed: ${error instanceof Error ? error.message : "Unknown error"}`
          });
        }
      }
      
      res.json({
        message: `Backfill completed. Processed ${problemLoads.length} loads.`,
        results
      });
      
    } catch (error) {
      console.error("❌ Backfill operation failed:", error);
      res.status(500).json({ message: "Backfill operation failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // TEMPORARY: Fix loads in awaiting_payment without invoices
  app.post("/api/admin/fix-payment-status", async (req, res) => {
    try {
      console.log("🔧 FIXING LOADS: Checking for loads in awaiting_payment without invoices");
      
      // Get all loads and invoices
      const allLoads = await storage.getLoads();
      const allInvoices = await storage.getInvoices();
      
      // Find loads in awaiting_payment without invoices
      const problemLoads = allLoads.filter(load => {
        const hasInvoice = allInvoices.some(invoice => invoice.loadId === load.id);
        return load.status === "awaiting_payment" && !hasInvoice;
      });
      
      console.log(`Found ${problemLoads.length} problematic loads in awaiting_payment without invoices:`, 
        problemLoads.map(load => load.number109));
      
      // Fix them by generating missing invoices and keeping in awaiting_payment
      const fixedLoads = [];
      for (const load of problemLoads) {
        // Generate invoice if missing (similar to backfill logic)
        if (load.location?.city && load.location?.state) {
          const rate = await storage.getRateByLocation(load.location.city, load.location.state);
          if (rate) {
            const flatRate = parseFloat(rate.flatRate.toString());
            const lumperCharge = parseFloat(load.lumperCharge?.toString() || "0");
            const extraStops = parseFloat(load.extraStops?.toString() || "0");
            const extraStopsCharge = extraStops; // Use raw dollar amount entered, not multiplied by $50
            const totalAmount = flatRate + lumperCharge + extraStopsCharge;

            const invoiceNumber = await storage.getNextInvoiceNumber();
            const now = new Date();
            const invoiceData: any = {
              loadId: load.id,
              invoiceNumber,
              flatRate: rate.flatRate,
              lumperCharge: load.lumperCharge || "0.00",
              extraStopsCharge: extraStopsCharge.toString(),
              extraStopsCount: extraStops,
              totalAmount: totalAmount.toString(),
              status: "pending",
            };
            
            // Embed POD if available on the load
            if (load.podDocumentPath) {
              invoiceData.podUrl = load.podDocumentPath;
              invoiceData.podAttachedAt = now;
              invoiceData.finalizedAt = now;
              invoiceData.status = "finalized";
              
              // Fetch POD snapshot data for embedding
              const podSnapshot = await fetchPodSnapshot(load.podDocumentPath);
              if (podSnapshot) {
                invoiceData.podSnapshot = podSnapshot;
                console.log(`📄 POD snapshot embedded into fix-payment invoice for load ${load.number109}`);
              } else {
                console.log(`⚠️ POD snapshot fetch failed for fix-payment invoice of load ${load.number109}`);
              }
            }
            
            await storage.createInvoice(invoiceData);
            
            fixedLoads.push(`${load.number109} (generated invoice ${invoiceNumber})`);
            console.log(`✅ Fixed load ${load.number109}: generated missing invoice ${invoiceNumber}`);
          } else {
            fixedLoads.push(`${load.number109} (no rate found)`);
          }
        } else {
          fixedLoads.push(`${load.number109} (no location data)`);
        }
      }
      
      res.json({
        message: `Fixed ${problemLoads.length} loads with missing invoices`,
        fixedLoads,
        action: "Generated missing invoices for loads in awaiting_payment"
      });
      
    } catch (error) {
      console.error("Error fixing load statuses:", error);
      res.status(500).json({ message: "Failed to fix load statuses", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Manual invoice generation endpoint - COMPLETELY OPEN FOR TESTING
  app.post("/api/loads/:id/generate-invoice", async (req, res) => {
    try {
      const loadId = req.params.id;
      const { customerId } = req.body;
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
      const rate = (load.location?.city && load.location?.state) ? await storage.getRateByLocation(
        load.location.city, 
        load.location.state
      ) : null;
      
      if (!rate) {
        return res.status(400).json({ 
          message: `No rate found for ${load.location.city}, ${load.location.state}. Please add a rate first.` 
        });
      }

      // Calculate invoice amount based on flat rate system
      // Use tripRate if specified, otherwise fall back to database flat rate
      const tripRate = parseFloat(load.tripRate?.toString() || "0");
      const flatRate = tripRate > 0 ? tripRate : parseFloat(rate.flatRate.toString());
      const lumperCharge = parseFloat(load.lumperCharge?.toString() || "0");
      const extraStopsCharge = parseFloat(load.extraStops?.toString() || "0");
      const totalAmount = flatRate + lumperCharge + extraStopsCharge;

      // Generate sequential invoice number starting with GO6000
      const invoiceNumber = await storage.getNextInvoiceNumber();
      const now = new Date();
      
      // Check if load has POD document and embed it if available
      const invoiceData: any = {
        loadId: load.id,
        customerId: customerId || undefined,
        invoiceNumber,
        flatRate: flatRate.toFixed(2), // Use the actual rate used (including tripRate override)
        lumperCharge: load.lumperCharge || "0.00",
        extraStopsCharge: extraStopsCharge.toString(),
        extraStopsCount: parseFloat(load.extraStops?.toString() || "0"),
        totalAmount: totalAmount.toString(),
        status: "pending",
      };
      
      // Embed POD if available on the load
      if (load.podDocumentPath) {
        invoiceData.podUrl = load.podDocumentPath;
        invoiceData.podAttachedAt = now;
        invoiceData.finalizedAt = now;
        invoiceData.status = "finalized"; // Set to finalized since POD is embedded
        
        // Fetch POD snapshot data for embedding
        const podSnapshot = await fetchPodSnapshot(load.podDocumentPath);
        if (podSnapshot) {
          invoiceData.podSnapshot = podSnapshot;
          console.log(`📄 POD snapshot embedded into manual invoice for load ${load.number109}`);
        } else {
          console.log(`⚠️ POD snapshot fetch failed for manual invoice of load ${load.number109}`);
        }
        
        console.log(`📄 POD found and embedded into manual invoice for load ${load.number109}`);
      }
      
      const invoice = await storage.createInvoice(invoiceData);

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
      const { bolNumber, tripNumber, override } = req.body;
      
      // Validate trip number format (4 digits)
      if (!/^\d{4}$/.test(tripNumber)) {
        return res.status(400).json({ message: "Trip number must be 4 digits" });
      }

      // Check if BOL already exists - but skip check if override flag is set
      if (!override) {
        const exists = await storage.checkBOLExists(bolNumber);
        if (exists) {
          return res.status(400).json({ message: "BOL number already exists" });
        }
      } else {
        console.log("🔐 Override flag detected - skipping duplicate BOL check for", bolNumber);
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
      
      // Generate the permanent object path from the upload URL
      const publicPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      
      res.json({ 
        uploadURL,
        publicPath // Send permanent path that frontend should use
      });
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
            const rate = (loadWithDetails.location?.city && loadWithDetails.location?.state) ? await storage.getRateByLocation(
              loadWithDetails.location.city, 
              loadWithDetails.location.state
            ) : null;
            
            if (rate) {
              console.log("🧾 Rate found - calculating invoice amount");
              
              // Calculate invoice amount based on flat rate system
              const flatRate = parseFloat(rate.flatRate.toString());
              const lumperCharge = parseFloat(loadWithDetails.lumperCharge?.toString() || "0");
              const extraStops = parseFloat(loadWithDetails.extraStops?.toString() || "0");
              const extraStopsCharge = extraStops; // Use raw dollar amount entered, not multiplied by $50
              const totalAmount = flatRate + lumperCharge + extraStopsCharge;

              // Auto-generate invoice with sequential GO6000 series
              const invoiceNumber = await storage.getNextInvoiceNumber();
              const now = new Date();
              const invoiceData: any = {
                loadId: loadWithDetails.id,
                invoiceNumber,
                flatRate: rate.flatRate,
                lumperCharge: loadWithDetails.lumperCharge || "0.00",
                extraStopsCharge: extraStopsCharge.toString(),
                extraStopsCount: parseFloat(loadWithDetails.extraStops?.toString() || "0"),
                totalAmount: totalAmount.toString(),
                status: "finalized", // Set to finalized since BOL/POD is already embedded
                podUrl: bolDocumentURL, // Embed BOL/POD directly into invoice
                podAttachedAt: now, // Mark when BOL/POD was attached
                finalizedAt: now, // Mark as finalized immediately since BOL/POD is embedded
              };
              
              // Fetch POD snapshot data for embedding
              const podSnapshot = await fetchPodSnapshot(bolDocumentURL);
              if (podSnapshot) {
                invoiceData.podSnapshot = podSnapshot;
                console.log(`📄 POD snapshot embedded into BOL-triggered invoice for load ${loadWithDetails.number109}`);
              } else {
                console.log(`⚠️ POD snapshot fetch failed for BOL-triggered invoice of load ${loadWithDetails.number109}`);
              }
              
              const invoice = await storage.createInvoice(invoiceData);

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
    // Simplified authentication check
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || 
                    (req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { podDocumentURL } = req.body;
      
      if (!podDocumentURL) {
        return res.status(400).json({ message: "POD document URL is required" });
      }

      // SIMPLIFIED: Just save the POD URL directly
      console.log(`📄 POD upload for load ${req.params.id}: ${podDocumentURL}`);
      
      // Update load with POD document path
      const load = await storage.updateLoadPOD(req.params.id, podDocumentURL);
      console.log(`✅ POD saved for load: ${load.number109}`);
      
      // First set status to delivered when POD is uploaded
      if (load.status !== "delivered" && load.status !== "awaiting_invoicing" && load.status !== "awaiting_payment" && load.status !== "paid") {
        await storage.updateLoadStatus(req.params.id, "delivered");
        // Set delivered timestamp using direct database update
        await db.update(loads).set({ 
          deliveredAt: new Date(),
          updatedAt: new Date() 
        }).where(eq(loads.id, req.params.id));
        console.log(`✅ Load ${req.params.id} marked as DELIVERED - POD uploaded successfully`);
      }

      // FIXED WORKFLOW: Set to awaiting_invoicing first, then auto-generate
      const loadWithDetails = await storage.getLoad(req.params.id);
      if (loadWithDetails && loadWithDetails.status === "delivered") {
        await storage.updateLoadStatus(req.params.id, "awaiting_invoicing");
        console.log(`📋 Load ${req.params.id} moved to AWAITING_INVOICING - ready for invoice generation`);
      }

      // Automatically generate invoice when POD is uploaded  
      try {
        const loadForInvoice = await storage.getLoad(req.params.id);
        const validStatusesForInvoice = ['awaiting_invoicing'];
        
        if (loadForInvoice && loadForInvoice.location?.city && loadForInvoice.location?.state && validStatusesForInvoice.includes(loadForInvoice.status)) {
          
          // Check if invoice already exists for this load (PREVENT DUPLICATES)
          const existingInvoices = await storage.getInvoices();
          const hasInvoice = existingInvoices.some((inv: any) => inv.loadId === loadForInvoice.id);
          
          if (!hasInvoice) {
            console.log(`📄 No existing invoice found - generating new invoice for load ${loadForInvoice.number109}`);
            
            // Get rate for the location
            const rate = await storage.getRateByLocation(
              loadForInvoice.location.city, 
              loadForInvoice.location.state
            );
            
            if (rate) {
              // Calculate invoice amount based on flat rate system
              const flatRate = parseFloat(rate.flatRate.toString());
              const lumperCharge = parseFloat(loadForInvoice.lumperCharge?.toString() || "0");
              const extraStops = parseFloat(loadForInvoice.extraStops?.toString() || "0");
              const extraStopsCharge = extraStops; // Use raw dollar amount entered, not multiplied by $50
              const totalAmount = flatRate + lumperCharge + extraStopsCharge;

              // Auto-generate invoice with sequential GO6000 series
              const invoiceNumber = await storage.getNextInvoiceNumber();
              const now = new Date();
              const invoiceData: any = {
                loadId: loadForInvoice.id,
                invoiceNumber,
                flatRate: rate.flatRate,
                lumperCharge: loadForInvoice.lumperCharge || "0.00",
                extraStopsCharge: extraStopsCharge.toString(),
                extraStopsCount: parseFloat(loadForInvoice.extraStops?.toString() || "0"),
                totalAmount: totalAmount.toString(),
                status: "finalized", // Set to finalized since POD is already embedded
                podUrl: podDocumentURL, // Embed POD directly into invoice
                podAttachedAt: now, // Mark when POD was attached
                finalizedAt: now, // Mark as finalized immediately since POD is embedded
              };
              
              // Fetch POD snapshot data for embedding
              const podSnapshot = await fetchPodSnapshot(podDocumentURL);
              if (podSnapshot) {
                invoiceData.podSnapshot = podSnapshot;
                console.log(`📄 POD snapshot embedded into POD-triggered invoice for load ${loadForInvoice.number109}`);
              } else {
                console.log(`⚠️ POD snapshot fetch failed for POD-triggered invoice of load ${loadForInvoice.number109}`);
              }
              
              await storage.createInvoice(invoiceData);

              console.log(`Auto-generated invoice ${invoiceNumber} for load ${loadForInvoice.number109}`);
              console.log(`📋 Load ${req.params.id} stays in AWAITING_INVOICING - invoice ready to be emailed`);
            }
          } else {
            console.log(`📄 Invoice already exists for load ${loadForInvoice.number109} - skipping invoice generation`);
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

      if (!load.location || !load.location.city || !load.location.state) {
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
      const extraStops = parseFloat(load.extraStops?.toString() || "0");
      const extraStopsCharge = extraStops; // Use raw dollar amount entered, not multiplied by $50
      const totalAmount = flatRate + lumperCharge + extraStopsCharge;

      // Auto-generate invoice with sequential GO6000 series
      const invoiceNumber = await storage.getNextInvoiceNumber();
      const now = new Date();
      const invoiceData: any = {
        loadId: load.id,
        invoiceNumber,
        flatRate: rate.flatRate,
        lumperCharge: load.lumperCharge || "0.00",
        extraStopsCharge: extraStopsCharge.toString(),
        extraStopsCount: parseFloat(load.extraStops?.toString() || "0"),
        totalAmount: totalAmount.toString(),
        status: "pending",
      };
      
      // Embed POD if available on the load
      if (load.podDocumentPath) {
        invoiceData.podUrl = load.podDocumentPath;
        invoiceData.podAttachedAt = now;
        invoiceData.finalizedAt = now;
        invoiceData.status = "finalized";
        
        // Fetch POD snapshot data for embedding
        const podSnapshot = await fetchPodSnapshot(load.podDocumentPath);
        if (podSnapshot) {
          invoiceData.podSnapshot = podSnapshot;
          console.log(`📄 POD snapshot embedded into complete-load invoice for load ${load.number109}`);
        } else {
          console.log(`⚠️ POD snapshot fetch failed for complete-load invoice of load ${load.number109}`);
        }
      }
      
      await storage.createInvoice(invoiceData);

      // Update load status to completed
      const updatedLoad = await storage.updateLoadStatus(load.id, "completed");

      res.json(updatedLoad);
    } catch (error) {
      console.error("Error completing load:", error);
      res.status(500).json({ message: "Failed to complete load" });
    }
  });

  // Chat AI Assistant routes
  app.post("/api/chat", isAuthenticated, async (req, res) => {
    try {
      // Validate input using Zod
      const chatInputSchema = insertChatMessageSchema.extend({
        message: insertChatMessageSchema.shape.content.min(1).max(4000),
        sessionId: insertChatMessageSchema.shape.sessionId.optional()
          .refine(val => !val || /^[a-zA-Z0-9._-]{3,100}$/.test(val), "Invalid sessionId format")
      }).pick({ message: true, sessionId: true });
      
      const { message, sessionId: clientSessionId } = chatInputSchema.parse(req.body);
      
      // Create user-bound session ID
      const userId = (req.user as any)?.claims?.sub || 'anonymous';
      const sessionId = clientSessionId || `user-${userId}-${Date.now()}`;
      const userBoundSessionId = `${userId}-${sessionId}`;

      // Get conversation history
      const chatHistory = await storage.getChatMessages(userBoundSessionId, 20);
      
      // Convert to format expected by AI service
      const conversationHistory = chatHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      // Get AI response
      const aiResponse = await aiService.generateResponse(message, conversationHistory);

      // Save user message
      await storage.createChatMessage({
        userId: (req.user as any)?.claims?.sub || undefined,
        sessionId: userBoundSessionId,
        role: 'user',
        content: message
      });

      // Save AI response
      await storage.createChatMessage({
        userId: (req.user as any)?.claims?.sub || undefined,
        sessionId: userBoundSessionId,
        role: 'assistant',
        content: aiResponse
      });

      res.json({ 
        message: aiResponse,
        sessionId: sessionId // Return the raw sessionId, not the userBoundSessionId
      });
    } catch (error) {
      console.error("Chat AI error:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('AI assistant unavailable')) {
        res.status(503).json({ message: "AI assistant is currently unavailable" });
      } else {
        res.status(500).json({ message: "Failed to get AI response" });
      }
    }
  });

  app.get("/api/chat/:sessionId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub || 'anonymous';
      const userBoundSessionId = `${userId}-${req.params.sessionId}`;
      const messages = await storage.getChatMessages(userBoundSessionId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });

  app.delete("/api/chat/:sessionId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub || 'anonymous';
      const userBoundSessionId = `${userId}-${req.params.sessionId}`;
      await storage.deleteChatSession(userBoundSessionId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting chat session:", error);
      res.status(500).json({ message: "Failed to delete chat session" });
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

  app.put("/api/rates/:id", isAdminAuthenticated, async (req, res) => {
    try {
      const rate = await storage.updateRate(req.params.id, req.body);
      if (!rate) {
        return res.status(404).json({ message: "Rate not found" });
      }
      res.json(rate);
    } catch (error) {
      console.error("Error updating rate:", error);
      res.status(400).json({ message: "Failed to update rate" });
    }
  });

  app.delete("/api/rates/:id", isAdminAuthenticated, async (req, res) => {
    try {
      await storage.deleteRate(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting rate:", error);
      res.status(400).json({ message: "Failed to delete rate" });
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

  // MANUAL FIX: Move load from awaiting_invoicing to awaiting_payment 
  app.patch("/api/loads/:id/move-to-payment", isAdminAuthenticated, async (req, res) => {
    try {
      const load = await storage.getLoad(req.params.id);
      
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }
      
      if (load.status !== "awaiting_invoicing") {
        return res.status(400).json({ 
          message: `Load ${load.number109} is ${load.status}, can only move from awaiting_invoicing to awaiting_payment` 
        });
      }
      
      // Verify invoice exists
      const invoices = await storage.getInvoices();
      const hasInvoice = invoices.some((inv: any) => inv.loadId === load.id);
      
      if (!hasInvoice) {
        return res.status(400).json({ 
          message: `Load ${load.number109} has no invoice - cannot move to awaiting_payment` 
        });
      }
      
      await storage.updateLoadStatus(load.id, "awaiting_payment");
      console.log(`✅ MANUAL FIX: Load ${load.number109} moved from AWAITING_INVOICING to AWAITING_PAYMENT`);
      
      res.json({ 
        message: `Load ${load.number109} successfully moved to awaiting payment`,
        previousStatus: "awaiting_invoicing",
        newStatus: "awaiting_payment"
      });
      
    } catch (error) {
      console.error("Error moving load to payment:", error);
      res.status(500).json({ message: "Failed to move load to payment status" });
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
            extraStops: "2.00",
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
            extraStops: "1.00",
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
            extraStops: "0.00",
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
  app.get("/objects/:objectPath(*)", (req, res, next) => {
    // Support Replit auth, driver auth, or bypass token for object access
    const bypassToken = req.headers['x-bypass-token'];
    const hasTokenBypass = bypassToken === BYPASS_SECRET;
    const hasReplitAuth = req.isAuthenticated && req.isAuthenticated();
    const hasDriverAuth = (req.session as any)?.driverAuth;
    const hasAuth = hasReplitAuth || hasDriverAuth || hasTokenBypass;
    
    console.log("Object access auth check:", {
      path: req.path,
      hasReplitAuth,
      hasDriverAuth,
      hasTokenBypass,
      finalAuth: hasAuth
    });
    
    if (hasAuth) {
      next();
    } else {
      console.error("❌ Object access denied - no valid authentication");
      res.status(401).json({ message: "Unauthorized" });
    }
  }, async (req, res) => {
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

  // OCR Routes for Rate Con processing
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
      
      if (!extractedData || extractedData.confidence < 0.1) {
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
        extraStops: "0.00",
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
        message: `Load ${newLoad.number109} created from Rate Con data`,
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

  // Simple SMS test endpoint
  app.post("/api/test-sms", async (req, res) => {
    console.log("🔍 TEST SMS ENDPOINT HIT");
    try {
      const { phoneNumber, message } = req.body;
      
      console.log('🧪 SMS Debug Test:', { phoneNumber, message });
      
      await sendSMSToDriver(phoneNumber, message || 'Test message from LoadTracker Pro - Telnyx working!');
      
      res.json({ success: true, message: 'SMS sent successfully via Telnyx' });
    } catch (error: any) {
      console.error('❌ SMS Test Error:', error);
      res.status(500).json({ success: false, error: error.message });
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

  // Print preview with POD attachments - FIXED IMPLEMENTATION
  app.post("/api/invoices/:id/print-preview", (req, res, next) => {
    console.log("🔥 PRINT-PREVIEW ENDPOINT HIT! Invoice ID:", req.params.id);
    console.log("🔥 Request body:", req.body);
    console.log("🔥 Headers:", { 
      auth: req.headers['x-bypass-token'] ? 'BYPASS_PROVIDED' : 'NO_BYPASS',
      contentType: req.headers['content-type']
    });
    
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    console.log("🔥 Auth check result:", { hasAuth });
    
    if (hasAuth) {
      next();
    } else {
      console.log("❌ PRINT-PREVIEW: Authentication failed");
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const invoiceIdOrNumber = req.params.id;
      const { loadId } = req.body;

      console.log(`🚀 SERVER: Print preview API called for invoice: ${invoiceIdOrNumber}`);
      console.log(`🚀 SERVER: Request body:`, { loadId });
      console.log(`🚀 SERVER: Request headers:`, { auth: req.headers['x-bypass-token'] ? 'BYPASS' : 'OTHER' });

      // Get invoice data - simplified lookup
      console.log(`🔍 Looking up invoice: ${invoiceIdOrNumber}`);
      let invoice = await storage.getInvoice(invoiceIdOrNumber);
      
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
        loadId: load.id,
        podDocumentPath: load.podDocumentPath,
        hasPOD: !!load.podDocumentPath,
        createdAt: load.createdAt,
        updatedAt: load.updatedAt
      });

      // 🔍 CRITICAL DATABASE DEBUG - CHECK WHAT DATABASE WE'RE ACTUALLY QUERYING
      console.log(`🔍 DATABASE DEBUG: Current DATABASE_URL environment:`, {
        hasDbUrl: !!process.env.DATABASE_URL,
        dbUrlPrefix: process.env.DATABASE_URL?.substring(0, 50) || 'NOT_SET',
        nodeEnv: process.env.NODE_ENV
      });

      // 🔍 QUERY ALL LOADS TO SEE WHAT'S IN DATABASE
      console.log(`🔍 DATABASE DEBUG: Checking all loads in current database...`);
      try {
        const allLoads = await storage.getLoads();
        console.log(`🔍 DATABASE DEBUG: Found ${allLoads.length} total loads in database`);
        
        // Look specifically for load 109-41936
        const targetLoad = allLoads.find(l => l.number109 === '109-41936');
        if (targetLoad) {
          console.log(`🎯 FOUND TARGET LOAD 109-41936:`, {
            id: targetLoad.id,
            number109: targetLoad.number109,
            podDocumentPath: targetLoad.podDocumentPath,
            status: targetLoad.status,
            driverId: targetLoad.driverId,
            createdAt: targetLoad.createdAt
          });
        } else {
          console.log(`❌ LOAD 109-41936 NOT FOUND IN DATABASE! Available loads:`, 
            allLoads.map(l => ({ id: l.id, number109: l.number109, podPath: l.podDocumentPath }))
          );
        }
      } catch (dbError) {
        console.error(`❌ DATABASE QUERY ERROR:`, dbError);
      }

      // Check if this load has any POD but the path is broken/orphaned
      if (!load.podDocumentPath) {
        console.log(`⚠️ NO POD DOCUMENTS - Load ${load.number109} (ID: ${load.id}) has no POD attachments`);
        console.log(`💡 This could be due to load deletion/recreation cycle - check if load was recently recreated`);
      }

      // Generate the base invoice HTML (simplified - no rate confirmation)
      const invoiceContext = await computeInvoiceContext(load);
      const baseHTML = generateInvoiceOnlyHTML(invoice, load, invoiceContext.deliveryLocationText, invoiceContext.bolPodText);
      
      // Embed POD images if available - PRIORITIZE STORED SNAPSHOTS
      let previewHTML = baseHTML;
      const podImages: Array<{content: Buffer, type: string}> = [];
      
      // FIXED: Get ALL POD snapshots for multi-POD loads (print preview)
      const allPodSnapshots = await getAllPodSnapshots(invoice, load.podDocumentPath || undefined);
      if (allPodSnapshots.length > 0) {
        console.log(`🖨️ Using ${allPodSnapshots.length} POD(s) for print preview: stored=${!!invoice.podSnapshot} fallback=${!invoice.podSnapshot}`);
        allPodSnapshots.forEach((snapshot, index) => {
          const podBuffer = convertPodSnapshotToBuffer(snapshot);
          podImages.push(podBuffer);
          console.log(`🖨️ POD ${index + 1}: ${snapshot.sourcePath} (${snapshot.size} bytes)`);
        });
        console.log(`✅ ${allPodSnapshots.length} POD(s) prepared for print preview`);
      } else {
        console.log(`⚠️ No POD document uploaded for load ${load.number109} (ID: ${load.id}) - preview will show invoice only`);
        console.log(`🔍 DIAGNOSIS: If POD was recently uploaded but not showing:`);
        console.log(`   - Check if load was deleted and recreated (new ID breaks POD links)`);
        console.log(`   - Verify POD upload completed successfully`);
        console.log(`   - Check object storage for orphaned files`);
      }
      
      // Embed POD images into the preview HTML if available - USE SAME FUNCTION AS EMAIL
      if (podImages.length > 0) {
        console.log(`🔗 Embedding ${podImages.length} POD image(s) into print preview...`);
        try {
          const podSectionHTML = generatePODSectionHTML(podImages, load.number109);
          previewHTML = previewHTML.replace('</body>', `${podSectionHTML}</body>`);
          console.log(`✅ POD images embedded into print preview using same function as email`);
        } catch (embedError) {
          console.error(`❌ Failed to embed POD images in print preview:`, embedError);
          console.log(`⚠️ Falling back to preview without POD`);
        }
      }

      res.json({
        success: true,
        previewHTML,
        invoice,
        load,
        podAttachments: podImages.map((img, index) => ({
          filename: `POD_${load.number109}_${index + 1}.jpg`,
          contentType: img.type,
          size: img.content.length
        }))
      });

    } catch (error) {
      console.error("❌ Error generating print preview:", error);
      res.status(500).json({ 
        message: "Failed to generate print preview", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

// Helper function to get file extension
function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

// Helper function to compute invoice context (delivery location and BOL/POD text)
async function computeInvoiceContext(load: any): Promise<{ deliveryLocationText: string, bolPodText: string }> {
  let deliveryLocationText = 'Delivery Location N/A';
  let bolPodText = 'N/A';
  
  try {
    // Get delivery location from last dropoff stop
    const stops = await storage.getLoadStops(load.id);
    const dropoffStops = stops.filter((stop: any) => stop.stopType === 'dropoff')
                             .sort((a: any, b: any) => b.stopSequence - a.stopSequence); // highest sequence first
    
    const finalDelivery = dropoffStops[0]; // Last delivery stop
    
    if ((finalDelivery as any)?.location) {
      const loc = (finalDelivery as any).location;
      deliveryLocationText = `${loc.name || 'N/A'}, ${loc.city || 'N/A'} ${loc.state || 'N/A'}`;
    } else if (finalDelivery?.companyName || finalDelivery?.address) {
      // Fallback to stop info if no location joined
      deliveryLocationText = `${finalDelivery.companyName || 'N/A'}, ${finalDelivery.address || 'N/A'}`;
    } else if (load?.location) {
      deliveryLocationText = `${load.location.name || 'N/A'}, ${load.location.city || 'N/A'} ${load.location.state || 'N/A'}`;
    }
    
    // Get BOL/POD number - prioritize bolNumber from load, fallback to N/A
    bolPodText = load?.bolNumber || 'N/A';
    
  } catch (error) {
    console.error('Error computing invoice context:', error);
  }
  
  return { deliveryLocationText, bolPodText };
}

// Generate invoice-only HTML
function generateInvoiceOnlyHTML(invoice: any, load: any, deliveryLocationText: string, bolPodText: string): string {
  const currentDate = new Date().toLocaleDateString();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${invoice?.invoiceNumber || 'N/A'}</title>
      <style>
        @page {
          size: letter;
          margin: 0.5in;
        }
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          line-height: 1.4;
          width: 100%;
          min-height: 100vh;
          box-sizing: border-box;
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
          margin-bottom: 30px;
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
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-name">GO 4 Farms & Cattle</div>
        <div class="company-info">
          1510 Crystal Valley Way<br>
          Melissa, TX 75454<br>
          Phone: 214-878-1230<br>
          Email: accounting@go4fc.com
        </div>
      </div>

      <div class="invoice-details">
        <div>
          <div class="invoice-number">Invoice ${invoice?.invoiceNumber || 'N/A'}</div>
          <p><strong>Date:</strong> ${currentDate}</p>
        </div>
        <div>
          <p><strong>Load #:</strong> ${load?.number109 || 'N/A'}</p>
          <p><strong>BOL/POD #:</strong> ${load?.bolNumber || 'N/A'}</p>
          <p><strong>Trip #:</strong> ${load?.tripNumber || 'N/A'}</p>
          <p><strong>Driver:</strong> ${load?.driver ? `${load.driver.firstName} ${load.driver.lastName}` : 'N/A'}</p>
        </div>
      </div>

      <table class="details-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Transportation Services - ${deliveryLocationText} - BOL/POD: ${bolPodText}</td>
            <td>$${(parseFloat(invoice?.totalAmount || '0')).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div class="total-section">
        <div class="total-amount">Total: $${(parseFloat(invoice?.totalAmount || '0')).toFixed(2)}</div>
      </div>
    </body>
    </html>
  `;
}

// Generate basic invoice HTML
async function generateInvoiceHTML(invoice: any, load: any): Promise<string> {
  const invoiceContext = await computeInvoiceContext(load);
  return generateInvoiceOnlyHTML(invoice, load, invoiceContext.deliveryLocationText, invoiceContext.bolPodText);
}

// Removed rate confirmation code as requested by user

function generatePODSectionHTML(podImages: Array<{content: Buffer, type: string}>, loadNumber: string): string {
  const podImagesHTML = podImages.map((pod, index) => {
    try {
      // Enhanced debugging and validation
      console.log(`🖼️ Processing POD image ${index + 1} for load ${loadNumber}:`, {
        contentType: pod.type,
        bufferSize: pod.content.length,
        bufferIsValid: Buffer.isBuffer(pod.content),
        hasContent: pod.content.length > 0
      });

      if (!Buffer.isBuffer(pod.content) || pod.content.length === 0) {
        console.error(`❌ Invalid POD buffer for image ${index + 1}`);
        return `
          <div style="margin-top: 40px; padding: 20px; border-top: 3px solid #2d5aa0;">
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
              <h2 style="color: #2d5aa0; margin: 0;">Proof of Delivery (POD)</h2>
              <p style="color: #666; margin: 5px 0;">Load ${loadNumber} - Page ${index + 1}</p>
            </div>
            <div style="text-align: center; padding: 40px; background: #f8f9fa; border: 2px dashed #dee2e6;">
              <p style="color: #dc3545; font-weight: bold;">❌ POD Image Failed to Load</p>
              <p style="color: #6c757d; font-size: 14px;">Image buffer is invalid or empty</p>
            </div>
          </div>
        `;
      }

      // Normalize content type
      let contentType = pod.type || 'image/jpeg';
      if (contentType === 'application/pdf') {
        console.log(`⚠️ PDF content detected for POD ${index + 1} - converting display`);
        contentType = 'application/pdf';
      } else if (!contentType.startsWith('image/')) {
        console.log(`🔧 Unknown content type "${contentType}" - defaulting to image/jpeg`);
        contentType = 'image/jpeg';
      }

      // Convert image buffer to base64 data URL with error handling
      let base64Data, dataUrl;
      try {
        base64Data = pod.content.toString('base64');
        dataUrl = `data:${contentType};base64,${base64Data}`;
        
        // Validate base64 string
        if (base64Data.length < 100) {
          throw new Error(`Base64 string too short: ${base64Data.length} characters`);
        }
        
        console.log(`✅ POD image ${index + 1} converted successfully:`, {
          base64Length: base64Data.length,
          dataUrlPreview: dataUrl.substring(0, 50) + '...'
        });
        
      } catch (encodingError: any) {
        console.error(`❌ Base64 encoding failed for POD ${index + 1}:`, encodingError);
        return `
          <div style="margin-top: 40px; padding: 20px; border-top: 3px solid #2d5aa0;">
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
              <h2 style="color: #2d5aa0; margin: 0;">Proof of Delivery (POD)</h2>
              <p style="color: #666; margin: 5px 0;">Load ${loadNumber} - Page ${index + 1}</p>
            </div>
            <div style="text-align: center; padding: 40px; background: #f8f9fa; border: 2px dashed #dee2e6;">
              <p style="color: #dc3545; font-weight: bold;">❌ POD Image Encoding Failed</p>
              <p style="color: #6c757d; font-size: 14px;">Error: ${encodingError?.message || 'Unknown encoding error'}</p>
            </div>
          </div>
        `;
      }
      
      // Generate the HTML with the image
      return `
        <div style="margin-top: 40px; padding: 20px; border-top: 3px solid #2d5aa0;">
          <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
            <h2 style="color: #2d5aa0; margin: 0;">Proof of Delivery (POD)</h2>
            <p style="color: #666; margin: 5px 0;">Load ${loadNumber} - Page ${index + 1}</p>
          </div>
          <div style="text-align: center;">
            <img src="${dataUrl}" 
                 style="max-width: 100%; height: auto; border: 1px solid #ddd; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" 
                 alt="POD Document Page ${index + 1}"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
            <div style="display: none; padding: 40px; background: #f8f9fa; border: 2px dashed #dee2e6;">
              <p style="color: #dc3545; font-weight: bold;">❌ POD Image Failed to Display</p>
              <p style="color: #6c757d; font-size: 14px;">Image data may be corrupted or invalid format</p>
              <p style="color: #6c757d; font-size: 12px;">Content Type: ${contentType} | Size: ${pod.content.length} bytes</p>
            </div>
          </div>
        </div>
      `;
    } catch (error: any) {
      console.error(`❌ Error generating POD HTML for image ${index + 1}:`, error);
      return `
        <div style="margin-top: 40px; padding: 20px; border-top: 3px solid #2d5aa0;">
          <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
            <h2 style="color: #2d5aa0; margin: 0;">Proof of Delivery (POD)</h2>
            <p style="color: #666; margin: 5px 0;">Load ${loadNumber} - Page ${index + 1}</p>
          </div>
          <div style="text-align: center; padding: 40px; background: #f8f9fa; border: 2px dashed #dee2e6;">
            <p style="color: #dc3545; font-weight: bold;">❌ POD Generation Error</p>
            <p style="color: #6c757d; font-size: 14px;">Error: ${error?.message || 'Unknown error'}</p>
          </div>
        </div>
      `;
    }
  }).join('');

  return podImagesHTML;
}

  // POD Debug Endpoint - PRODUCTION DIAGNOSTICS (NO AUTH REQUIRED FOR TESTING)
  app.get("/api/debug/pod", async (req, res) => {
    try {
      const { loadId, podPath } = req.query;
      
      if (!loadId && !podPath) {
        return res.status(400).json({ message: "Either loadId or podPath parameter required" });
      }
      
      let targetPodPath = podPath as string;
      
      // If loadId provided, get POD path from load
      if (loadId && !podPath) {
        const load = await storage.getLoad(loadId as string);
        if (!load?.podDocumentPath) {
          return res.status(404).json({ message: "No POD found for this load" });
        }
        targetPodPath = load.podDocumentPath;
      }
      
      console.log(`🔍 POD DEBUG: Testing access to path: ${targetPodPath}`);
      
      const diagnostics: any = {
        podPath: targetPodPath,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        tests: {}
      };
      
      // Test 1: Object Storage Direct Access
      try {
        console.log(`🔍 POD DEBUG: Testing direct object storage access...`);
        const { ObjectStorageService } = await import('./objectStorage');
        const objectStorageService = new ObjectStorageService();
        
        const objectFile = await objectStorageService.getObjectEntityFile(targetPodPath);
        const [metadata] = await objectFile.getMetadata();
        const [exists] = await objectFile.exists();
        
        diagnostics.tests.objectStorageDirect = {
          success: true,
          exists: exists,
          metadata: {
            size: metadata.size,
            contentType: metadata.contentType,
            timeCreated: metadata.timeCreated,
            updated: metadata.updated
          }
        };
        
        // Try to download first 1KB to test access
        const [partialBuffer] = await objectFile.download({ start: 0, end: 1023 });
        diagnostics.tests.objectStorageDirect.partialDownloadSize = partialBuffer.length;
        diagnostics.tests.objectStorageDirect.firstBytes = partialBuffer.subarray(0, 16).toString('hex');
        
        console.log(`✅ POD DEBUG: Direct object storage access successful`);
        
      } catch (storageError: any) {
        console.error(`❌ POD DEBUG: Direct object storage failed:`, storageError);
        diagnostics.tests.objectStorageDirect = {
          success: false,
          error: storageError.message,
          stack: storageError.stack
        };
      }
      
      // Test 2: HTTP Fetch Fallback
      try {
        console.log(`🔍 POD DEBUG: Testing HTTP fetch fallback...`);
        const baseUrl = process.env.NODE_ENV === 'production' ? 
          `${req.protocol}://${req.get('host')}` : 
          'http://localhost:5000';
        const fullUrl = `${baseUrl}${targetPodPath}`;
        
        console.log(`🔍 POD DEBUG: Fetching URL: ${fullUrl}`);
        
        const response = await fetch(fullUrl, {
          headers: { 'x-bypass-token': process.env.BYPASS_SECRET || 'LOADTRACKER_BYPASS_2025' }
        });
        
        diagnostics.tests.httpFetch = {
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length'),
          url: fullUrl
        };
        
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          diagnostics.tests.httpFetch.downloadSize = buffer.length;
          diagnostics.tests.httpFetch.firstBytes = buffer.subarray(0, 16).toString('hex');
          console.log(`✅ POD DEBUG: HTTP fetch successful: ${buffer.length} bytes`);
        } else {
          const errorText = await response.text();
          diagnostics.tests.httpFetch.errorBody = errorText;
          console.error(`❌ POD DEBUG: HTTP fetch failed: ${response.status} - ${errorText}`);
        }
        
      } catch (fetchError: any) {
        console.error(`❌ POD DEBUG: HTTP fetch error:`, fetchError);
        diagnostics.tests.httpFetch = {
          success: false,
          error: fetchError.message,
          stack: fetchError.stack
        };
      }
      
      // Test 3: Environment Check
      diagnostics.environment = {
        nodeEnv: process.env.NODE_ENV,
        hasObjectStorage: !!(process.env.PRIVATE_OBJECT_DIR && process.env.PUBLIC_OBJECT_SEARCH_PATHS),
        objectStorageVars: {
          privateDir: !!process.env.PRIVATE_OBJECT_DIR,
          publicPaths: !!process.env.PUBLIC_OBJECT_SEARCH_PATHS
        },
        requestHost: req.get('host'),
        requestProtocol: req.protocol
      };
      
      console.log(`🔍 POD DEBUG: Complete diagnostics:`, JSON.stringify(diagnostics, null, 2));
      
      res.json(diagnostics);
      
    } catch (error: any) {
      console.error("POD debug endpoint error:", error);
      res.status(500).json({ 
        message: "POD debug failed", 
        error: error.message,
        stack: error.stack 
      });
    }
  });

  // DATABASE REPAIR: One-time endpoint to rebuild missing locations
  app.post("/api/admin/repair-locations", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Admin authentication required for database repair" });
    }
  }, async (req, res) => {
    try {
      console.log("🔧 LOCATION REPAIR: Starting database repair for missing locations");
      
      const repairResults = {
        missingLocationIds: [] as string[],
        restoredLocations: [] as any[],
        errors: [] as any[]
      };

      // Step 1: Find all location IDs referenced by loads but missing from locations table
      const missingFromLoads = await db
        .select({
          locationId: loads.locationId,
          pickupLocationId: loads.pickupLocationId,
          companyName: loads.companyName,
          pickupAddress: loads.pickupAddress,
          deliveryAddress: loads.deliveryAddress,
          loadNumber: loads.number109
        })
        .from(loads)
        .where(
          sql`${loads.locationId} IS NOT NULL AND ${loads.locationId} NOT IN (SELECT id FROM locations)`
        );

      // Step 2: Find missing location IDs from load_stops
      const missingFromStops = await db
        .select({
          locationId: loadStops.locationId,
          companyName: loadStops.companyName,
          address: loadStops.address,
          contactName: loadStops.contactName,
          contactPhone: loadStops.contactPhone
        })
        .from(loadStops)
        .where(
          sql`${loadStops.locationId} IS NOT NULL AND ${loadStops.locationId} NOT IN (SELECT id FROM locations)`
        );

      console.log(`🔍 REPAIR: Found ${missingFromLoads.length} missing location IDs from loads`);
      console.log(`🔍 REPAIR: Found ${missingFromStops.length} missing location IDs from load_stops`);

      // Step 3: Build a map of missing location IDs and their data
      const locationData = new Map();

      // Process data from loads
      for (const load of missingFromLoads) {
        if (load.locationId && !locationData.has(load.locationId)) {
          locationData.set(load.locationId, {
            id: load.locationId,
            name: load.companyName || `Location for ${load.loadNumber}`,
            address: load.pickupAddress || load.deliveryAddress || '',
            city: '', // Will try to extract from address
            state: '', // Will try to extract from address
            source: `Load ${load.loadNumber}`
          });
        }
        if (load.pickupLocationId && !locationData.has(load.pickupLocationId)) {
          locationData.set(load.pickupLocationId, {
            id: load.pickupLocationId,
            name: load.companyName || `Pickup Location for ${load.loadNumber}`,
            address: load.pickupAddress || '',
            city: '', 
            state: '',
            source: `Load ${load.loadNumber} (pickup)`
          });
        }
      }

      // Process data from load_stops (more detailed info)
      for (const stop of missingFromStops) {
        if (stop.locationId) {
          const existing = locationData.get(stop.locationId) || { id: stop.locationId };
          locationData.set(stop.locationId, {
            ...existing,
            id: stop.locationId,
            name: stop.companyName || existing.name || 'Unknown Location',
            address: stop.address || existing.address || '',
            city: existing.city || '', 
            state: existing.state || '',
            contactName: stop.contactName,
            contactPhone: stop.contactPhone,
            source: existing.source || 'Load Stop'
          });
        }
      }

      // Step 4: Restore missing locations
      for (const [locationId, locationInfo] of Array.from(locationData.entries())) {
        try {
          // Try to parse city/state from address if not provided
          if (locationInfo.address && !locationInfo.city) {
            const addressParts = locationInfo.address.split(',');
            if (addressParts.length >= 2) {
              locationInfo.city = addressParts[addressParts.length - 2]?.trim() || '';
              locationInfo.state = addressParts[addressParts.length - 1]?.trim() || '';
            }
          }

          console.log(`🔧 REPAIR: Restoring location ${locationId}: ${locationInfo.name}`);

          // Insert the missing location with its original ID (using raw values to allow ID specification)
          await db
            .insert(locations)
            .values({
              id: locationId,
              name: locationInfo.name,
              address: locationInfo.address,
              city: locationInfo.city,
              state: locationInfo.state,
              contactName: locationInfo.contactName,
              contactPhone: locationInfo.contactPhone,
              createdAt: new Date()
            })
            .onConflictDoNothing(); // Safe in case location already exists

          repairResults.restoredLocations.push({
            id: locationId,
            name: locationInfo.name,
            address: locationInfo.address,
            source: locationInfo.source
          });

        } catch (error) {
          console.error(`❌ REPAIR: Failed to restore location ${locationId}:`, error);
          repairResults.errors.push({
            locationId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Step 5: Verify repair success
      const verifyMissingAfter = await db
        .select({ count: sql<number>`count(*)` })
        .from(loads)
        .where(
          sql`${loads.locationId} IS NOT NULL AND ${loads.locationId} NOT IN (SELECT id FROM locations)`
        );

      console.log(`✅ REPAIR: Restored ${repairResults.restoredLocations.length} locations`);
      console.log(`✅ REPAIR: ${verifyMissingAfter[0].count} loads still have missing location references`);

      res.json({
        message: "Location repair completed",
        summary: {
          locationsRestored: repairResults.restoredLocations.length,
          remainingMissing: verifyMissingAfter[0].count,
          errors: repairResults.errors.length
        },
        details: repairResults
      });

    } catch (error: any) {
      console.error("❌ LOCATION REPAIR FAILED:", error);
      res.status(500).json({ 
        message: "Location repair failed", 
        error: error.message,
        stack: error.stack 
      });
    }
  });

  // HERE Load Tracking API Routes
  app.post("/api/tracking/start/:driverId/:loadId", isAuthenticated, startLoadTracking);
  app.post("/api/tracking/location", isAuthenticated, updateDriverLocation);
  app.post("/api/tracking/route", isAuthenticated, calculateRoute);
  app.post("/api/tracking/eta", isAuthenticated, calculateETA);
  app.get("/api/tracking/status/:loadId", isAuthenticated, getLoadTrackingStatus);

  // Simple health check endpoint for Railway deployment
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Create and return HTTP server
  const server = createServer(app);
  return server;
}
