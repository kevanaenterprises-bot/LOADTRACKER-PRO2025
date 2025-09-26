import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
// Removed broken Vite import - using simple static serving instead
import path from "path";
import fs from "fs";

// Simple log function to replace broken Vite logger
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// DEPLOYMENT DEBUG: Immediate file execution confirmation
console.log('🚨 DEPLOYMENT DEBUG: server/index.ts file loaded and executing - Railway Auth Fix Deploy');
console.log('🚨 DEPLOYMENT DEBUG: Current timestamp:', new Date().toISOString());
console.log('🚨 DEPLOYMENT DEBUG: Process environment:', {
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  hasDatabase: !!process.env.DATABASE_URL
});

// Enhanced process-level error handlers with more detailed logging
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION - CRITICAL ERROR - Server will exit:', error);
  console.error('💥 Error name:', error.name);
  console.error('💥 Error message:', error.message);
  console.error('💥 Stack trace:', error.stack);
  console.error('💥 Process will exit with code 1');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED PROMISE REJECTION - CRITICAL ERROR - Server will exit:', reason);
  console.error('💥 Promise that was rejected:', promise);
  console.error('💥 Reason type:', typeof reason);
  console.error('💥 Process will exit with code 1');
  process.exit(1);
});

// Additional process event handlers for deployment debugging
process.on('exit', (code) => {
  console.log('🚨 PROCESS EXITING with code:', code);
});

process.on('SIGTERM', () => {
  console.log('🚨 SIGTERM received - graceful shutdown');
});

process.on('SIGINT', () => {
  console.log('🚨 SIGINT received - graceful shutdown');
});

// Explicit file execution confirmation with enhanced details
console.log('📁 SERVER FILE EXECUTING: server/index.ts loaded successfully');
console.log('🔧 Process ID:', process.pid);
console.log('🔧 Node.js version:', process.version);
console.log('🔧 Platform:', process.platform);
console.log('🔧 Architecture:', process.arch);
console.log('🔧 Memory usage:', JSON.stringify(process.memoryUsage(), null, 2));

const app = express();

// Add CORS headers for sessions
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control,Pragma');
  
  if (req.method === 'OPTIONS') {
    res.status(200).send();
    return;
  }
  
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// API status endpoint for deployment verification (moved from root to avoid frontend conflicts)
app.get('/api/status', (_req, res) => {
  res.status(200).json({ 
    status: 'LoadTracker Pro is running', 
    timestamp: new Date().toISOString(),
    version: '2.1'
  });
});

// Health check endpoint for deployment readiness
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness check endpoint (Cloud Run specific)
app.get('/api/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
});

