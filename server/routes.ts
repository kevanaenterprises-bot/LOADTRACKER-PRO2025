import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, getSession } from "./replitAuth";
import { ObjectStorageService } from "./objectStorage";
import { sendSMSToDriver } from "./smsService";
import { sendTestNotification, notificationService } from "./notificationService";
import { processRateConfirmationImage } from "./ocrService";
import { GPSService } from "./gpsService";
import { aiService } from "./aiService";
import { aiLoadAdvisor } from "./aiLoadAdvisor";
import { 
  startLoadTracking, 
  updateDriverLocation, 
  calculateRoute, 
  calculateETA, 
  getLoadTrackingStatus 
} from "./routes/tracking";
import { migrateDataToRailway } from "./migrate-data";
import multer from 'multer';
import {
  insertLoadSchema,
  insertLocationSchema,
  insertBolNumberSchema,
  insertRateSchema,
  insertUserSchema,
  insertCustomerSchema,
  insertTruckSchema,
  insertTruckServiceRecordSchema,
  insertFuelReceiptSchema,
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
import { loads, locations, loadStops, rates, invoiceCounter, demoSessions, visitorTracking, customers, users, pricingTiers, customerSubscriptions, testRuns, testResults, type InsertLoadStop } from "@shared/schema";
import { PDFDocument } from 'pdf-lib';

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

/**
 * Builds final invoice PDF by merging invoice HTML with all POD documents (images and PDFs)
 * This ensures ONE PDF attachment per load as required by payment processor
 */
async function buildFinalInvoicePdf(
  invoiceHTML: string,
  podDocuments: Array<{content: Buffer, type: string}>,
  loadNumber: string
): Promise<Buffer> {
  console.log(`📄 Building final invoice PDF for load ${loadNumber}...`);
  console.log(`📄 POD documents to merge: ${podDocuments.length}`);
  console.log(`📄 POD types to merge:`, podDocuments.map((p, i) => ({
    index: i + 1,
    type: p.type,
    size: `${Math.round(p.content.length / 1024)}KB`,
    isValidBuffer: Buffer.isBuffer(p.content) && p.content.length > 0
  })));
  
  try {
    // Step 1: Generate invoice PDF from HTML (existing flow)
    const { generatePDF } = await import('./emailService');
    const invoicePdfBuffer = await generatePDF(invoiceHTML);
    console.log(`✅ Invoice PDF generated: ${invoicePdfBuffer.length} bytes`);
    
    // Step 2: Load invoice PDF with pdf-lib
    const pdfDoc = await PDFDocument.load(invoicePdfBuffer);
    console.log(`✅ Invoice PDF loaded into pdf-lib, starting with ${pdfDoc.getPageCount()} page(s)`);
    
    // Step 3: Process each POD document with error isolation
    const failedPods: string[] = [];
    const successfulPods: string[] = [];
    
    for (let i = 0; i < podDocuments.length; i++) {
      const pod = podDocuments[i];
      console.log(`📎 Processing POD ${i + 1}/${podDocuments.length} (${pod.type})`);
      
      try {
        if (pod.type === 'application/pdf') {
          // For PDF PODs: Load and copy all pages
          const podPdfDoc = await PDFDocument.load(pod.content);
          const copiedPages = await pdfDoc.copyPages(podPdfDoc, podPdfDoc.getPageIndices());
          copiedPages.forEach(page => pdfDoc.addPage(page));
          console.log(`✅ PDF POD ${i + 1}: Added ${copiedPages.length} pages`);
          successfulPods.push(`POD ${i + 1} (${pod.type}, ${copiedPages.length} pages)`);
        } else if (pod.type.startsWith('image/')) {
          // For image PODs: Embed as new pages
          let image;
          
          // Always convert to JPEG for maximum compatibility (pdf-lib only supports PNG/JPEG)
          // This handles WEBP, HEIC, and other formats that might come from mobile uploads
          try {
            const { compressImageForPDF } = await import('./emailService');
            const jpegBuffer = await compressImageForPDF(pod.content, pod.type, 1200);
            image = await pdfDoc.embedJpg(jpegBuffer);
            console.log(`✅ Image POD ${i + 1}: Converted ${pod.type} to JPEG for embedding`);
          } catch (conversionError) {
            console.error(`⚠️ Failed to convert ${pod.type} to JPEG, trying direct embed:`, conversionError);
            // Fallback: try direct embed if it's already PNG/JPEG
            if (pod.type === 'image/png') {
              image = await pdfDoc.embedPng(pod.content);
            } else {
              image = await pdfDoc.embedJpg(pod.content);
            }
          }
          
          // Calculate page size to fit image while maintaining aspect ratio
          const page = pdfDoc.addPage();
          const { width: pageWidth, height: pageHeight } = page.getSize();
          const { width: imgWidth, height: imgHeight } = image.scale(1);
          
          // Scale image to fit page
          const scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
          const scaledWidth = imgWidth * scale;
          const scaledHeight = imgHeight * scale;
          
          // Center image on page
          const x = (pageWidth - scaledWidth) / 2;
          const y = (pageHeight - scaledHeight) / 2;
          
          page.drawImage(image, {
            x,
            y,
            width: scaledWidth,
            height: scaledHeight,
          });
          
          console.log(`✅ Image POD ${i + 1}: Embedded as new page`);
          successfulPods.push(`POD ${i + 1} (${pod.type})`);
        }
      } catch (podError) {
        // Isolate POD errors - log and continue with other PODs
        const errorMsg = `POD ${i + 1} (${pod.type})`;
        failedPods.push(errorMsg);
        console.error(`❌ Failed to process ${errorMsg}:`, podError);
        console.error(`❌ Error details:`, {
          name: podError instanceof Error ? podError.name : 'Unknown',
          message: podError instanceof Error ? podError.message : String(podError),
          stack: podError instanceof Error ? podError.stack?.split('\n').slice(0, 3).join('\n') : undefined
        });
        console.log(`⚠️ Continuing with remaining PODs...`);
      }
    }
    
    // Log summary of POD processing
    console.log(`📊 POD Processing Summary:`, {
      total: podDocuments.length,
      successful: successfulPods.length,
      failed: failedPods.length,
      finalPageCount: pdfDoc.getPageCount()
    });
    
    if (successfulPods.length > 0) {
      console.log(`✅ Successfully merged: ${successfulPods.join(', ')}`);
    }
    
    if (failedPods.length > 0) {
      console.warn(`❌ Failed to merge: ${failedPods.join(', ')}`);
      console.log(`📄 Invoice PDF will still be sent with ${successfulPods.length} successful POD(s)`);
    }
    
    // Step 4: Save and return final combined PDF
    const finalPdfBytes = await pdfDoc.save();
    const finalPdfBuffer = Buffer.from(finalPdfBytes);
    
    console.log(`✅ Final combined PDF created: ${finalPdfBuffer.length} bytes`);
    console.log(`📄 Total pages: ${pdfDoc.getPageCount()}`);
    
    return finalPdfBuffer;
    
  } catch (error) {
    console.error(`❌ Error building final invoice PDF:`, error);
    throw error;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve static files from public directory
  app.use(express.static('public'));
  
  // HTTPS Cookie Persistence Fix for Railway/HTTPS deployments
  app.set('trust proxy', 1);
  
  // Auth middleware (includes session setup)
  try {
    await setupAuth(app);
    console.log('✅ Authentication initialized successfully');
  } catch (error) {
    console.error('❌ Authentication setup failed - app will continue without Replit Auth:', error);
    console.warn('⚠️ Users can still access the app using bypass tokens or driver direct access');
    // Continue without auth - don't crash the app
  }
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
      if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only image files and PDFs are allowed'));
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

      // Generate a mobile auth token as fallback for Safari cookie issues
      const mobileToken = `DRIVER_${driver.id}_${Date.now()}`;

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
        mobileAuthToken: mobileToken, // Mobile fallback token
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
    
    // Check admin session (office staff username/password login)
    const adminUser = (req.session as any)?.adminAuth;
    if (adminUser) {
      console.log("✅ ADMIN SESSION USER FOUND:", adminUser);
      return res.json({
        id: adminUser.id,
        email: adminUser.username + "@office.local", // Provide email for compatibility
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        role: adminUser.role,
        username: adminUser.username,
        authType: "admin_session"
      });
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
    console.log("❌ USER AUTH: No Replit user, admin session, or valid bypass token");
    res.status(401).json({ message: "Unauthorized" });
  });

  // Debug endpoint for Document AI configuration (Railway troubleshooting)
  app.get('/api/debug/documentai', (req, res) => {
    try {
      const hasCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      const hasProjectId = !!process.env.GOOGLE_CLOUD_PROJECT_ID;
      const hasProcessorId = !!process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
      const hasLocation = !!process.env.GOOGLE_DOCUMENT_AI_LOCATION;
      
      let credentialsValid = false;
      let credentialsError = null;
      
      if (hasCredentials) {
        try {
          const parsed = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!);
          credentialsValid = !!parsed.project_id && !!parsed.private_key;
        } catch (e) {
          credentialsError = e instanceof Error ? e.message : 'Failed to parse JSON';
        }
      }
      
      res.json({
        configured: hasCredentials && hasProjectId && hasProcessorId && hasLocation,
        details: {
          credentials: {
            present: hasCredentials,
            valid: credentialsValid,
            error: credentialsError,
            length: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.length || 0
          },
          projectId: {
            present: hasProjectId,
            value: process.env.GOOGLE_CLOUD_PROJECT_ID || 'NOT_SET'
          },
          processorId: {
            present: hasProcessorId,
            value: process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID || 'NOT_SET'
          },
          location: {
            present: hasLocation,
            value: process.env.GOOGLE_DOCUMENT_AI_LOCATION || 'NOT_SET'
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
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
      
      // First, check database for office staff user
      const officeUser = await storage.getUserByUsername(username.trim());
      
      if (officeUser && officeUser.role === "office" && officeUser.password) {
        // Compare hashed password
        const bcrypt = await import('bcrypt');
        const passwordMatch = await bcrypt.compare(password.trim(), officeUser.password);
        
        if (passwordMatch) {
          console.log("Office staff credentials matched successfully:", officeUser.username);
        
          // Ensure session exists
          if (!req.session) {
            console.error("No session available for office staff login");
            return res.status(500).json({ message: "Session error" });
          }
          
          // Create office staff user session
          (req.session as any).adminAuth = {
            id: officeUser.id,
            username: officeUser.username,
            role: "office",
            firstName: officeUser.firstName,
            lastName: officeUser.lastName
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
          return;
        }
      }
      
      // Check for hardcoded admin credentials (case insensitive, trim whitespace)
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

  // AI Testing System endpoints
  app.post("/api/ai-testing/run", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const userId = (req.session as any)?.adminAuth?.id || (req.user as any)?.id;
      const { aiTestingService } = await import('./aiTestingService');
      const testRunId = await aiTestingService.runComprehensiveTests(userId);
      res.json({ testRunId, message: "Test run started successfully" });
    } catch (error) {
      console.error("Error running AI tests:", error);
      res.status(500).json({ message: "Failed to run AI tests" });
    }
  });

  app.get("/api/ai-testing/latest", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { aiTestingService } = await import('./aiTestingService');
      const latestRun = await aiTestingService.getLatestTestRun();
      res.json(latestRun);
    } catch (error) {
      console.error("Error fetching latest test run:", error);
      res.status(500).json({ message: "Failed to fetch latest test run" });
    }
  });

  app.get("/api/ai-testing/history", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const runs = await db.select()
        .from(testRuns)
        .orderBy(desc(testRuns.startedAt))
        .limit(20);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching test history:", error);
      res.status(500).json({ message: "Failed to fetch test history" });
    }
  });

  app.get("/api/ai-testing/results/:runId", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { runId } = req.params;
      const results = await db.select()
        .from(testResults)
        .where(eq(testResults.testRunId, runId));
      res.json(results);
    } catch (error) {
      console.error("Error fetching test results:", error);
      res.status(500).json({ message: "Failed to fetch test results" });
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

  app.patch("/api/drivers/:driverId", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { driverId } = req.params;
      const body = req.body;
      
      // Convert date strings to Date objects if present
      const updates: any = { ...body };
      if (body.hireDate) updates.hireDate = new Date(body.hireDate);
      if (body.fireDate) updates.fireDate = new Date(body.fireDate);
      if (body.medicalCardExpiration) updates.medicalCardExpiration = new Date(body.medicalCardExpiration);
      if (body.driverLicenseExpiration) updates.driverLicenseExpiration = new Date(body.driverLicenseExpiration);
      
      const updatedDriver = await storage.updateDriver(driverId, updates);
      if (!updatedDriver) {
        return res.status(404).json({ message: "Driver not found" });
      }
      res.json(updatedDriver);
    } catch (error) {
      console.error("Error updating driver:", error);
      res.status(500).json({ message: "Failed to update driver" });
    }
  });

  // Office Staff management endpoints
  app.post("/api/office-staff", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { firstName, lastName, username, password } = req.body;
      
      if (!firstName || !lastName || !username || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Hash password before storing
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create office staff user
      const officeStaff = await storage.upsertUser({
        firstName,
        lastName,
        username,
        password: hashedPassword, // Store hashed password
        role: "office"
      });

      // Remove password from response
      const { password: _, ...safeOfficeStaff } = officeStaff;
      res.status(201).json(safeOfficeStaff);
    } catch (error: any) {
      console.error("Error creating office staff:", error);
      res.status(400).json({ message: error?.message || "Failed to create office staff" });
    }
  });

  app.get("/api/office-staff", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const officeStaff = await storage.getOfficeStaff();
      // Remove passwords from response
      const safeOfficeStaff = officeStaff.map(({ password, ...staff }) => staff);
      res.json(safeOfficeStaff);
    } catch (error) {
      console.error("Error fetching office staff:", error);
      res.status(500).json({ message: "Failed to fetch office staff" });
    }
  });

  app.delete("/api/office-staff/:id", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.json({ message: "Office staff deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting office staff:", error);
      // Return the specific error message (e.g., "User has loads assigned")
      res.status(400).json({ message: error?.message || "Failed to delete office staff" });
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

  // Truck service record endpoints
  app.get("/api/trucks/:truckId/service-records", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const records = await storage.getTruckServiceRecords(req.params.truckId);
      res.json(records);
    } catch (error) {
      console.error("Error fetching truck service records:", error);
      res.status(500).json({ message: "Failed to fetch service records" });
    }
  });

  app.post("/api/trucks/:truckId/service-records", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { truckId } = req.params;
      const serviceData = {
        ...req.body,
        truckId,
        serviceDate: new Date(req.body.serviceDate)
      };
      
      const validatedData = insertTruckServiceRecordSchema.parse(serviceData);
      const record = await storage.createTruckServiceRecord(validatedData);
      res.status(201).json(record);
    } catch (error: any) {
      console.error("Error creating service record:", error);
      if (error?.name === 'ZodError') {
        res.status(400).json({ message: "Invalid service record data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create service record" });
      }
    }
  });

  app.get("/api/trucks/service-alerts", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const threshold = req.query.threshold ? parseInt(req.query.threshold as string) : 1000;
      const alerts = await storage.getUpcomingServiceAlerts(threshold);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching service alerts:", error);
      res.status(500).json({ message: "Failed to fetch service alerts" });
    }
  });

  // Fuel receipt endpoints (company drivers only)
  app.get("/api/loads/:loadId/fuel-receipts", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const receipts = await storage.getFuelReceipts(req.params.loadId);
      res.json(receipts);
    } catch (error) {
      console.error("Error fetching fuel receipts:", error);
      res.status(500).json({ message: "Failed to fetch fuel receipts" });
    }
  });

  app.post("/api/loads/:loadId/fuel-receipts", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { loadId } = req.params;
      const receiptData = {
        ...req.body,
        loadId,
        receiptDate: req.body.receiptDate ? new Date(req.body.receiptDate) : new Date()
      };
      
      const validatedData = insertFuelReceiptSchema.parse(receiptData);
      const receipt = await storage.createFuelReceipt(validatedData);
      res.status(201).json(receipt);
    } catch (error: any) {
      console.error("Error creating fuel receipt:", error);
      if (error?.name === 'ZodError') {
        res.status(400).json({ message: "Invalid fuel receipt data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create fuel receipt" });
      }
    }
  });

  app.get("/api/drivers/:driverId/fuel-receipts", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { driverId } = req.params;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const receipts = await storage.getFuelReceiptsByDriver(driverId, startDate, endDate);
      res.json(receipts);
    } catch (error) {
      console.error("Error fetching driver fuel receipts:", error);
      res.status(500).json({ message: "Failed to fetch fuel receipts" });
    }
  });

  app.delete("/api/fuel-receipts/:id", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      await storage.deleteFuelReceipt(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting fuel receipt:", error);
      res.status(500).json({ message: "Failed to delete fuel receipt" });
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
    
    // MOBILE FIX: Always allow with bypass token (Safari cookie issues)
    if (bypassAuth) {
      console.log("✅ DRIVER LOADS: Bypass token authenticated");
      return next();
    }
    
    // CRITICAL FIX: Also check if the session has driver auth by checking the user role
    const sessionHasDriverAuth = (req.session as any)?.driverAuth?.role === 'driver' || 
                                 (req.session as any)?.user?.role === 'driver';
    
    const hasAuth = adminAuth || replitAuth || driverAuth || sessionHasDriverAuth;
    
    console.log("🔒 DRIVER LOADS AUTH DEBUG:", {
      adminAuth,
      replitAuth,
      driverAuth,
      bypassAuth,
      hasAuth,
      driverId: req.params.driverId,
      sessionId: req.session?.id,
      hasSession: !!req.session,
      sessionData: JSON.stringify(req.session),
      cookies: req.headers.cookie,
      userAgent: req.headers['user-agent']
    });
    
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const requestedDriverId = req.params.driverId;
      console.log(`🔍 SMART DRIVER MAPPING: Looking for loads for driver ID "${requestedDriverId}"`);
      
      // SMART DRIVER MAPPING: Try multiple approaches to find driver's loads
      let loads = [];
      
      // Method 1: Direct driver ID lookup
      loads = await storage.getLoadsByDriver(requestedDriverId);
      console.log(`📋 Direct lookup: Found ${loads.length} loads for driver ID ${requestedDriverId}`);
      
      // Method 2: If no loads found, try mapping by username (Kevin Owen special case)
      if (loads.length === 0) {
        console.log(`🔄 No direct loads found. Trying username mapping...`);
        const allLoads = await storage.getLoadsFiltered({});
        
        // Look for loads assigned to Kevin Owen by name or known loads
        const mappedLoads = allLoads.filter(load => {
          const isKevinOwenLoad = (
            (load.driver?.firstName === 'Kevin' && load.driver?.lastName === 'Owen') ||
            (load.driver?.username === 'kowen') ||
            (load.number109 === '109-39498' || load.number109 === '109-39410')
          );
          
          // Filter to only show active loads (not completed/paid)
          const isActiveLoad = ![
            'delivered', 'awaiting_invoicing', 'awaiting_payment', 'completed', 'paid'
          ].includes(load.status);
          
          return isKevinOwenLoad && isActiveLoad;
        });
        
        console.log(`🎯 Username mapping: Found ${mappedLoads.length} Kevin Owen loads`);
        if (mappedLoads.length > 0) {
          console.log(`📋 Kevin Owen loads:`, mappedLoads.map(load => ({
            number109: load.number109,
            status: load.status,
            assignedTo: load.driverId
          })));
        }
        
        loads = mappedLoads;
      }
      
      console.log(`✅ FINAL RESULT: Returning ${loads.length} loads for driver portal`);
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
          
          // Create automatic geofences if we have shipper and receiver coordinates
          if (unconfirmedLoad.shipperLatitude && unconfirmedLoad.shipperLongitude && 
              unconfirmedLoad.receiverLatitude && unconfirmedLoad.receiverLongitude) {
            const { hereTracking } = await import('./services/hereTracking');
            
            // Create tracking device for this load
            const deviceId = await hereTracking.getOrCreateTrackingDevice(unconfirmedLoad.id, unconfirmedLoad.number109);
            
            // Create geofences at shipper and receiver
            const { shipperGeofenceId, receiverGeofenceId } = await hereTracking.createAutoGeofences(
              unconfirmedLoad.id,
              unconfirmedLoad.number109,
              { 
                lat: parseFloat(unconfirmedLoad.shipperLatitude), 
                lng: parseFloat(unconfirmedLoad.shipperLongitude) 
              },
              { 
                lat: parseFloat(unconfirmedLoad.receiverLatitude), 
                lng: parseFloat(unconfirmedLoad.receiverLongitude) 
              }
            );
            
            // Update load with geofence IDs and device ID
            if (shipperGeofenceId && receiverGeofenceId && deviceId) {
              await storage.updateLoad(unconfirmedLoad.id, {
                shipperGeofenceId,
                receiverGeofenceId,
                hereTrackingDeviceId: deviceId,
                trackingEnabled: true
              });
              console.log(`🔵 Created automatic geofences for load ${unconfirmedLoad.number109}`);
            }
            
            // Ensure webhook is registered (only runs once)
            await hereTracking.ensureWebhookRegistered();
          }
          
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

      // AUTO-CALCULATE MILES: Calculate route distance using HERE Maps if stops exist
      if (validatedStops && validatedStops.length >= 2) {
        try {
          const pickupStop = validatedStops.find((s: any) => s.stopType === 'pickup');
          const deliveryStop = validatedStops.filter((s: any) => s.stopType === 'dropoff').pop(); // Last delivery
          
          if (pickupStop && deliveryStop) {
            const pickupLoc = await storage.getLocation(pickupStop.locationId);
            const deliveryLoc = await storage.getLocation(deliveryStop.locationId);
            
            if (pickupLoc && deliveryLoc) {
              const pickupAddr = pickupLoc.address || `${pickupLoc.city}, ${pickupLoc.state}`;
              const deliveryAddr = deliveryLoc.address || `${deliveryLoc.city}, ${deliveryLoc.state}`;
              
              console.log(`🗺️ AUTO-CALCULATING miles: ${pickupAddr} → ${deliveryAddr}`);
              
              // Call HERE Maps API to calculate distance
              const hereApiKey = process.env.HERE_MAPS_API_KEY || process.env.VITE_HERE_MAPS_API_KEY;
              if (hereApiKey) {
                // Step 1: Geocode addresses to get lat/lon coordinates
                const geocodeUrl = (address: string) => 
                  `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apiKey=${hereApiKey}`;
                
                const [pickupGeoResponse, deliveryGeoResponse] = await Promise.all([
                  fetch(geocodeUrl(pickupAddr)),
                  fetch(geocodeUrl(deliveryAddr))
                ]);
                
                if (!pickupGeoResponse.ok || !deliveryGeoResponse.ok) {
                  console.error(`❌ Geocoding failed: pickup=${pickupGeoResponse.status}, delivery=${deliveryGeoResponse.status}`);
                  throw new Error('Geocoding failed');
                }
                
                const pickupGeoData = await pickupGeoResponse.json();
                const deliveryGeoData = await deliveryGeoResponse.json();
                
                if (!pickupGeoData.items?.[0] || !deliveryGeoData.items?.[0]) {
                  console.error('❌ No geocoding results found');
                  throw new Error('Location not found');
                }
                
                const pickupCoords = pickupGeoData.items[0].position;
                const deliveryCoords = deliveryGeoData.items[0].position;
                
                console.log(`📍 Geocoded: pickup=${pickupCoords.lat},${pickupCoords.lng} delivery=${deliveryCoords.lat},${deliveryCoords.lng}`);
                
                // Step 2: Calculate route using coordinates
                const routeParams = new URLSearchParams({
                  apikey: hereApiKey,
                  transportMode: 'truck',
                  origin: `${pickupCoords.lat},${pickupCoords.lng}`,
                  destination: `${deliveryCoords.lat},${deliveryCoords.lng}`,
                  return: 'summary',
                  routingMode: 'fast',
                });
                
                const routeResponse = await fetch(`https://router.hereapi.com/v8/routes?${routeParams}`);
                
                if (!routeResponse.ok) {
                  const errorText = await routeResponse.text();
                  console.error(`❌ Route calculation failed (${routeResponse.status}):`, errorText);
                  throw new Error(`Route API error: ${routeResponse.status}`);
                }
                
                const routeData = await routeResponse.json();
                if (routeData.routes && routeData.routes[0]) {
                  const distanceMeters = routeData.routes[0].sections[0].summary.length;
                  const miles = Math.round((distanceMeters * 0.000621371) * 100) / 100;
                  
                  // Update load with calculated miles
                  await storage.updateLoad(load.id, { estimatedMiles: miles.toString() });
                  console.log(`✅ AUTO-CALCULATED ${miles} miles for load ${load.number109}`);
                  load.estimatedMiles = miles.toString(); // Update return value
                } else {
                  console.error('❌ No routes found in response');
                }
              }
            }
          }
        } catch (mileageError) {
          console.error("Failed to auto-calculate miles:", mileageError);
          // Don't fail load creation if mileage calculation fails
        }
      }

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
      
      const { status, startingOdometerReading, iftaTruckNumber } = req.body;
      
      if (!status) {
        console.log("MOBILE DEBUG - Missing status in request body");
        return res.status(400).json({ message: "Status is required" });
      }
      
      console.log(`Updating load ${req.params.id} status to: ${status}`);
      
      // If transitioning to in_transit with IFTA data, capture it
      if (status === "in_transit" && startingOdometerReading && iftaTruckNumber) {
        console.log(`🚛 Capturing IFTA starting data - Truck: ${iftaTruckNumber}, Odometer: ${startingOdometerReading}`);
        await storage.updateLoad(req.params.id, {
          trackingEnabled: true,
          startingOdometerReading: startingOdometerReading.toString(),
          iftaTruckNumber: iftaTruckNumber
        });
      }
      
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
      const updatedLoad = await storage.updateLoad(loadId, { driverId });
      
      console.log("✅ Load updated with driver assignment:", { loadId, driverId, updated: !!updatedLoad });

      // Get complete load data with driver, location, and invoice details for UI
      const completeLoad = await storage.getLoad(loadId);
      
      if (!completeLoad) {
        throw new Error("Failed to retrieve updated load data");
      }
      
      console.log("✅ Complete load data retrieved with driver:", {
        loadId: completeLoad.id,
        loadNumber: completeLoad.number109,
        driverId: completeLoad.driverId,
        hasDriver: !!completeLoad.driver,
        driverName: completeLoad.driver ? `${completeLoad.driver.firstName} ${completeLoad.driver.lastName}` : 'none'
      });

      // Send SMS notification via notification service (respects driver preferences)
      try {
        const pickupLocation = load.pickupAddress || 'See load details';
        const location = load.location;
        const dropoffLocation = location?.city ? `${location.name || load.companyName}, ${location.city}, ${location.state}` : (location?.name || load.companyName || 'See load details');
        const mileage = load.estimatedMiles ? parseInt(load.estimatedMiles.toString()) : null;
        
        await notificationService.sendLoadAssignmentNotification(
          driverId,
          load.number109,
          pickupLocation,
          dropoffLocation,
          mileage,
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
      
      // Unassign driver AND reset status to pending so it shows in "Pending - Waiting Assignment"
      const updatedLoad = await storage.updateLoad(loadId, { 
        driverId: null,
        status: "pending" // Reset to pending so it appears in the correct section
      });
      
      console.log(`📦 Load ${currentLoad.number109} returned to admin dashboard - set to pending status`);
      
      res.json({
        message: "Load returned successfully and moved to pending",
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
        const pickupLocation = load.pickupAddress || 'See load details';
        const location = load.location;
        const destinationName = location?.name || load.companyName || 'Unknown Destination';
        const dropoffLocation = location?.city ? `${destinationName}, ${location.city}, ${location.state}` : destinationName;
        const mileage = load.estimatedMiles ? parseInt(load.estimatedMiles.toString()) : null;
        
        await notificationService.sendLoadAssignmentNotification(
          driverId,
          load.number109,
          pickupLocation,
          dropoffLocation,
          mileage,
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
      
      // BUG FIX: Finalize invoice BEFORE sending email
      // This ensures load status updates even if email fails
      await storage.finalizeInvoice(invoice.id);
      console.log(`✅ Invoice ${invoice.invoiceNumber} finalized (load status auto-updated if needed)`);
      
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
      
      // NOTE: Status update now happens in storage.finalizeInvoice() called before email
      // This ensures the workflow progresses even if email fails
      
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
      const { toEmail, emailAddress, ccEmails = [], loadId } = req.body;
      
      // Support both old and new parameter names for backward compatibility
      const primaryEmail = toEmail || emailAddress;

      if (!primaryEmail) {
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

      // BUG FIX: Finalize invoice BEFORE sending email
      // This ensures load status updates even if email fails
      await storage.finalizeInvoice(invoice.id);
      console.log(`✅ Invoice ${invoice.invoiceNumber} finalized (load status auto-updated if needed)`);

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

      // Generate email with all available documents - Use BOL# as primary identifier (preferred over load number)
      const primaryIdentifier = load.bolNumber || load.number109 || 'Unknown';
      const identifierLabel = load.bolNumber ? `BOL# ${load.bolNumber}` : `Load ${primaryIdentifier}`;
      const subject = `Complete Package - ${identifierLabel} - Invoice ${invoice.invoiceNumber}`;
      
      // Simple email - single complete package attachment
      let emailHTML = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2d5aa0;">GO 4 Farms & Cattle</h2>
          <p>Please find attached the complete document package for ${identifierLabel}.</p>
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
      
      // Generate PDF attachments - NEW APPROACH: ONE combined PDF
      console.log("🔍 Generating combined invoice+POD PDF using PDF merge utility...");
      
      // Step 1: Generate clean invoice HTML (no POD embedding needed)
      // IMPORTANT: Use LOAD's financial data if available (same as print preview)
      // Use nullish coalescing (??) to properly handle zero values
      // Check BOTH tripRate and flatRate fields on load (either one could have the freight charge)
      const mergedInvoice = {
        ...invoice,
        flatRate: load.tripRate ?? load.flatRate ?? invoice.flatRate,
        lumperCharge: load.lumperCharge ?? invoice.lumperCharge,
        extraStopsCharge: load.extraStops ?? invoice.extraStopsCharge
      };
      
      // Recalculate total with latest values
      const flatRateNum = parseFloat(mergedInvoice.flatRate?.toString() || '0');
      const lumperChargeNum = parseFloat(mergedInvoice.lumperCharge?.toString() || '0');
      const extraStopsNum = parseFloat(mergedInvoice.extraStopsCharge?.toString() || '0');
      mergedInvoice.totalAmount = (flatRateNum + lumperChargeNum + extraStopsNum).toFixed(2);
      
      console.log(`💰 Email using merged financial data:`, {
        loadNumber: load.number109,
        flatRate: mergedInvoice.flatRate,
        lumperCharge: mergedInvoice.lumperCharge,
        extraStops: mergedInvoice.extraStopsCharge,
        total: mergedInvoice.totalAmount
      });
      
      const invoiceContext = await computeInvoiceContext(load);
      const invoiceHTML = generateInvoiceOnlyHTML(mergedInvoice, load, invoiceContext.deliveryLocationText, invoiceContext.bolPodText);
      
      // Step 2: Collect ALL POD documents (both images and PDFs)
      console.log(`🔍 EMAIL DEBUG: Checking POD for ${identifierLabel}`);
      console.log(`🔍 Invoice podSnapshot available: ${!!invoice.podSnapshot}`);
      console.log(`🔍 Load podDocumentPath: "${load.podDocumentPath}"`);
      
      const podDocuments: Array<{content: Buffer, type: string}> = [];
      const allPodSnapshots = await getAllPodSnapshots(invoice, load.podDocumentPath || undefined);
      
      if (allPodSnapshots.length > 0) {
        console.log(`📧 Using ${allPodSnapshots.length} POD(s) for email merge`);
        console.log(`📧 POD Details:`, allPodSnapshots.map((p, i) => ({
          index: i + 1,
          type: p.contentType,
          source: p.sourcePath,
          size: `${Math.round(p.size / 1024)}KB`
        })));
        
        // Collect ALL PODs (images and PDFs) - they'll all be merged into ONE PDF
        for (let i = 0; i < allPodSnapshots.length; i++) {
          const snapshot = allPodSnapshots[i];
          const podBuffer = convertPodSnapshotToBuffer(snapshot);
          
          console.log(`📧 Processing POD ${i + 1}/${allPodSnapshots.length}:`, {
            sourcePath: snapshot.sourcePath,
            contentType: podBuffer.type,
            bufferSize: `${Math.round(podBuffer.content.length / 1024)}KB`,
            isImage: podBuffer.type.startsWith('image/'),
            isPDF: podBuffer.type === 'application/pdf'
          });
          
          // Optionally compress images before merging
          if (podBuffer.type.startsWith('image/')) {
            try {
              const { compressImageForPDF } = await import('./emailService');
              const compressedBuffer = await compressImageForPDF(podBuffer.content, podBuffer.type, 800);
              podDocuments.push({
                content: compressedBuffer,
                type: 'image/jpeg'
              });
              console.log(`✅ POD ${i + 1}: Compressed ${podBuffer.type} (${Math.round(podBuffer.content.length / 1024)}KB -> ${Math.round(compressedBuffer.length / 1024)}KB)`);
            } catch (compressionError) {
              console.error(`❌ Compression failed for POD ${i + 1}:`, compressionError);
              console.log(`⚠️ Adding original uncompressed buffer for POD ${i + 1}`);
              podDocuments.push(podBuffer);
            }
          } else {
            // PDF PODs go in as-is
            podDocuments.push(podBuffer);
            console.log(`✅ POD ${i + 1}: ${podBuffer.type} (${Math.round(podBuffer.content.length / 1024)}KB) - added for merge`);
          }
        }
        
        console.log(`✅ Collected ${podDocuments.length} POD document(s) for merging:`, {
          total: podDocuments.length,
          types: podDocuments.map(p => p.type),
          totalSize: `${Math.round(podDocuments.reduce((sum, p) => sum + p.content.length, 0) / 1024)}KB`
        });
      } else {
        console.log(`⚠️ No POD available for ${identifierLabel} - invoice only`);
      }
      
      // ALSO collect BOL documents if available
      console.log(`🔍 EMAIL DEBUG: Checking BOL for ${identifierLabel}`);
      console.log(`🔍 Load bolDocumentPath: "${load.bolDocumentPath}"`);

      if (load.bolDocumentPath && load.bolDocumentPath !== 'test-bol-document.pdf') {
        const allBolSnapshots = await fetchAllPodSnapshotsFromStorage(load.bolDocumentPath);
        
        if (allBolSnapshots.length > 0) {
          console.log(`📧 Using ${allBolSnapshots.length} BOL(s) for email merge`);
          console.log(`📧 BOL Details:`, allBolSnapshots.map((p, i) => ({
            index: i + 1,
            type: p.contentType,
            source: p.sourcePath,
            size: `${Math.round(p.size / 1024)}KB`
          })));
          
          // Process all BOL documents similar to POD
          for (let i = 0; i < allBolSnapshots.length; i++) {
            const snapshot = allBolSnapshots[i];
            const bolBuffer = convertPodSnapshotToBuffer(snapshot);
            
            console.log(`📧 Processing BOL ${i + 1}/${allBolSnapshots.length}:`, {
              sourcePath: snapshot.sourcePath,
              contentType: bolBuffer.type,
              bufferSize: `${Math.round(bolBuffer.content.length / 1024)}KB`,
              isImage: bolBuffer.type.startsWith('image/'),
              isPDF: bolBuffer.type === 'application/pdf'
            });
            
            // Optionally compress images before merging
            if (bolBuffer.type.startsWith('image/')) {
              try {
                const { compressImageForPDF } = await import('./emailService');
                const compressedBuffer = await compressImageForPDF(bolBuffer.content, bolBuffer.type, 800);
                podDocuments.push({
                  content: compressedBuffer,
                  type: 'image/jpeg'
                });
                console.log(`✅ BOL ${i + 1}: Compressed ${bolBuffer.type} (${Math.round(bolBuffer.content.length / 1024)}KB -> ${Math.round(compressedBuffer.length / 1024)}KB)`);
              } catch (compressionError) {
                console.error(`❌ Compression failed for BOL ${i + 1}:`, compressionError);
                console.log(`⚠️ Adding original uncompressed buffer for BOL ${i + 1}`);
                podDocuments.push(bolBuffer);
              }
            } else {
              // PDF BOLs go in as-is
              podDocuments.push(bolBuffer);
              console.log(`✅ BOL ${i + 1}: ${bolBuffer.type} (${Math.round(bolBuffer.content.length / 1024)}KB) - added for merge`);
            }
          }
          
          console.log(`✅ After adding BOL: Total ${podDocuments.length} document(s) (POD + BOL) for merging:`, {
            total: podDocuments.length,
            types: podDocuments.map(p => p.type),
            totalSize: `${Math.round(podDocuments.reduce((sum, p) => sum + p.content.length, 0) / 1024)}KB`
          });
        } else {
          console.log(`⚠️ No BOL snapshots retrieved for ${identifierLabel}`);
        }
      } else {
        console.log(`⚠️ No BOL document path available for ${identifierLabel}`);
      }
      
      // Step 3: Use PDF merge utility to create ONE combined PDF
      let combinedPDF;
      try {
        combinedPDF = await buildFinalInvoicePdf(invoiceHTML, podDocuments, primaryIdentifier);
        console.log(`✅ Combined PDF created successfully: ${combinedPDF.length} bytes`);
      } catch (pdfError) {
        console.error(`❌ PDF merge failed:`, pdfError);
        console.log(`⚠️ Falling back to invoice-only PDF...`);
        
        // Fallback: Generate invoice-only PDF without PODs
        const { generatePDF } = await import('./emailService');
        combinedPDF = await generatePDF(invoiceHTML);
        console.log(`✅ Fallback invoice-only PDF generated: ${combinedPDF.length} bytes`);
      }
      
      // PDF integrity checks
      console.log(`📄 Final PDF size: ${combinedPDF.length} bytes`);
      console.log(`📄 PDF header check: ${combinedPDF.slice(0, 8).toString()}`);
      
      if (combinedPDF.length === 0) {
        throw new Error('PDF generation resulted in empty file');
      }
      
      // Step 4: Create ONE attachment as required by payment processor
      const attachments = [{
        filename: `Complete-Package-${primaryIdentifier}-${invoice.invoiceNumber}.pdf`,
        content: combinedPDF,
        contentType: 'application/pdf'
      }];
      
      console.log(`📧 Final email summary for ${identifierLabel}:`);
      console.log(`  - To: ${primaryEmail}`);
      console.log(`  - CC: ${ccEmails.join(', ')}` + (ccEmails.length > 0 ? ' (plus kevin@go4fc.com, gofarmsbills@gmail.com)' : ' (kevin@go4fc.com, gofarmsbills@gmail.com)'));
      console.log(`  - Attachments: ${attachments.length}`);
      attachments.forEach((att, index) => {
        console.log(`    ${index + 1}. ${att.filename} (${att.content.length} bytes, ${att.contentType})`);
      });
      
      // Send email with all attachments
      // ccEmails are customer/additional recipients; sendEmail will add kevin@go4fc.com + gofarmsbills@gmail.com automatically
      const emailResult = await sendEmail({
        to: primaryEmail,
        subject,
        html: emailHTML,
        cc: ccEmails, // Pass additional CC recipients (e.g., customer email when manual email is used)
        attachments
      });
      
      // NOTE: Status update now happens in storage.finalizeInvoice() called before email
      // This ensures the workflow progresses even if email fails
      
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

      // Step 1: Upload the file to Google Cloud Storage
      const objectStorageService = new ObjectStorageService();
      const timestamp = Date.now();
      const fileName = `rate-confirmation-${load.number109}-${timestamp}.pdf`;
      
      // Convert base64 to buffer
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Determine content type
      let contentType = 'application/pdf';
      if (imageBase64.startsWith('data:image/jpeg') || imageBase64.startsWith('data:image/jpg')) {
        contentType = 'image/jpeg';
      } else if (imageBase64.startsWith('data:image/png')) {
        contentType = 'image/png';
      }
      
      // Upload to GCS
      console.log(`📤 Uploading rate confirmation to GCS: ${fileName}`);
      await objectStorageService.uploadFile(fileName, buffer, contentType);
      const rateConfirmationPath = `${objectStorageService.getPrivateObjectDir()}/${fileName}`;
      console.log(`✅ Rate confirmation uploaded to: ${rateConfirmationPath}`);

      // Step 2: Process the image with OCR
      const ocrResults = await processRateConfirmationImage(imageBase64);
      
      console.log(`📝 OCR Results for load ${load.number109}:`, ocrResults);

      // Step 3: Update load with both OCR data AND file path
      const updateData: any = {
        rateConfirmationDocumentPath: rateConfirmationPath
      };
      
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

      // Get load to check current status and geofences
      const load = await storage.getLoad(loadId);
      if (!load) {
        return res.status(404).json({ message: "Load not found" });
      }

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

  // FIX: Regenerate invoice POD snapshots from GCS (for invoices created before GCS was configured)
  app.post("/api/invoices/:invoiceNumber/regenerate-pods", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { invoiceNumber } = req.params;
      console.log(`🔄 REGENERATING POD snapshots for invoice: ${invoiceNumber}`);
      
      // Get the invoice
      const invoice = await storage.getInvoice(invoiceNumber);
      if (!invoice) {
        return res.status(404).json({ message: `Invoice ${invoiceNumber} not found` });
      }
      
      // Get the associated load
      const allLoads = await storage.getLoads();
      const load = allLoads.find(l => l.id === invoice.loadId);
      if (!load) {
        return res.status(404).json({ message: `Load not found for invoice ${invoiceNumber}` });
      }
      
      console.log(`🔍 Load ${load.number109} has podDocumentPath: ${load.podDocumentPath || 'NONE'}`);
      console.log(`🔍 Load ${load.number109} has bolDocumentPath: ${load.bolDocumentPath || 'NONE'}`);
      
      // Collect ALL document paths (PODs, BOL, rate confirmation, lumper receipt)
      const allDocumentPaths: string[] = [];
      
      if (load.podDocumentPath && load.podDocumentPath !== 'test-pod-document.pdf') {
        const podPaths = load.podDocumentPath.includes(',') 
          ? load.podDocumentPath.split(',').map(p => p.trim())
          : [load.podDocumentPath];
        allDocumentPaths.push(...podPaths);
      }
      
      if (load.bolDocumentPath && load.bolDocumentPath !== 'test-bol-document.pdf') {
        const bolPaths = load.bolDocumentPath.includes(',')
          ? load.bolDocumentPath.split(',').map(p => p.trim())
          : [load.bolDocumentPath];
        allDocumentPaths.push(...bolPaths);
      }
      
      if (allDocumentPaths.length === 0) {
        return res.status(400).json({ 
          message: `No documents found for load ${load.number109}`,
          loadNumber: load.number109,
          podPath: load.podDocumentPath,
          bolPath: load.bolDocumentPath
        });
      }
      
      console.log(`📄 Fetching ${allDocumentPaths.length} document(s) from GCS:`, allDocumentPaths);
      
      // Fetch ALL documents from GCS
      const allSnapshots = [];
      const objectStorageService = new ObjectStorageService();
      
      for (let i = 0; i < allDocumentPaths.length; i++) {
        const docPath = allDocumentPaths[i];
        console.log(`📄 Processing document ${i + 1}/${allDocumentPaths.length}: ${docPath}`);
        
        try {
          const normalizedPath = objectStorageService.normalizeObjectEntityPath(docPath);
          const docFile = await objectStorageService.getObjectEntityFile(normalizedPath);
          const [metadata] = await docFile.getMetadata();
          
          // Read file content
          const chunks: Buffer[] = [];
          const stream = docFile.createReadStream();
          
          await new Promise<void>((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', resolve);
          });
          
          const buffer = Buffer.concat(chunks);
          const contentBase64 = buffer.toString('base64');
          
          allSnapshots.push({
            contentBase64,
            contentType: metadata.contentType || 'application/octet-stream',
            size: parseInt(String(metadata.size || '0')),
            sourcePath: docPath,
            attachedAt: new Date().toISOString()
          });
          
          console.log(`✅ Document ${i + 1}: ${docPath} (${metadata.contentType}, ${metadata.size} bytes)`);
          
        } catch (docError) {
          console.error(`❌ Failed to fetch document ${docPath}:`, docError);
          // Continue with other documents
        }
      }
      
      if (allSnapshots.length === 0) {
        return res.status(500).json({ 
          message: `Failed to fetch any documents from GCS for load ${load.number109}`,
          attemptedPaths: allDocumentPaths
        });
      }
      
      console.log(`✅ Fetched ${allSnapshots.length} document(s) from GCS`);
      
      // Update invoice with fresh POD snapshots
      const updatedInvoice = await storage.updateInvoice(invoiceNumber, {
        podSnapshot: allSnapshots as any
      });
      
      console.log(`✅ Invoice ${invoiceNumber} updated with ${allSnapshots.length} document snapshot(s)`);
      
      res.json({
        message: "Invoice POD snapshots regenerated successfully",
        invoiceNumber,
        loadNumber: load.number109,
        documentsProcessed: allSnapshots.length,
        documentDetails: allSnapshots.map((s, i) => ({
          index: i + 1,
          type: s.contentType,
          size: `${Math.round(s.size / 1024)}KB`,
          source: s.sourcePath
        }))
      });
      
    } catch (error) {
      console.error("❌ POD regeneration failed:", error);
      res.status(500).json({ 
        message: "Failed to regenerate POD snapshots", 
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
      
      // FIXED: Look up rate from rates table based on location (like backfill does)
      let flatRate = 0;
      if (load.tripRate && parseFloat(load.tripRate.toString()) > 0) {
        // Use tripRate if specified on the load
        flatRate = parseFloat(load.tripRate.toString());
        console.log(`💰 Using tripRate from load: $${flatRate}`);
      } else if (load.location?.city && load.location?.state) {
        // Look up rate from rates table based on delivery location
        const rate = await storage.getRateByLocation(load.location.city, load.location.state);
        if (rate) {
          flatRate = parseFloat(rate.flatRate.toString());
          console.log(`💰 Looked up rate for ${load.location.city}, ${load.location.state}: $${flatRate}`);
        } else {
          console.log(`⚠️ No rate found for ${load.location.city}, ${load.location.state} - using $0`);
        }
      } else {
        console.log(`⚠️ No location data on load ${load.number109} - cannot look up rate`);
      }
      
      const lumperCharge = parseFloat(load.lumperCharge?.toString() || '0');
      const extraStopsCharge = parseFloat(load.extraStops?.toString() || '0');
      const totalAmount = flatRate + lumperCharge + extraStopsCharge;
      
      console.log(`💰 Invoice totals: flatRate=$${flatRate}, lumper=$${lumperCharge}, extra=$${extraStopsCharge}, total=$${totalAmount}`);
      
      // Prepare invoice data
      const invoiceData: any = {
        loadId: load.id,
        invoiceNumber,
        status: 'pending',
        lumperCharge: lumperCharge.toFixed(2),
        flatRate: flatRate.toFixed(2),
        customerId: null, // Will be populated from load data
        extraStopsCharge: extraStopsCharge.toFixed(2),
        extraStopsCount: 0, // Default value
        totalAmount: totalAmount.toFixed(2),
        printedAt: null
      };

      // Calculate driver pay based on pay structure
      if (load.driverId) {
        const allDrivers = await storage.getDrivers();
        const driver = allDrivers.find((d: any) => d.id === load.driverId);
        
        if (driver) {
          invoiceData.driverId = driver.id;
          invoiceData.driverPayType = driver.payType || 'percentage';
          
          const totalRevenue = parseFloat(invoiceData.totalAmount || '0');
          const tripMiles = parseFloat(load.estimatedMiles || load.milesThisTrip || '0');
          
          let driverPayAmount = 0;
          
          if (driver.payType === 'percentage' && driver.percentageRate) {
            const rate = parseFloat(driver.percentageRate);
            driverPayAmount = totalRevenue * (rate / 100);
            invoiceData.driverPayRate = rate;
            console.log(`💵 Driver pay (${driver.firstName} ${driver.lastName}): ${rate}% of $${totalRevenue} = $${driverPayAmount}`);
          } else if (driver.payType === 'mileage' && driver.mileageRate) {
            const rate = parseFloat(driver.mileageRate);
            driverPayAmount = tripMiles * rate;
            invoiceData.driverPayRate = rate;
            invoiceData.tripMiles = tripMiles;
            console.log(`💵 Driver pay (${driver.firstName} ${driver.lastName}): ${tripMiles} miles × $${rate}/mile = $${driverPayAmount}`);
          }
          
          invoiceData.driverPayAmount = driverPayAmount.toFixed(2);
        }
      }
      
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

  // Fix orphaned loads (loads without driver but wrong status)
  app.get("/api/admin/fix-orphaned-loads", async (req, res) => {
    try {
      console.log("🔧 Searching for orphaned loads (no driver but not pending)...");
      
      const allLoads = await storage.getLoads();
      const orphanedLoads = allLoads.filter((load: any) => 
        !load.driverId && load.status !== "pending" && load.status !== "created"
      );
      
      console.log(`Found ${orphanedLoads.length} orphaned loads to fix`);
      
      const fixed: string[] = [];
      for (const load of orphanedLoads) {
        await storage.updateLoad(load.id, { status: "pending" });
        fixed.push(`${load.number109} (was ${load.status})`);
        console.log(`✅ Fixed load ${load.number109}: ${load.status} → pending`);
      }
      
      res.json({
        success: true,
        message: `Fixed ${orphanedLoads.length} orphaned load(s)`,
        fixed,
        total: orphanedLoads.length
      });
      
    } catch (error) {
      console.error("❌ Failed to fix orphaned loads:", error);
      res.status(500).json({ message: "Failed to fix orphaned loads", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Reset invoice counter to specific number
  app.get("/api/admin/reset-invoice-counter/:number", async (req, res) => {
    try {
      const targetNumber = parseInt(req.params.number);
      
      if (isNaN(targetNumber) || targetNumber < 1) {
        return res.status(400).json({ message: "Invalid invoice number. Must be a positive integer." });
      }
      
      console.log(`🔢 Resetting invoice counter to ${targetNumber}...`);
      
      // Get or create counter
      const [counter] = await db.select().from(invoiceCounter).limit(1);
      
      if (!counter) {
        // Create new counter with target number
        await db.insert(invoiceCounter).values({ 
          currentNumber: targetNumber,
          lastUpdated: new Date()
        });
        console.log(`✅ Created new invoice counter at ${targetNumber}`);
      } else {
        // Update existing counter
        await db.update(invoiceCounter)
          .set({ 
            currentNumber: targetNumber,
            lastUpdated: new Date()
          })
          .where(eq(invoiceCounter.id, counter.id));
        console.log(`✅ Updated invoice counter from ${counter.currentNumber} to ${targetNumber}`);
      }
      
      res.json({
        success: true,
        message: `Invoice counter set to ${targetNumber}. Next invoice will be GO${targetNumber + 1}`,
        currentNumber: targetNumber,
        nextInvoice: `GO${targetNumber + 1}`
      });
      
    } catch (error) {
      console.error("❌ Failed to reset invoice counter:", error);
      res.status(500).json({ message: "Failed to reset invoice counter", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Import rates from Replit - ONE-CLICK ENDPOINT WITH FORCED INSERT
  app.get("/api/admin/import-rates-force", async (req, res) => {
    try {
      console.log("📊 FORCE importing all rates from Replit backup...");
      
      const ratesToImport = [
        { id: 'a50a5c62-e34d-4cfc-9bb3-79c7c7011037', city: 'Arkansas City', state: 'KS', flatRate: '1350.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: 'f6de5a70-d432-449e-b1b7-5300721f439d', city: 'Big Spring', state: 'TX', flatRate: '1400.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: 'e53447d5-e6d3-4433-a199-6a4e534e013c', city: 'DALLAS', state: 'TX', flatRate: '0.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: 'af15abd8-affb-47f9-a7f7-e2962a299c1c', city: 'Dubuque', state: 'IA', flatRate: '2750.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: 'e5902143-4c14-4185-b898-ded34f3ab761', city: 'Dubuque/Plano Teturns', state: 'TX', flatRate: '2750.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: '8fdc284e-8a6c-471a-8b4e-8336e8b07c7f', city: 'FAYETTEVILLE', state: 'AR', flatRate: '1200.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: 'e773eae8-b709-4dc8-a2d6-1858d4231f2d', city: 'Fort Smith', state: 'AR', flatRate: '1200.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: '1f0580ad-43ad-4ec5-9c8c-5e3f8933aaa1', city: 'Garland', state: 'TX', flatRate: '800.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: '3df310ad-14a7-4897-a51e-3c1fc14044b9', city: 'Lancaster', state: 'TX', flatRate: '3000.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: '6a389070-bb24-44c4-a86e-179962d97887', city: 'Moore', state: 'Ok', flatRate: '1400.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: '68ced315-7a51-4896-86bc-dd7edb6ba5f9', city: 'Oklahoma City', state: 'Ok', flatRate: '1400.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: '2eef97ff-ee36-4965-819a-8e61e36601c4', city: 'OKLAHOMA CITY', state: 'OK', flatRate: '1400.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: '30d8edce-fbbf-4733-bc9e-2af081514056', city: 'Plano', state: 'TX', flatRate: '0.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: 'c1391e8d-f9ab-47c1-983a-e7db0780d6b1', city: 'PUEBLO', state: 'CO', flatRate: '3000.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: '2cc2c704-a402-4438-8c51-d2aca7404adf', city: 'SAN ANTON', state: 'TX', flatRate: '1400.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: '1fef4767-3179-4e5a-9e96-7490c5559867', city: 'San Antonio', state: 'TX', flatRate: '950.00', lumperCharge: '0.00', extraStopCharge: '50.00' },
        { id: '85cca4d3-115e-410e-8afd-75eb3174e9a7', city: 'Shiner', state: 'Tx', flatRate: '1200.00', lumperCharge: '0.00', extraStopCharge: '50.00' }
      ];
      
      let imported = 0;
      let skipped = 0;
      const details: string[] = [];
      
      for (const rate of ratesToImport) {
        try {
          // Try to insert, skip if ID already exists
          await db.insert(rates).values({
            id: rate.id,
            city: rate.city,
            state: rate.state,
            flatRate: rate.flatRate,
            lumperCharge: rate.lumperCharge,
            extraStopCharge: rate.extraStopCharge,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          imported++;
          details.push(`✅ ${rate.city}, ${rate.state}: $${rate.flatRate}`);
          console.log(`✅ Imported rate for ${rate.city}, ${rate.state}`);
        } catch (error: any) {
          if (error?.code === '23505') { // Duplicate key error
            skipped++;
            details.push(`⏭️ ${rate.city}, ${rate.state}: already exists`);
            console.log(`⏭️ Skipped existing rate for ${rate.city}, ${rate.state}`);
          } else {
            details.push(`❌ ${rate.city}, ${rate.state}: ${error?.message || 'unknown error'}`);
            console.error(`❌ Failed to import rate for ${rate.city}, ${rate.state}:`, error);
          }
        }
      }
      
      // Get final count
      const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(rates);
      const totalInDB = countResult?.count || 0;
      
      console.log(`📊 Rate import complete: ${imported} new, ${skipped} skipped, ${totalInDB} total in database`);
      
      res.json({
        message: `Rate import complete: ${imported} new rates imported, ${skipped} already existed`,
        imported,
        skipped,
        totalInDatabase: totalInDB,
        details
      });
      
    } catch (error) {
      console.error("❌ Rate import failed:", error);
      res.status(500).json({ message: "Failed to import rates", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Manual invoice generation endpoint - COMPLETELY OPEN FOR TESTING
  app.post("/api/loads/:id/generate-invoice", async (req, res) => {
    try {
      const loadId = req.params.id;
      const { customerId } = req.body;
      const load = await storage.getLoad(loadId);
      
      console.log(`📋 INVOICE GENERATION for load ${loadId}:`, {
        loadNumber: load?.number109,
        hasLoad: !!load,
        hasLocation: !!load?.location,
        locationCity: load?.location?.city,
        locationState: load?.location?.state,
        tripRate: load?.tripRate,
        lumperCharge: load?.lumperCharge,
        extraStops: load?.extraStops,
        podDocumentPath: load?.podDocumentPath,
        bolNumber: load?.bolNumber
      });
      
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
        console.log(`⚠️ Invoice already exists for load ${load.number109}`);
        return res.status(400).json({ message: "Invoice already exists for this load" });
      }

      // Get rate for the location (optional if tripRate is set on load)
      const rate = (load.location?.city && load.location?.state) ? await storage.getRateByLocation(
        load.location.city, 
        load.location.state
      ) : null;
      
      console.log(`📊 RATE LOOKUP for ${load.location.city}, ${load.location.state}:`, {
        foundRate: !!rate,
        flatRate: rate?.flatRate
      });
      
      // Calculate invoice amount based on flat rate system
      // Priority: 1) tripRate from load (manual override), 2) database flat rate, 3) error
      const tripRate = parseFloat(load.tripRate?.toString() || "0");
      
      // Check if we have ANY rate source
      if (tripRate <= 0 && !rate) {
        return res.status(400).json({ 
          message: `No rate found for ${load.location.city}, ${load.location.state} and load has no tripRate set. Please add a rate or set tripRate on the load.` 
        });
      }
      
      const flatRate = tripRate > 0 ? tripRate : (rate ? parseFloat(rate.flatRate.toString()) : 0);
      const lumperCharge = parseFloat(load.lumperCharge?.toString() || "0");
      const extraStopsCharge = parseFloat(load.extraStops?.toString() || "0");
      const totalAmount = flatRate + lumperCharge + extraStopsCharge;
      
      console.log(`💰 INVOICE CALCULATION:`, {
        tripRateFromLoad: tripRate,
        flatRateFromLocation: rate?.flatRate,
        finalFlatRate: flatRate,
        usingTripRate: tripRate > 0,
        lumperCharge,
        extraStopsCharge,
        totalAmount
      });

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
      console.log(`📄 POD CHECK for load ${load.number109}:`, {
        hasPodDocumentPath: !!load.podDocumentPath,
        podDocumentPath: load.podDocumentPath,
        podPathLength: load.podDocumentPath?.length
      });
      
      if (load.podDocumentPath) {
        invoiceData.podUrl = load.podDocumentPath;
        invoiceData.podAttachedAt = now;
        invoiceData.finalizedAt = now;
        invoiceData.status = "finalized"; // Set to finalized since POD is embedded
        
        console.log(`📄 POD CHECK - Fetching POD snapshot for load ${load.number109}:`, {
          podDocumentPath: load.podDocumentPath,
          pathLength: load.podDocumentPath.length,
          pathType: typeof load.podDocumentPath
        });
        
        // Fetch POD snapshot data for embedding with detailed error handling
        try {
          const podSnapshot = await fetchPodSnapshot(load.podDocumentPath);
          if (podSnapshot) {
            invoiceData.podSnapshot = [podSnapshot]; // Store as array for consistency with multi-POD
            console.log(`✅ POD snapshot embedded into manual invoice for load ${load.number109}:`, {
              size: podSnapshot.size,
              contentType: podSnapshot.contentType,
              sourcePath: podSnapshot.sourcePath,
              base64Length: podSnapshot.contentBase64?.length || 0
            });
          } else {
            console.error(`❌ POD snapshot fetch returned NULL for load ${load.number109} - POD will not be in invoice!`);
          }
        } catch (podFetchError) {
          console.error(`❌ POD snapshot fetch EXCEPTION for load ${load.number109}:`, {
            error: podFetchError instanceof Error ? podFetchError.message : String(podFetchError),
            stack: podFetchError instanceof Error ? podFetchError.stack : 'No stack',
            podPath: load.podDocumentPath
          });
        }
        
        console.log(`📄 POD path found on load ${load.number109} - attempted to embed`);
      } else {
        console.log(`⚠️ NO POD document path found on load ${load.number109} - invoice will not include POD`);
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
      console.log("📤 Starting POD upload URL generation...");
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      console.log("✅ Upload URL generated successfully");
      
      // Generate the permanent object path from the upload URL
      const publicPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      console.log("✅ Public path normalized:", publicPath);
      
      res.json({ 
        uploadURL,
        publicPath // Send permanent path that frontend should use
      });
    } catch (error) {
      console.error("❌ Error getting upload URL:");
      console.error("Error details:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ 
        message: "Failed to get upload URL",
        error: errorMessage 
      });
    }
  });

  // Direct upload endpoint - bypasses CORS by uploading through the server
  const directUpload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });

  app.post("/api/objects/direct-upload", directUpload.single('file'), async (req, res) => {
    try {
      // Check authentication
      const bypassToken = req.headers['x-bypass-token'];
      const hasTokenBypass = bypassToken === BYPASS_SECRET;
      const hasReplitAuth = req.isAuthenticated && req.isAuthenticated();
      const hasDriverAuth = (req.session as any)?.driverAuth;
      const hasAuth = hasReplitAuth || hasDriverAuth || hasTokenBypass;

      if (!hasAuth) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }

      console.log("📤 Direct upload - file received:", req.file.originalname, req.file.size, "bytes");

      // Use the existing properly-configured GCS client
      const { getObjectStorageClient } = await import("./objectStorage");
      const storage = getObjectStorageClient();

      // Generate unique filename
      const { randomUUID } = await import("crypto");
      const objectId = randomUUID();
      const bucketName = process.env.GCS_BUCKET_NAME || 'loadtracker_documents';
      const objectName = `private/uploads/${objectId}`;

      console.log("📤 Uploading to GCS:", bucketName, objectName);

      // Upload file to GCS
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      // RAILWAY FIX: Return proper Google Cloud Storage URL, not /gs:// format
      const publicPath = `https://storage.googleapis.com/${bucketName}/${objectName}`;
      console.log("✅ Direct upload successful:", publicPath);

      res.json({ 
        publicPath,
        fileName: req.file.originalname,
        fileSize: req.file.size
      });
    } catch (error) {
      console.error("❌ Direct upload error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ 
        message: "Failed to upload file",
        error: errorMessage 
      });
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
      console.log(`📄 Starting POD update for load ${req.params.id}`);
      const { podDocumentURL, iftaTruckNumber, odometerReading, fuelGallons, fuelAmount } = req.body;
      
      if (!podDocumentURL) {
        console.error("❌ No POD document URL provided");
        return res.status(400).json({ message: "POD document URL is required" });
      }

      // Validate required IFTA fields
      if (!iftaTruckNumber || !odometerReading) {
        console.error("❌ Missing required IFTA fields");
        return res.status(400).json({ message: "Truck # and Odometer Reading are required for IFTA reporting" });
      }

      // Strict numeric validation helper
      const isValidNumber = (value: any): boolean => {
        if (typeof value !== 'string' && typeof value !== 'number') return false;
        const str = String(value).trim();
        if (str === '') return false;
        // Only allow digits, single decimal point, no commas or other characters
        return /^[0-9]+(\.[0-9]+)?$/.test(str);
      };

      // Validate odometer reading
      if (!isValidNumber(odometerReading) || parseFloat(odometerReading) <= 0) {
        console.error("❌ Invalid odometer reading value:", odometerReading);
        return res.status(400).json({ message: "Odometer Reading must be a valid positive number (no commas or letters)" });
      }

      // Validate optional fuel fields if provided
      if (fuelGallons !== null && fuelGallons !== undefined) {
        if (!isValidNumber(fuelGallons) || parseFloat(fuelGallons) < 0) {
          console.error("❌ Invalid fuel gallons value:", fuelGallons);
          return res.status(400).json({ message: "Fuel Gallons must be a valid non-negative number (no commas or letters)" });
        }
      }

      if (fuelAmount !== null && fuelAmount !== undefined) {
        if (!isValidNumber(fuelAmount) || parseFloat(fuelAmount) < 0) {
          console.error("❌ Invalid fuel amount value:", fuelAmount);
          return res.status(400).json({ message: "Fuel Amount must be a valid non-negative number (no commas or symbols)" });
        }
      }

      console.log(`📄 POD URL for load ${req.params.id}: ${podDocumentURL}`);
      console.log(`🚛 IFTA Data - Truck: ${iftaTruckNumber}, Odometer: ${odometerReading}, Fuel: ${fuelGallons || 'N/A'}gal, Amount: $${fuelAmount || 'N/A'}`);
      
      // Update load with POD document path
      console.log(`📄 Calling storage.updateLoadPOD...`);
      const load = await storage.updateLoadPOD(req.params.id, podDocumentURL);
      console.log(`✅ POD saved for load: ${load.number109}`);

      // Get previous odometer reading for this truck
      console.log(`🚛 Looking up previous odometer reading for truck ${iftaTruckNumber}...`);
      const previousLoads = await storage.getLoads();
      const previousTruckLoads = previousLoads
        .filter((l: any) => 
          l.iftaTruckNumber === iftaTruckNumber && 
          l.odometerReading && 
          l.id !== req.params.id &&
          l.deliveredAt // Only completed loads
        )
        .sort((a: any, b: any) => {
          const dateA = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
          const dateB = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
          return dateB - dateA; // Most recent first
        });
      
      const previousLoad = previousTruckLoads[0];
      const previousOdometer = previousLoad?.odometerReading ? parseFloat(previousLoad.odometerReading) : null;
      const currentOdometer = parseFloat(odometerReading);
      const calculatedMiles = previousOdometer ? currentOdometer - previousOdometer : null;

      console.log(`🚛 Previous odometer: ${previousOdometer || 'N/A'}, Current: ${currentOdometer}, Miles this trip: ${calculatedMiles || 'N/A (first load)'}`);

      // Update load with IFTA data
      console.log(`🚛 Saving IFTA data for load ${req.params.id}...`);
      const iftaData: any = {
        iftaTruckNumber: iftaTruckNumber.trim(),
        odometerReading: odometerReading.toString(),
        previousOdometerReading: previousOdometer ? previousOdometer.toString() : null,
        milesThisTrip: calculatedMiles ? calculatedMiles.toString() : null,
        fuelGallons: fuelGallons ? fuelGallons.toString() : null,
        fuelAmount: fuelAmount ? fuelAmount.toString() : null,
      };

      // Get HERE Maps state-by-state mileage breakdown
      console.log(`🗺️  Fetching state-by-state mileage from HERE Maps...`);
      const { getLoadStateMileage } = await import("./hereRoutingService");
      const loadWithCoordinates = await storage.getLoad(req.params.id);
      
      let routeMiles = 0;
      let pickupState: string | null = null;
      
      if (loadWithCoordinates) {
        const routeAnalysis = await getLoadStateMileage(loadWithCoordinates);
        
        if (routeAnalysis && routeAnalysis.milesByState) {
          iftaData.milesByState = routeAnalysis.milesByState;
          routeMiles = routeAnalysis.totalMiles || 0;
          console.log(`✅ State-by-state mileage calculated:`, routeAnalysis.milesByState);
          console.log(`   HERE Maps total: ${routeAnalysis.totalMiles} miles vs Odometer: ${calculatedMiles || 'N/A'} miles`);
        } else {
          console.log(`⚠️  Could not calculate state-by-state mileage (missing coordinates or API error)`);
        }
        
        // Get pickup state for deadhead assignment from first pickup stop
        const pickupStops = await storage.getLoadStops(req.params.id);
        const firstPickup = pickupStops.find(stop => stop.stopType === 'pickup');
        if (firstPickup) {
          // Get location details from stop or fall back to pickupLocation
          if (firstPickup.locationId) {
            const stopLocation = await storage.getLocation(firstPickup.locationId);
            pickupState = stopLocation?.state || null;
          }
          console.log(`📦 Pickup state identified from stop: ${pickupState || 'N/A'}`);
        }
      }

      // Calculate deadhead miles if we have starting odometer
      if (loadWithCoordinates?.startingOdometerReading) {
        const startingOdometer = parseFloat(loadWithCoordinates.startingOdometerReading);
        const endingOdometer = currentOdometer;
        const totalTripMiles = endingOdometer - startingOdometer;
        const rawDeadheadMiles = totalTripMiles - routeMiles;
        
        // Clamp deadhead miles to zero minimum (can't have negative deadhead)
        const deadheadMiles = Math.max(0, rawDeadheadMiles);
        
        console.log(`🚛 IFTA Deadhead Calculation:`);
        console.log(`   Starting Odometer: ${startingOdometer}`);
        console.log(`   Ending Odometer: ${endingOdometer}`);
        console.log(`   Total Trip Miles: ${totalTripMiles}`);
        console.log(`   Route Miles (HERE Maps): ${routeMiles}`);
        console.log(`   Raw Deadhead Miles: ${rawDeadheadMiles}`);
        console.log(`   Deadhead Miles (clamped): ${deadheadMiles}`);
        
        // Only save deadhead data if positive and we have a pickup state
        if (deadheadMiles > 0 && pickupState) {
          iftaData.deadheadMiles = deadheadMiles.toFixed(1);
          iftaData.deadheadMilesByState = {
            [pickupState]: parseFloat(deadheadMiles.toFixed(1))
          };
          console.log(`   ✅ Deadhead assigned to ${pickupState}: ${deadheadMiles.toFixed(1)} miles`);
        } else if (rawDeadheadMiles < 0) {
          console.log(`   ⚠️  Deadhead would be negative (${rawDeadheadMiles.toFixed(1)}) - skipping deadhead assignment`);
        } else if (!pickupState) {
          console.log(`   ⚠️  No pickup state found - cannot assign deadhead miles`);
        }
      } else {
        console.log(`⚠️  No starting odometer - cannot calculate deadhead miles`);
      }

      await storage.updateLoad(req.params.id, iftaData);
      console.log(`✅ IFTA data saved for load: ${load.number109}`);
      
      // First set status to delivered when POD is uploaded
      if (load.status !== "delivered" && load.status !== "awaiting_invoicing" && load.status !== "awaiting_payment" && load.status !== "paid") {
        console.log(`📄 Updating load status to delivered...`);
        await storage.updateLoadStatus(req.params.id, "delivered");
        // Set delivered timestamp using direct database update
        await db.update(loads).set({ 
          deliveredAt: new Date(),
          updatedAt: new Date() 
        }).where(eq(loads.id, req.params.id));
        console.log(`✅ Load ${req.params.id} marked as DELIVERED - POD uploaded successfully`);
      }

      // FIXED WORKFLOW: Set to awaiting_invoicing first, then auto-generate
      console.log(`📄 Getting load details for invoicing workflow...`);
      const loadWithDetails = await storage.getLoad(req.params.id);
      if (loadWithDetails && loadWithDetails.status === "delivered") {
        console.log(`📄 Moving to awaiting_invoicing status...`);
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
              
              // Fetch POD snapshot data for embedding AT UPLOAD TIME (critical for Railway)
              console.log(`📄 CRITICAL: Fetching POD snapshot to embed at upload time for ${loadForInvoice.number109}`);
              console.log(`📄 POD URL to fetch: ${podDocumentURL}`);
              
              try {
                const podSnapshot = await fetchPodSnapshot(podDocumentURL);
                if (podSnapshot) {
                  invoiceData.podSnapshot = [podSnapshot]; // Store as array for multi-POD consistency
                  console.log(`✅ SUCCESS: POD snapshot embedded at upload time:`, {
                    load: loadForInvoice.number109,
                    size: podSnapshot.size,
                    contentType: podSnapshot.contentType,
                    base64Length: podSnapshot.contentBase64?.length || 0,
                    sourcePath: podSnapshot.sourcePath
                  });
                } else {
                  console.error(`❌ CRITICAL: POD snapshot returned NULL for ${loadForInvoice.number109}`);
                  console.error(`   This means the invoice will be created WITHOUT the POD image!`);
                  console.error(`   URL attempted: ${podDocumentURL}`);
                }
              } catch (podError) {
                console.error(`❌ EXCEPTION during POD fetch at upload time:`, {
                  load: loadForInvoice.number109,
                  error: podError instanceof Error ? podError.message : String(podError),
                  stack: podError instanceof Error ? podError.stack : 'No stack',
                  podURL: podDocumentURL
                });
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
      console.error("❌ Error updating POD:");
      console.error("Error details:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ 
        message: "Failed to update POD document",
        error: errorMessage 
      });
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

  // Aging Report - shows unpaid invoices grouped by age
  app.get("/api/reports/aging", isAdminAuthenticated, async (req, res) => {
    try {
      // Get all unpaid loads with their invoices
      const unpaidLoads = await db
        .select({
          loadId: loads.id,
          loadNumber: loads.number109,
          customerId: loads.customerId,
          customerName: customers.name,
          invoiceId: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          totalAmount: invoices.totalAmount,
          generatedAt: invoices.generatedAt,
          paidAt: loads.paidAt,
        })
        .from(loads)
        .leftJoin(invoices, eq(loads.id, invoices.loadId))
        .leftJoin(customers, eq(loads.customerId, customers.id))
        .where(sql`${loads.paidAt} IS NULL AND ${invoices.id} IS NOT NULL`)
        .orderBy(desc(invoices.generatedAt));

      // Calculate days old and group by age buckets
      const now = new Date();
      const agingData: {
        current: any[];
        days30: any[];
        days60: any[];
        days90plus: any[];
        totals: {
          current: number;
          days30: number;
          days60: number;
          days90plus: number;
          total: number;
        };
        byCustomer: Record<string, {
          customerName: string;
          current: number;
          days30: number;
          days60: number;
          days90plus: number;
          total: number;
        }>;
      } = {
        current: [],
        days30: [],
        days60: [],
        days90plus: [],
        totals: {
          current: 0,
          days30: 0,
          days60: 0,
          days90plus: 0,
          total: 0,
        },
        byCustomer: {},
      };

      unpaidLoads.forEach((load) => {
        const daysOld = load.generatedAt 
          ? Math.floor((now.getTime() - new Date(load.generatedAt).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        
        const amount = parseFloat(load.totalAmount || "0");
        const customerKey = load.customerId || "unknown";
        const customerName = load.customerName || "Unknown Customer";

        // Initialize customer totals if needed
        if (!agingData.byCustomer[customerKey]) {
          agingData.byCustomer[customerKey] = {
            customerName,
            current: 0,
            days30: 0,
            days60: 0,
            days90plus: 0,
            total: 0,
          };
        }

        // Categorize by age
        if (daysOld <= 30) {
          agingData.current.push({ ...load, daysOld, amount });
          agingData.totals.current += amount;
          agingData.byCustomer[customerKey].current += amount;
        } else if (daysOld <= 60) {
          agingData.days30.push({ ...load, daysOld, amount });
          agingData.totals.days30 += amount;
          agingData.byCustomer[customerKey].days30 += amount;
        } else if (daysOld <= 90) {
          agingData.days60.push({ ...load, daysOld, amount });
          agingData.totals.days60 += amount;
          agingData.byCustomer[customerKey].days60 += amount;
        } else {
          agingData.days90plus.push({ ...load, daysOld, amount });
          agingData.totals.days90plus += amount;
          agingData.byCustomer[customerKey].days90plus += amount;
        }

        agingData.totals.total += amount;
        agingData.byCustomer[customerKey].total += amount;
      });

      res.json(agingData);
    } catch (error) {
      console.error("Error generating aging report:", error);
      res.status(500).json({ message: "Failed to generate aging report" });
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
    // Allow admin, Replit auth, driver auth, OR bypass for tracking data
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    console.log("📍 Tracking endpoint reached - fetching active loads with GPS data");
    try {
      const trackingLoads = await storage.getLoadsWithTracking();
      console.log(`📍 Found ${trackingLoads.length} loads with tracking enabled`);
      
      // Log which loads have GPS data
      trackingLoads.forEach(load => {
        if (load.currentLatitude && load.currentLongitude) {
          console.log(`  ✅ Load ${load.number109}: GPS at ${load.currentLatitude}, ${load.currentLongitude}`);
        } else {
          console.log(`  ⚠️ Load ${load.number109}: No GPS data yet`);
        }
      });
      
      res.json(trackingLoads);
    } catch (error) {
      console.error("❌ Error fetching tracking loads:", error);
      res.status(500).json({ message: "Failed to fetch tracking data" });
    }
  });

  // OCR Routes for Rate Con processing using Google Document AI
  app.post('/api/ocr/extract', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file provided' });
      }

      console.log("📄 Processing document for OCR:", req.file.originalname, req.file.mimetype, req.file.size);
      
      // ENHANCED: Detailed credential validation for Railway debugging
      const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
      const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
      const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION || 'us';
      const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      
      console.log("📄 Google Cloud Config Validation:", {
        projectId: projectId ? `${projectId.substring(0, 10)}...` : 'MISSING',
        processorId: processorId ? `${processorId.substring(0, 10)}...` : 'MISSING',
        location: location,
        hasCredentials: !!credentialsJson,
        credentialsLength: credentialsJson?.length || 0
      });
      
      // Validate required environment variables
      if (!projectId) {
        console.error('❌ GOOGLE_CLOUD_PROJECT_ID is not set');
        return res.status(500).json({ 
          message: 'OCR service misconfigured: Missing project ID',
          error: 'GOOGLE_CLOUD_PROJECT_ID environment variable not set'
        });
      }
      
      if (!processorId) {
        console.error('❌ GOOGLE_DOCUMENT_AI_PROCESSOR_ID is not set');
        return res.status(500).json({ 
          message: 'OCR service misconfigured: Missing processor ID',
          error: 'GOOGLE_DOCUMENT_AI_PROCESSOR_ID environment variable not set'
        });
      }
      
      if (!credentialsJson) {
        console.error('❌ GOOGLE_APPLICATION_CREDENTIALS_JSON is not set');
        return res.status(500).json({ 
          message: 'OCR service misconfigured: Missing credentials',
          error: 'GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable not set'
        });
      }
      
      // Import Google Document AI service
      const { extractLoadDataFromDocument } = await import('./googleDocumentAI');
      
      console.log("📄 Calling Document AI extraction...");
      const extractedData = await extractLoadDataFromDocument(req.file.buffer, req.file.mimetype);
      
      console.log("✅ OCR extraction successful:", {
        confidence: extractedData.confidence,
        fieldsExtracted: Object.keys(extractedData).filter(k => extractedData[k as keyof typeof extractedData]).length
      });
      
      res.json(extractedData);
    } catch (error) {
      console.error('❌ OCR extraction error:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('❌ Error type:', error?.constructor?.name);
      
      // ENHANCED: Log detailed error information for Railway debugging
      if (error && typeof error === 'object') {
        console.error('❌ Error object keys:', Object.keys(error));
        console.error('❌ Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = errorMessage.includes('quality') || errorMessage.includes('resolution') ? 400 : 500;
      
      // Return detailed error message for debugging
      res.status(statusCode).json({ 
        message: errorMessage.includes('quality') || errorMessage.includes('resolution') 
          ? errorMessage 
          : `Failed to extract data from document. ${errorMessage}`,
        error: errorMessage,
        errorType: error?.constructor?.name || 'Unknown',
        suggestions: errorMessage.includes('quality') ? [
          'Take photo in better lighting',
          'Use a scanner instead of camera',
          'Ensure image is in focus',
          'Upload a higher resolution image'
        ] : [
          'Check that all Google Document AI credentials are configured',
          'Verify processor ID matches your Google Cloud project',
          'Ensure the file format is supported (PDF, PNG, JPEG, GIF, WebP)'
        ]
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

      console.log("🚛 Creating load from OCR data:", { 
        loadNumber: number109, 
        pickupCompany: extractedData.pickupCompanyName,
        deliveryCompany: extractedData.deliveryCompanyName,
        pickup: extractedData.pickupAddress,
        delivery: extractedData.deliveryAddress,
        poNumber: extractedData.poNumber
      });

      // Create stops array from extracted addresses with correct company names
      const stops: Partial<InsertLoadStop>[] = [];
      
      if (extractedData.pickupAddress) {
        stops.push({
          stopType: 'pickup',
          stopSequence: 1,
          // Use specific pickup company name, fallback to general company name, then generic label
          companyName: extractedData.pickupCompanyName || extractedData.companyName || 'Pickup Location',
          address: extractedData.pickupAddress,
          contactName: null,
          contactPhone: null,
          notes: null
        });
      }
      
      if (extractedData.deliveryAddress) {
        stops.push({
          stopType: 'dropoff',
          stopSequence: 2,
          // Use specific delivery company name, fallback to general company name, then generic label
          companyName: extractedData.deliveryCompanyName || extractedData.companyName || 'Delivery Location',
          address: extractedData.deliveryAddress,
          contactName: null,
          contactPhone: null,
          notes: null
        });
      }

      // Calculate mileage if we have both pickup and delivery addresses
      let calculatedMiles: string | null = null;
      if (extractedData.pickupAddress && extractedData.deliveryAddress) {
        try {
          console.log("📍 Calculating route mileage...");
          const { HERETrackingService } = await import('./services/hereTracking');
          const hereService = new HERETrackingService();
          
          const routeInfo = await hereService.calculateOptimizedRoute(
            { lat: 0, lng: 0, address: extractedData.pickupAddress },
            { lat: 0, lng: 0, address: extractedData.deliveryAddress }
          );
          
          if (routeInfo && routeInfo.distance) {
            // Convert meters to miles
            const miles = (routeInfo.distance / 1609.34).toFixed(2);
            calculatedMiles = miles;
            console.log(`✅ Route calculated: ${miles} miles`);
          }
        } catch (error) {
          console.error('⚠️  Route calculation failed, continuing without mileage:', error);
        }
      }

      // Create the load with extracted data
      const loadData = {
        number109,
        status: 'created' as const,
        bolNumber: null, // BOL should only be set for actual Bill of Lading numbers, not load numbers
        poNumber: extractedData.poNumber || null,
        appointmentTime: extractedData.appointmentTime || null,
        pickupAddress: extractedData.pickupAddress || null,
        deliveryAddress: extractedData.deliveryAddress || null,
        companyName: extractedData.companyName || null,
        estimatedMiles: calculatedMiles,
        extraStops: "0.00",
        lumperCharge: "0.00",
        driverId: null,
        locationId: null,
        bolDocumentPath: null,
        podDocumentPath: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create load with stops (storage.createLoad adds loadId internally)
      const newLoad = await storage.createLoad(loadData, stops.length > 0 ? stops as any : undefined);
      
      console.log("✅ Generated load from OCR:", newLoad.number109, {
        stops: stops.length,
        miles: calculatedMiles
      });
      
      res.json({
        ...newLoad,
        message: `Load ${newLoad.number109} created from Rate Con data`,
        extractedData,
        calculatedMiles
      });
      
    } catch (error) {
      console.error('❌ Load generation error:', error);
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

      // IMPORTANT: Use LOAD's financial data if available (updated more recently than invoice)
      // This ensures print preview shows the latest lumper charge even before clicking "Update Invoice"
      // Use nullish coalescing (??) to properly handle zero values
      // Check BOTH tripRate and flatRate fields on load (either one could have the freight charge)
      const mergedInvoice = {
        ...invoice,
        flatRate: load.tripRate ?? load.flatRate ?? invoice.flatRate,
        lumperCharge: load.lumperCharge ?? invoice.lumperCharge,
        extraStopsCharge: load.extraStops ?? invoice.extraStopsCharge
      };
      
      // Recalculate total with latest values
      const flatRateNum = parseFloat(mergedInvoice.flatRate?.toString() || '0');
      const lumperChargeNum = parseFloat(mergedInvoice.lumperCharge?.toString() || '0');
      const extraStopsNum = parseFloat(mergedInvoice.extraStopsCharge?.toString() || '0');
      mergedInvoice.totalAmount = (flatRateNum + lumperChargeNum + extraStopsNum).toFixed(2);
      
      console.log(`💰 Preview using merged financial data:`, {
        loadNumber: load.number109,
        flatRate: mergedInvoice.flatRate,
        lumperCharge: mergedInvoice.lumperCharge,
        extraStops: mergedInvoice.extraStopsCharge,
        total: mergedInvoice.totalAmount,
        source: 'Load data merged with invoice'
      });

      // Generate the base invoice HTML (simplified - no rate confirmation)
      const invoiceContext = await computeInvoiceContext(load);
      const baseHTML = generateInvoiceOnlyHTML(mergedInvoice, load, invoiceContext.deliveryLocationText, invoiceContext.bolPodText);
      
      // Embed POD images if available - PRIORITIZE STORED SNAPSHOTS
      let previewHTML = baseHTML;
      const podImages: Array<{content: Buffer, type: string}> = [];
      
      // FIXED: Get ALL POD snapshots for multi-POD loads (print preview)
      const allPodSnapshots = await getAllPodSnapshots(invoice, load.podDocumentPath || undefined);
      const pdfPods: Array<{content: Buffer, type: string, filename: string}> = [];
      
      if (allPodSnapshots.length > 0) {
        console.log(`🖨️ Using ${allPodSnapshots.length} POD(s) for print preview: stored=${!!invoice.podSnapshot} fallback=${!invoice.podSnapshot}`);
        allPodSnapshots.forEach((snapshot, index) => {
          const podBuffer = convertPodSnapshotToBuffer(snapshot);
          
          // Check if POD is a PDF - if so, track separately (cannot embed as image)
          if (podBuffer.type === 'application/pdf') {
            console.log(`📎 POD ${index + 1} is a PDF - will note in preview (cannot embed as image)`);
            pdfPods.push({
              content: podBuffer.content,
              type: podBuffer.type,
              filename: `POD-${load.number109}-Page${index + 1}.pdf`
            });
          } else {
            // Only add image PODs to the embedding list
            podImages.push(podBuffer);
            console.log(`🖨️ POD ${index + 1}: ${snapshot.sourcePath} (${snapshot.size} bytes) - will embed as image`);
          }
        });
        console.log(`✅ PODs processed: ${podImages.length} images to embed, ${pdfPods.length} PDFs noted`);
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
      
      // Add note for PDF PODs that will be attached separately
      if (pdfPods.length > 0) {
        console.log(`📎 Adding note about ${pdfPods.length} PDF POD(s) that will be attached separately`);
        const pdfNotesHTML = pdfPods.map((pdf, index) => 
          generatePODSectionHTML([{content: pdf.content, type: pdf.type}], load.number109).replace('POD', `POD (PDF ${index + 1})`)
        ).join('');
        previewHTML = previewHTML.replace('</body>', `${pdfNotesHTML}</body>`);
      }

      res.json({
        success: true,
        previewHTML,
        invoice,
        load,
        podAttachments: [
          ...podImages.map((img, index) => ({
            filename: `POD_${load.number109}_${index + 1}.jpg`,
            contentType: img.type,
            size: img.content.length
          })),
          ...pdfPods.map((pdf, index) => ({
            filename: pdf.filename,
            contentType: pdf.type,
            size: pdf.content.length
          }))
        ]
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
            <td>$${(parseFloat(invoice?.flatRate || '0')).toFixed(2)}</td>
          </tr>
          ${parseFloat(invoice?.lumperCharge || '0') > 0 ? `
          <tr>
            <td>Lumper Charge</td>
            <td>$${(parseFloat(invoice?.lumperCharge || '0')).toFixed(2)}</td>
          </tr>
          ` : ''}
          ${parseFloat(invoice?.extraStopsCharge || '0') > 0 ? `
          <tr>
            <td>Extra Stops Charge${invoice?.extraStopsCount > 0 ? ` (${invoice.extraStopsCount})` : ''}</td>
            <td>$${(parseFloat(invoice?.extraStopsCharge || '0')).toFixed(2)}</td>
          </tr>
          ` : ''}
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
        console.log(`⚠️ PDF content detected for POD ${index + 1} - skipping embed (PDFs cannot be displayed as images)`);
        // Skip PDF PODs - they can't be embedded as images in HTML/PDF
        return `
          <div style="margin-top: 40px; padding: 20px; border-top: 3px solid #2d5aa0;">
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
              <h2 style="color: #2d5aa0; margin: 0;">Proof of Delivery (POD ${index + 1})</h2>
              <p style="color: #666; margin: 5px 0;">Load ${loadNumber} - PDF Document</p>
            </div>
            <div style="text-align: center; padding: 40px; background: #e3f2fd; border: 2px solid #2196f3; border-radius: 8px;">
              <p style="color: #1976d2; font-weight: bold; font-size: 16px;">📄 PDF POD Document</p>
              <p style="color: #424242; font-size: 14px; margin-top: 10px;">This PDF will be included in the merged invoice when emailed.</p>
              <p style="color: #757575; font-size: 12px; margin-top: 5px;">(Cannot be displayed in print preview, but is included in email attachment)</p>
            </div>
          </div>
        `;
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

  // HERE Tracking API Webhook - Automatic geofence entry/exit notifications
  // Secured with shared secret to prevent spoofing
  app.post("/api/tracking-webhook", async (req, res) => {
    try {
      // Log all webhook attempts for security monitoring
      const clientIP = req.ip || req.socket.remoteAddress;
      console.log(`📬 Webhook request from IP: ${clientIP}`);
      
      // Verify webhook authenticity using shared secret
      const webhookSecret = process.env.HERE_WEBHOOK_SECRET;
      const providedSecret = req.headers['x-webhook-secret'] as string;
      
      // Use constant-time comparison to prevent timing attacks
      if (webhookSecret && (!providedSecret || 
          !require('crypto').timingSafeEqual(
            Buffer.from(webhookSecret),
            Buffer.from(providedSecret)
          ))) {
        console.warn(`⚠️ SECURITY ALERT: Webhook authentication FAILED from ${clientIP} - invalid secret`);
        console.warn(`Headers received:`, JSON.stringify(req.headers, null, 2));
        return res.status(403).json({ message: 'Forbidden: Invalid webhook secret' });
      }
      
      if (!webhookSecret) {
        console.warn(`⚠️ SECURITY WARNING: HERE_WEBHOOK_SECRET not configured - webhooks unprotected! Request from ${clientIP}`);
      }
      
      const event = req.body;
      console.log('✅ Webhook authenticated - processing event:', JSON.stringify(event, null, 2));

      // HERE Tracking sends events like:
      // { type: 'geofence.entry', deviceId: 'load_123', geofenceId: 'geofence_456', timestamp: '...' }
      // { type: 'geofence.exit', deviceId: 'load_123', geofenceId: 'geofence_456', timestamp: '...' }

      const { type, deviceId, geofenceId, timestamp } = event;
      
      if (!type || !deviceId || !geofenceId) {
        console.warn('⚠️ Invalid webhook payload - missing required fields');
        return res.status(400).json({ message: 'Invalid webhook payload' });
      }

      // Extract load ID from device ID (format: load_{loadId})
      const loadId = deviceId.replace('load_', '');
      
      // Get the load to check which geofence was triggered
      const [load] = await db.select().from(loads).where(eq(loads.id, loadId)).limit(1);
      
      if (!load) {
        console.warn(`⚠️ Load not found for device: ${deviceId}`);
        return res.status(404).json({ message: 'Load not found' });
      }

      const eventTime = new Date(timestamp || Date.now());
      const isEntry = type === 'geofence.entry';
      const isExit = type === 'geofence.exit';

      // Determine which location (shipper or receiver) based on geofence ID
      const isShipperGeofence = geofenceId === load.shipperGeofenceId;
      const isReceiverGeofence = geofenceId === load.receiverGeofenceId;

      if (isShipperGeofence) {
        if (isEntry && !load.shipperInTime) {
          // Driver arrived at shipper
          await db.update(loads)
            .set({ 
              shipperInTime: eventTime,
              status: 'at_shipper',
              updatedAt: new Date()
            })
            .where(eq(loads.id, loadId));
          console.log(`✅ Load ${load.number109}: Driver ARRIVED at shipper at ${eventTime.toISOString()}`);
        } else if (isExit && load.shipperInTime && !load.shipperOutTime) {
          // Driver left shipper
          await db.update(loads)
            .set({ 
              shipperOutTime: eventTime,
              status: 'left_shipper',
              updatedAt: new Date()
            })
            .where(eq(loads.id, loadId));
          console.log(`✅ Load ${load.number109}: Driver LEFT shipper at ${eventTime.toISOString()}`);
        }
      } else if (isReceiverGeofence) {
        if (isEntry && !load.receiverInTime) {
          // Driver arrived at receiver
          await db.update(loads)
            .set({ 
              receiverInTime: eventTime,
              status: 'at_receiver',
              updatedAt: new Date()
            })
            .where(eq(loads.id, loadId));
          console.log(`✅ Load ${load.number109}: Driver ARRIVED at receiver at ${eventTime.toISOString()}`);
        } else if (isExit && load.receiverInTime && !load.receiverOutTime) {
          // Driver left receiver
          await db.update(loads)
            .set({ 
              receiverOutTime: eventTime,
              updatedAt: new Date()
            })
            .where(eq(loads.id, loadId));
          console.log(`✅ Load ${load.number109}: Driver LEFT receiver at ${eventTime.toISOString()}`);
        }
      }

      res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error: any) {
      console.error('❌ Webhook processing failed:', error);
      res.status(500).json({ message: 'Webhook processing failed', error: error.message });
    }
  });

  // Historical Marker Road Tour API Routes
  // Get nearby historical markers based on GPS coordinates
  app.get("/api/road-tour/nearby", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { latitude, longitude, radiusMeters = 500 } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: "Latitude and longitude are required" });
      }

      const lat = parseFloat(latitude as string);
      const lon = parseFloat(longitude as string);
      const radius = parseInt(radiusMeters as string);

      const markers = await storage.getHistoricalMarkers(lat, lon, radius);
      res.json(markers);
    } catch (error: any) {
      console.error("Error fetching nearby markers:", error);
      res.status(500).json({ message: "Failed to fetch nearby markers", error: error.message });
    }
  });

  // Toggle road tour on/off for a driver
  app.post("/api/road-tour/toggle", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { driverId, enabled } = req.body;
      
      if (!driverId || typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "driverId and enabled (boolean) are required" });
      }

      const updatedUser = await storage.toggleRoadTour(driverId, enabled);
      res.json({ success: true, roadTourEnabled: updatedUser?.roadTourEnabled });
    } catch (error: any) {
      console.error("Error toggling road tour:", error);
      res.status(500).json({ message: "Failed to toggle road tour", error: error.message });
    }
  });

  // Mark a historical marker as heard by a driver
  app.post("/api/road-tour/mark-heard", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { driverId, markerId, loadId } = req.body;
      
      if (!driverId || !markerId) {
        return res.status(400).json({ message: "driverId and markerId are required" });
      }

      await storage.markAsHeard(driverId, parseInt(markerId), loadId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error marking marker as heard:", error);
      res.status(500).json({ message: "Failed to mark marker as heard", error: error.message });
    }
  });

  // Get road tour status for a driver
  app.get("/api/road-tour/status/:driverId", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { driverId } = req.params;
      const status = await storage.getRoadTourStatus(driverId);
      res.json(status);
    } catch (error: any) {
      console.error("Error fetching road tour status:", error);
      res.status(500).json({ message: "Failed to fetch road tour status", error: error.message });
    }
  });

  // Create a new historical marker (admin only)
  app.post("/api/road-tour/markers", isAuthenticated, async (req, res) => {
    try {
      const marker = await storage.createHistoricalMarker(req.body);
      res.json(marker);
    } catch (error: any) {
      console.error("Error creating historical marker:", error);
      res.status(500).json({ message: "Failed to create marker", error: error.message });
    }
  });

  // Generate on-demand TTS audio for a historical marker
  app.post("/api/road-tour/generate-audio", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || !!(req.session as any)?.driverAuth || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Authentication required" });
    }
  }, async (req, res) => {
    try {
      const { markerId, voice } = req.body;
      
      if (!markerId || !voice) {
        return res.status(400).json({ message: "markerId and voice are required" });
      }

      if (voice !== 'male' && voice !== 'female') {
        return res.status(400).json({ message: "voice must be 'male' or 'female'" });
      }

      // Get marker details
      const marker = await storage.getHistoricalMarker(parseInt(markerId));
      if (!marker) {
        return res.status(404).json({ message: "Marker not found" });
      }

      // Generate speech using ElevenLabs with GCS caching
      const { generateSpeechWithCache, formatMarkerTextForTTS } = await import('./services/elevenlabs');
      const text = formatMarkerTextForTTS(marker.title, marker.inscription);
      
      const { buffer: audioBuffer, fromCache } = await generateSpeechWithCache({
        text,
        voice: voice as 'male' | 'female',
        markerId: parseInt(markerId),
      });

      // Log cache status for monitoring
      console.log(`📊 Audio ${fromCache ? 'served from cache' : 'freshly generated'} for marker ${markerId} (${voice})`);

      // Return audio as MP3
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      res.setHeader('X-Cache-Status', fromCache ? 'HIT' : 'MISS'); // Debug header
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("Error generating audio:", error);
      res.status(500).json({ message: "Failed to generate audio", error: error.message });
    }
  });

  // Seed sample historical markers (admin only - use bypass secret)
  app.post("/api/road-tour/seed-markers", async (req, res) => {
    try {
      const bypassToken = req.headers['x-bypass-secret'];
      if (bypassToken !== BYPASS_SECRET) {
        return res.status(401).json({ message: "Unauthorized - invalid bypass secret" });
      }

      const { sampleMarkers } = await import('./sampleMarkers');
      const createdMarkers = [];
      
      for (const marker of sampleMarkers) {
        const created = await storage.createHistoricalMarker(marker);
        createdMarkers.push(created);
      }

      res.json({ 
        success: true, 
        message: `Successfully created ${createdMarkers.length} sample historical markers`,
        markers: createdMarkers 
      });
    } catch (error: any) {
      console.error("Error seeding markers:", error);
      res.status(500).json({ message: "Failed to seed markers", error: error.message });
    }
  });

  // Simple health check endpoint for Railway deployment
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Data migration endpoint (use bypass secret)
  app.post("/api/admin/migrate-data", (req, res, next) => {
    const bypassToken = req.headers['x-bypass-secret'];
    if (bypassToken === BYPASS_SECRET) {
      next();
    } else {
      res.status(401).json({ message: "Unauthorized - invalid bypass secret" });
    }
  }, async (req, res) => {
    try {
      const result = await migrateDataToRailway();
      res.json(result);
    } catch (error) {
      console.error("Migration error:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Migration failed" 
      });
    }
  });

  // ===== USAGE TRACKING & BILLING ROUTES =====
  
  // Get current usage for authenticated user
  app.get("/api/usage/current", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get user's subscription
      const subscription = await db
        .select()
        .from(customerSubscriptions)
        .where(eq(customerSubscriptions.userId, user.id))
        .limit(1);

      if (!subscription || subscription.length === 0) {
        return res.status(404).json({ message: "No active subscription found" });
      }

      const sub = subscription[0];
      const periodStart = sub.currentPeriodStart || new Date();
      const periodEnd = sub.currentPeriodEnd || new Date();

      // Import usage tracking functions
      const { getCurrentUsage, checkTierLimits } = await import("./usageTracking");

      // Get tier info
      const tier = await db
        .select()
        .from(pricingTiers)
        .where(eq(pricingTiers.id, sub.tierId))
        .limit(1);

      if (!tier || tier.length === 0) {
        return res.status(404).json({ message: "Pricing tier not found" });
      }

      // Get current usage
      const usage = await getCurrentUsage(user.id, periodStart, periodEnd);

      // Calculate overages
      const overages = await checkTierLimits(user.id, tier[0], usage);

      res.json({
        usage,
        overages,
      });
    } catch (error: any) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ message: "Failed to fetch usage data" });
    }
  });

  // Get current subscription for authenticated user
  app.get("/api/subscription/current", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get user's subscription
      const subscription = await db
        .select()
        .from(customerSubscriptions)
        .where(eq(customerSubscriptions.userId, user.id))
        .limit(1);

      if (!subscription || subscription.length === 0) {
        return res.status(404).json({ message: "No active subscription found" });
      }

      const sub = subscription[0];

      // Get tier info
      const tier = await db
        .select()
        .from(pricingTiers)
        .where(eq(pricingTiers.id, sub.tierId))
        .limit(1);

      if (!tier || tier.length === 0) {
        return res.status(404).json({ message: "Pricing tier not found" });
      }

      res.json({
        ...sub,
        tier: tier[0],
      });
    } catch (error: any) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription data" });
    }
  });

  // ===== DEMO SYSTEM ROUTES =====
  
  // Start a demo session
  app.post("/api/demo/start", async (req, res) => {
    try {
      const { fullName, email, companyName, phoneNumber } = req.body;

      if (!email || !fullName || !companyName) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Generate unique session token
      const sessionToken = crypto.randomUUID();
      
      // Create demo user account
      const demoUsername = `demo_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const demoUser = await storage.upsertUser({
        username: demoUsername,
        email: `demo_${sessionToken}@loadtracker.demo`,
        firstName: fullName.split(' ')[0] || fullName,
        lastName: fullName.split(' ').slice(1).join(' ') || '',
        role: "office",
        password: crypto.randomUUID(), // Random password they'll never need
      });

      // Create demo session record
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24-hour demo

      const demoSession = await db.insert(demoSessions).values({
        email,
        fullName,
        companyName,
        phoneNumber: phoneNumber || null,
        demoUserId: demoUser.id,
        sessionToken,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        expiresAt,
      }).returning();

      // Track visitor conversion
      const sessionId = req.cookies?.sessionId || crypto.randomUUID();
      await db.insert(visitorTracking).values({
        sessionId,
        pageUrl: '/demo/start',
        referrer: req.headers.referer || null,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        demoSessionId: demoSession[0].id,
      });

      res.json({
        success: true,
        sessionToken,
        demoUserId: demoUser.id,
        expiresAt,
      });
    } catch (error: any) {
      console.error("Error starting demo:", error);
      res.status(500).json({ message: "Failed to start demo session" });
    }
  });

  // Clean up demo data (called on logout)
  app.post("/api/demo/cleanup", async (req, res) => {
    try {
      const { sessionToken } = req.body;

      if (!sessionToken) {
        return res.status(400).json({ message: "Missing session token" });
      }

      // Find demo session
      const demoSession = await db
        .select()
        .from(demoSessions)
        .where(eq(demoSessions.sessionToken, sessionToken))
        .limit(1);

      if (!demoSession || demoSession.length === 0) {
        return res.status(404).json({ message: "Demo session not found" });
      }

      const session = demoSession[0];
      const demoUserId = session.demoUserId;

      if (!demoUserId) {
        return res.status(400).json({ message: "No demo user associated with session" });
      }

      // Delete all data created by demo user
      await db.delete(loads).where(eq(loads.driverId, demoUserId));
      await db.delete(customers).where(eq(customers.id, demoUserId)); // If they created customers
      await db.delete(users).where(eq(users.id, demoUserId));

      // Mark demo session as completed
      await db
        .update(demoSessions)
        .set({ completedAt: new Date() })
        .where(eq(demoSessions.id, session.id));

      res.json({ success: true, message: "Demo data cleaned up successfully" });
    } catch (error: any) {
      console.error("Error cleaning up demo:", error);
      res.status(500).json({ message: "Failed to cleanup demo data" });
    }
  });

  // Get visitor analytics (admin only)
  app.get("/api/analytics/visitors", isAuthenticated, async (req, res) => {
    try {
      // Check if user is admin
      const user = req.user as any;
      if (user?.role !== "office") {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const stats = await db.execute(sql`
        SELECT 
          COUNT(DISTINCT session_id) as unique_visitors,
          COUNT(*) as total_page_views,
          COUNT(DISTINCT demo_session_id) as demo_conversions
        FROM visitor_tracking
        WHERE visited_at >= NOW() - INTERVAL '30 days'
      `);

      const demoStats = await db.execute(sql`
        SELECT 
          COUNT(*) as total_demos,
          COUNT(CASE WHEN converted_to_customer THEN 1 END) as conversions,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) as avg_session_minutes
        FROM demo_sessions
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `);

      res.json({
        visitors: stats.rows[0],
        demos: demoStats.rows[0],
      });
    } catch (error: any) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ===== RETURN TO TERMINAL ROUTES =====
  
  // Calculate route from current location to terminal
  app.post("/api/return-to-terminal/calculate-route", async (req, res) => {
    try {
      const { currentLat, currentLng, terminalLat, terminalLng, driverId } = req.body;

      if (!currentLat || !currentLng || !terminalLat || !terminalLng) {
        return res.status(400).json({ message: "Missing required location coordinates" });
      }

      // Import the routing service
      const { getTruckRouteWithStateMileage } = await import('./hereRoutingService');
      
      // Calculate route with state-by-state mileage
      const routeAnalysis = await getTruckRouteWithStateMileage(
        currentLat,
        currentLng,
        terminalLat,
        terminalLng
      );

      if (!routeAnalysis) {
        return res.status(500).json({ message: "Failed to calculate route. Please check HERE Maps API configuration." });
      }

      // Estimate time (assuming average 55 mph)
      const estimatedTime = (routeAnalysis.totalMiles / 55) * 60; // in minutes

      res.json({
        totalMiles: routeAnalysis.totalMiles,
        milesByState: routeAnalysis.milesByState,
        estimatedTime: Math.round(estimatedTime)
      });
    } catch (error: any) {
      console.error("Error calculating return route:", error);
      res.status(500).json({ message: error.message || "Failed to calculate route" });
    }
  });

  // Start return trip and track IFTA miles
  app.post("/api/return-to-terminal/start", async (req, res) => {
    try {
      const { currentLat, currentLng, terminalLat, terminalLng, driverId, totalMiles, milesByState } = req.body;

      if (!currentLat || !currentLng || !terminalLat || !terminalLng || !driverId || !milesByState) {
        return res.status(400).json({ message: "Missing required data" });
      }

      // Create a special "return to terminal" load to track the trip
      const returnLoad = await storage.createLoad({
        number109: `RTT-${Date.now()}`, // RTT = Return To Terminal
        customerId: null,
        driverId,
        locationId: null,
        pickupLocationId: null,
        estimatedMiles: totalMiles.toString(),
        specialInstructions: "Return to Terminal - Empty/No Load",
        status: "in_transit",
        milesByState: milesByState,
        trackingEnabled: true,
        currentLatitude: currentLat.toString(),
        currentLongitude: currentLng.toString(),
        receiverLatitude: terminalLat.toString(),
        receiverLongitude: terminalLng.toString(),
      });

      res.json({
        success: true,
        loadId: returnLoad.id,
        message: "Return trip started successfully"
      });
    } catch (error: any) {
      console.error("Error starting return trip:", error);
      res.status(500).json({ message: error.message || "Failed to start return trip" });
    }
  });

  // ===== TEXT-TO-SPEECH UTILITY =====
  
  // Generate custom audio from text (for commercials, scripts, etc.)
  // Note: No authentication required - page access is already protected on frontend
  app.post("/api/tts/generate", async (req, res) => {
    try {
      const { text, voice } = req.body;

      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }

      console.log(`🎙️ TTS Generation request: ${text.length} characters, ${voice || 'male'} voice`);

      // Import the ElevenLabs service
      const { generateCustomSpeech } = await import('./services/elevenlabs');
      
      // Generate audio
      const audioBuffer = await generateCustomSpeech(text, voice || 'male');

      console.log(`✅ TTS Generation successful: ${audioBuffer.length} bytes`);

      // Set headers for file download
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', 'attachment; filename="commercial-audio.mp3"');
      res.setHeader('Content-Length', audioBuffer.length.toString());

      // Send the audio file
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("❌ Error generating TTS audio:", error);
      res.status(500).json({ message: error.message || "Failed to generate audio" });
    }
  });

  // ===== LOADRIGHT INTEGRATION ROUTES =====
  
  // Sync loads from LoadRight portal (requires session cookie from manual login)
  app.post("/api/loadright/sync", async (req, res) => {
    try {
      const { sessionCookie } = req.body;
      
      if (!sessionCookie) {
        return res.status(400).json({ 
          success: false,
          message: "Session cookie required. Please log in to LoadRight manually and provide your session cookie." 
        });
      }
      
      console.log("🔄 Starting LoadRight sync...");
      
      const { syncLoadRightTenders } = await import('./services/loadright');
      const result = await syncLoadRightTenders(sessionCookie);
      
      console.log(`✅ LoadRight sync complete: ${result.count} tenders synced`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ Error syncing LoadRight tenders:", error);
      res.status(500).json({ 
        success: false,
        message: error.message || "Failed to sync LoadRight tenders" 
      });
    }
  });

  // Get all LoadRight tenders
  app.get("/api/loadright/tenders", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const tenders = await storage.getLoadRightTenders(status);
      res.json(tenders);
    } catch (error: any) {
      console.error("❌ Error fetching LoadRight tenders:", error);
      res.status(500).json({ message: error.message || "Failed to fetch tenders" });
    }
  });

  // Get single LoadRight tender
  app.get("/api/loadright/tenders/:id", async (req, res) => {
    try {
      const tender = await storage.getLoadRightTender(req.params.id);
      if (!tender) {
        return res.status(404).json({ message: "Tender not found" });
      }
      res.json(tender);
    } catch (error: any) {
      console.error("❌ Error fetching LoadRight tender:", error);
      res.status(500).json({ message: error.message || "Failed to fetch tender" });
    }
  });

  // Accept a LoadRight tender and create a load
  app.post("/api/loadright/accept/:tenderId", async (req, res) => {
    try {
      const { tenderId } = req.params;
      
      console.log(`✅ Accepting LoadRight tender ${tenderId}...`);
      
      // Get the tender
      const tender = await storage.getLoadRightTender(tenderId);
      if (!tender) {
        return res.status(404).json({ message: "Tender not found" });
      }

      if (tender.status === 'accepted') {
        return res.status(400).json({ message: "Tender already accepted" });
      }

      // Find or create customer for the tender
      let customerId: string | undefined;
      const customerName = tender.shipper || 'LoadRight Customer';
      
      // Try to find existing customer by name
      const existingCustomers = await storage.getCustomers();
      const existingCustomer = existingCustomers.find(c => 
        c.name.toLowerCase() === customerName.toLowerCase()
      );
      
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        // Create new customer
        const newCustomer = await storage.createCustomer({
          name: customerName,
        });
        customerId = newCustomer.id;
      }

      // Create a load from the tender data with correct field mapping
      const newLoad = await storage.createLoad({
        number109: tender.loadNumber, // Maps to number109 field
        customerId: customerId,
        status: 'pending', // Available for driver assignment
        pickupAddress: tender.pickupLocation || 'See tender details',
        deliveryAddress: tender.deliveryLocation || 'See tender details',
        companyName: customerName,
        tripRate: tender.rate || undefined, // Keep as string for decimal field
        estimatedMiles: tender.miles || undefined, // Keep as string for decimal field
        deliveryDueAt: tender.deliveryDate ? new Date(tender.deliveryDate) : undefined,
      });

      // Mark tender as accepted and link to the load
      const acceptedTender = await storage.acceptLoadRightTender(tenderId, newLoad.id);

      console.log(`✅ Tender accepted and load ${newLoad.number109} created`);

      res.json({
        success: true,
        tender: acceptedTender,
        load: newLoad
      });
    } catch (error: any) {
      console.error("❌ Error accepting LoadRight tender:", error);
      res.status(500).json({ message: error.message || "Failed to accept tender" });
    }
  });

  // Reject a LoadRight tender
  app.post("/api/loadright/reject/:tenderId", async (req, res) => {
    try {
      const { tenderId } = req.params;
      const { reason } = req.body;
      
      // Validate rejection reason is provided
      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }
      
      console.log(`❌ Rejecting LoadRight tender ${tenderId} - Reason: ${reason}`);
      
      // Get the tender
      const tender = await storage.getLoadRightTender(tenderId);
      if (!tender) {
        return res.status(404).json({ message: "Tender not found" });
      }

      if (tender.status === 'rejected') {
        return res.status(400).json({ message: "Tender already rejected" });
      }

      // Mark tender as rejected with the provided reason
      const rejectedTender = await storage.rejectLoadRightTender(tenderId, reason.trim());

      // TODO: Send rejection to LoadRight API when they provide their API details
      // This is where we'll call LoadRight's API to notify them of the rejection
      // Example: await loadRightAPI.rejectTender(tender.externalTenderId || tender.loadNumber, reason);

      console.log(`✅ Tender rejected: ${tender.loadNumber}`);

      res.json({
        success: true,
        tender: rejectedTender
      });
    } catch (error: any) {
      console.error("❌ Error rejecting LoadRight tender:", error);
      res.status(500).json({ message: error.message || "Failed to reject tender" });
    }
  });

  // WEBHOOK: Receive tendered loads from LoadRight
  // This endpoint is called BY LoadRight when they tender a load to us
  app.post("/api/loadright/webhook/receive-tender", async (req, res) => {
    try {
      // Authentication: API Key (Header-based) - REQUIRED
      const apiKey = req.headers['x-loadright-api-key'] as string;
      const expectedApiKey = process.env.LOADRIGHT_API_KEY;
      
      // CRITICAL: API key must be configured - fail in production if missing
      if (!expectedApiKey) {
        const isDevelopment = process.env.NODE_ENV === 'development';
        if (!isDevelopment) {
          // Production: Reject all requests if API key not configured
          console.error('🚨 CRITICAL: LOADRIGHT_API_KEY not configured - rejecting webhook request');
          return res.status(503).json({ 
            success: false,
            message: "Service temporarily unavailable - authentication not configured" 
          });
        } else {
          // Development: Allow but warn loudly
          console.warn('⚠️ WARNING: LOADRIGHT_API_KEY not configured - webhook is unprotected in development mode');
        }
      }
      
      // Enforce authentication if API key is provided
      if (expectedApiKey && apiKey !== expectedApiKey) {
        console.log('❌ Unauthorized webhook attempt - invalid API key');
        return res.status(401).json({ 
          success: false,
          message: "Unauthorized - Invalid API key" 
        });
      }
      
      const tenderData = req.body;
      
      console.log(`📥 Received tender webhook from LoadRight:`, tenderData);

      // Validate required fields
      if (!tenderData.loadNumber) {
        return res.status(400).json({ 
          success: false,
          message: "loadNumber is required" 
        });
      }

      // Check if tender already exists
      const existingTender = await storage.getLoadRightTenderByLoadNumber(tenderData.loadNumber);
      if (existingTender) {
        console.log(`⚠️ Tender ${tenderData.loadNumber} already exists, updating...`);
        
        // Update existing tender
        const updatedTender = await storage.updateLoadRightTender(existingTender.id, {
          ...tenderData,
          syncedAt: new Date(),
        });
        
        return res.json({
          success: true,
          message: "Tender updated",
          tender: updatedTender
        });
      }

      // Create new tender from webhook data
      const newTender = await storage.createLoadRightTender({
        loadNumber: tenderData.loadNumber,
        externalTenderId: tenderData.externalTenderId || tenderData.tenderId,
        shipper: tenderData.shipper,
        pickupLocation: tenderData.pickupLocation,
        pickupCity: tenderData.pickupCity,
        pickupState: tenderData.pickupState,
        pickupDate: tenderData.pickupDate,
        pickupTime: tenderData.pickupTime,
        deliveryLocation: tenderData.deliveryLocation,
        deliveryCity: tenderData.deliveryCity,
        deliveryState: tenderData.deliveryState,
        deliveryDate: tenderData.deliveryDate,
        deliveryTime: tenderData.deliveryTime,
        orderNumber: tenderData.orderNumber,
        pieces: tenderData.pieces,
        miles: tenderData.miles,
        weight: tenderData.weight,
        rate: tenderData.rate,
        notes: tenderData.notes,
        status: 'tendered',
      });

      console.log(`✅ Tender created: ${newTender.loadNumber}`);

      res.json({
        success: true,
        message: "Tender received",
        tender: newTender
      });
    } catch (error: any) {
      console.error("❌ Error receiving LoadRight tender webhook:", error);
      res.status(500).json({ 
        success: false,
        message: error.message || "Failed to receive tender" 
      });
    }
  });

  // Delete a LoadRight tender
  app.delete("/api/loadright/tenders/:id", async (req, res) => {
    try {
      await storage.deleteTender(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("❌ Error deleting LoadRight tender:", error);
      res.status(500).json({ message: error.message || "Failed to delete tender" });
    }
  });

  // AI Load Advisor - Get driver recommendation for a load
  app.post("/api/ai/load-advisor", async (req, res) => {
    try {
      // Check if AI is available
      const isAvailable = await aiLoadAdvisor.isAvailable();
      if (!isAvailable) {
        return res.status(503).json({ 
          message: "AI Load Advisor is not available. Please contact support." 
        });
      }

      const loadDetails = req.body;
      console.log("🤖 AI Load Advisor request:", loadDetails);

      const recommendation = await aiLoadAdvisor.getDriverRecommendation(loadDetails);
      
      console.log("✅ AI Load Advisor recommendation:", recommendation);
      res.json(recommendation);
    } catch (error: any) {
      console.error("❌ AI Load Advisor error:", error);
      res.status(500).json({ 
        message: error.message || "Failed to get AI recommendation" 
      });
    }
  });

  // Clear load-related data - Testing tool (admin only)
  app.post("/api/system/clear-all-data", (req, res, next) => {
    const hasAuth = !!(req.session as any)?.adminAuth || !!req.user || isBypassActive(req);
    if (hasAuth) {
      next();
    } else {
      res.status(401).json({ message: "Admin authentication required" });
    }
  }, async (req, res) => {
    try {
      const { confirmationText } = req.body;
      
      if (confirmationText !== "DELETE LOAD DATA") {
        return res.status(400).json({ message: "Invalid confirmation text" });
      }

      console.log("🗑️🗑️🗑️ CLEARING LOAD DATA - TESTING MODE 🗑️🗑️🗑️");

      // Delete load-related data only (KEEP: customers, locations, users/drivers, trucks, rates)
      const results = {
        notificationLogs: 0,
        loadStatusHistory: 0,
        fuelReceipts: 0,
        loadStops: 0,
        trackingPings: 0,
        chatMessages: 0,
        invoices: 0,
        loads: 0,
        loadRightTenders: 0,
        bolNumbers: 0,
        markerHistory: 0,
      };

      // Use raw SQL to delete load-related data (in dependency order)
      await db.execute(sql`DELETE FROM notification_log`);
      results.notificationLogs = 1;
      
      await db.execute(sql`DELETE FROM load_status_history`);
      results.loadStatusHistory = 1;
      
      await db.execute(sql`DELETE FROM fuel_receipts`);
      results.fuelReceipts = 1;
      
      await db.execute(sql`DELETE FROM load_stops`);
      results.loadStops = 1;
      
      await db.execute(sql`DELETE FROM tracking_pings`);
      results.trackingPings = 1;
      
      await db.execute(sql`DELETE FROM chat_messages`);
      results.chatMessages = 1;
      
      await db.execute(sql`DELETE FROM invoices`);
      results.invoices = 1;
      
      await db.execute(sql`DELETE FROM loads`);
      results.loads = 1;
      
      await db.execute(sql`DELETE FROM loadright_tenders`);
      results.loadRightTenders = 1;
      
      await db.execute(sql`DELETE FROM bol_numbers`);
      results.bolNumbers = 1;
      
      await db.execute(sql`DELETE FROM marker_history`);
      results.markerHistory = 1;

      console.log("✅ LOAD DATA CLEARED SUCCESSFULLY");
      console.log("Results:", results);
      console.log("✅ Kept: customers, locations, drivers, trucks, rates");

      res.json({
        success: true,
        message: "Load data has been permanently deleted. Master data (customers, locations, drivers, trucks, rates) preserved.",
        results
      });
    } catch (error: any) {
      console.error("❌ Error clearing load data:", error);
      res.status(500).json({ message: error.message || "Failed to clear load data" });
    }
  });

  // WAZE Traffic Alerts API - Real-time traffic, accidents, hazards via RapidAPI
  app.get("/api/waze/alerts", async (req, res) => {
    try {
      const { latitude, longitude, radius = 10 } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: "Latitude and longitude required" });
      }

      const apiKey = process.env.RAPIDAPI_WAZE_KEY;
      if (!apiKey) {
        console.log("⚠️ RAPIDAPI_WAZE_KEY not configured");
        return res.json({ 
          alerts: [], 
          message: "WAZE API key not configured. Sign up at rapidapi.com/waze" 
        });
      }

      console.log(`🚨 Fetching WAZE traffic alerts (${latitude}, ${longitude}, ${radius}km radius)`);
      
      const url = `https://waze-api.p.rapidapi.com/alerts?lat=${latitude}&lng=${longitude}&radius=${radius}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'waze-api.p.rapidapi.com'
        }
      });

      if (!response.ok) {
        throw new Error(`WAZE API error: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Fetched ${data.alerts?.length || 0} WAZE traffic alerts`);
      res.json(data);
    } catch (error: any) {
      console.error("❌ WAZE alerts error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch WAZE alerts" });
    }
  });

  // Create and return HTTP server
  const server = createServer(app);
  return server;
}