// Main server initialization function with enhanced error handling
async function startServer() {
  console.log('🚨 DEPLOYMENT DEBUG: Starting server initialization function');
  console.log('🚨 DEPLOYMENT DEBUG: Function entry timestamp:', new Date().toISOString());
  
  try {
    console.log('🚀 Starting LoadTracker Pro server...');
    console.log('📊 STARTUP TRACE: Entering main server initialization function');
    console.log('📊 STARTUP TRACE: Beginning try block for server startup');
    console.log('🚨 DEPLOYMENT DEBUG: Inside try block - server startup beginning');
    // Comprehensive environment variable validation for deployment
    console.log('🔧 Validating environment configuration...');
    
    // Enhanced PORT validation for Cloud Run deployment
    console.log('🚨 DEPLOYMENT DEBUG: Validating PORT environment variable');
    const portEnv = process.env.PORT;
    console.log('🚨 DEPLOYMENT DEBUG: Raw PORT value:', portEnv);
    console.log('🚨 DEPLOYMENT DEBUG: PORT type:', typeof portEnv);
    
    // Cloud Run sets PORT automatically, fallback to 5000 for local development
    const port = parseInt(portEnv || '5000', 10);
    console.log('🚨 DEPLOYMENT DEBUG: Parsed PORT value:', port);
    
    if (isNaN(port) || port < 1 || port > 65535) {
      const errorMsg = `Invalid PORT value: ${portEnv}. PORT must be a valid number between 1 and 65535.`;
      console.error('❌ DEPLOYMENT DEBUG: PORT validation failed:', errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('✅ DEPLOYMENT DEBUG: PORT validation successful:', port);
    
    // Database validation
    if (!process.env.DATABASE_URL) {
      throw new Error('Missing DATABASE_URL environment variable. Database connection is required for the application to function.');
    }
    console.log('✅ Database URL configured');
    
    // Object storage validation (warn if missing, don't fail)
    const hasPrivateObjectDir = !!process.env.PRIVATE_OBJECT_DIR;
    const hasPublicSearchPaths = !!process.env.PUBLIC_OBJECT_SEARCH_PATHS;
    
    if (!hasPrivateObjectDir || !hasPublicSearchPaths) {
      console.warn('⚠️  Object storage not fully configured:');
      if (!hasPrivateObjectDir) {
        console.warn('   - PRIVATE_OBJECT_DIR is not set. File uploads will be disabled.');
      }
      if (!hasPublicSearchPaths) {
        console.warn('   - PUBLIC_OBJECT_SEARCH_PATHS is not set. Public file serving will be disabled.');
      }
      console.warn('   Object storage features will be unavailable but the server will continue to start.');
    } else {
      console.log('✅ Object storage environment variables configured');
    }
    
    // Optional service validation (Twilio, etc.)
    const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
    if (!hasTwilio) {
      console.warn('⚠️  SMS service (Twilio) not configured. Driver notifications will be disabled.');
    } else {
      console.log('✅ SMS service (Twilio) configured');
    }
    
    // Authentication validation
    const hasSessionSecret = !!process.env.SESSION_SECRET;
    if (!hasSessionSecret) {
      console.warn('⚠️  SESSION_SECRET not set. Using default secret (not recommended for production).');
    } else {
      console.log('✅ Session authentication configured');
    }
    
    console.log(`🔧 Configuration validated: PORT=${port}, HOST=0.0.0.0`);
    console.log(`🔧 Environment: NODE_ENV=${process.env.NODE_ENV || 'development'}`);
    
    // Test database connection (non-blocking)
    console.log('🔧 Testing database connection...');
    try {
      // Import storage to test database connection
      const { storage } = await import('./storage');
      await storage.getLoads(); // Simple query to test connection
      console.log('✅ Database connection successful');
    } catch (dbError) {
      console.error('⚠️ Database connection failed during startup (non-fatal):', dbError);
      console.log('🔧 Server will continue starting - database will be retried on first request');
    }
    
    // Register routes with enhanced error handling
    console.log('📝 Registering application routes...');
    const server = await registerRoutes(app);
    console.log('✅ Routes registered successfully');

    // Global error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Log the error but don't throw it to prevent crashes
      console.error('❌ Express error handler:', err);
      res.status(status).json({ message });
    });

    // Add API 404 guard before static serving to prevent API calls from falling through to SPA
    app.use('/api', (_req, res) => {
      console.log(`❌ API 404: Unmatched API route ${_req.method} ${_req.path}`);
      res.status(404).json({ error: 'API route not found' });
    });

    // Simple static serving without broken Vite dependency
    console.log('📁 Setting up static file serving...');
    const distPath = path.resolve(import.meta.dirname, "public");
    
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      // Serve index.html for SPA routes
      app.use("*", (_req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
      });
      console.log('✅ Static file serving configured (production mode)');
    } else {
      console.log('⚠️  No build directory found - using development mode');
      // In development, just serve a simple response for non-API routes
      app.use("*", (_req, res) => {
        res.send('LoadTracker Pro - Development Mode');
      });
    }

    // Start the server with enhanced logging
    console.log(`🌐 Starting HTTP server on 0.0.0.0:${port}...`);
    
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      console.log(`🎉 LoadTracker Pro is running successfully on port ${port}`);
      console.log(`📍 Health check endpoints available:`);
      console.log(`   - GET /api/status (basic status)`);
      console.log(`   - GET /api/health (health check)`);
      console.log(`   - GET /api/ready (readiness check)`);
      log(`serving on port ${port}`);
    });

    // Handle server startup errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use. Please check if another process is running on this port.`);
      } else if (error.code === 'EACCES') {
        console.error(`❌ Permission denied to bind to port ${port}. Try running with elevated privileges or use a port > 1024.`);
      } else {
        console.error(`❌ Server error:`, error);
      }
      process.exit(1);
    });
    
  } catch (error) {
    console.error('💥 DEPLOYMENT DEBUG: Server startup failed in try-catch block');
    console.error('💥 Server startup failed:', error);
    console.error('💥 Error type:', typeof error);
    console.error('💥 Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('💥 Error message:', error instanceof Error ? error.message : String(error));
    console.error('💥 Stack trace:', error instanceof Error ? error.stack : error);
    console.error('💥 Process will exit with code 1');
    process.exit(1);
  }
}

// Execute the server startup with additional error handling wrapper
console.log('🚨 DEPLOYMENT DEBUG: About to call startServer function');
console.log('🚨 DEPLOYMENT DEBUG: Pre-execution timestamp:', new Date().toISOString());

startServer().catch((error) => {
  console.error('💥 DEPLOYMENT DEBUG: startServer function threw an error');
  console.error('💥 FATAL ERROR in server startup:', error);
  console.error('💥 Error details:', {
    name: error instanceof Error ? error.name : 'Unknown',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : 'No stack trace'
  });
  console.error('💥 Process will exit with code 1');
  process.exit(1);
});
