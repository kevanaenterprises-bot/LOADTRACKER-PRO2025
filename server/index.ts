import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Process-level error handlers to catch any unhandled errors that might cause silent failures
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION - Server will exit:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED PROMISE REJECTION - Server will exit:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});

// Add explicit logging at the very start to confirm file execution
console.log('📁 SERVER FILE EXECUTING: server/index.ts loaded successfully');
console.log('🔧 Process ID:', process.pid);
console.log('🔧 Node.js version:', process.version);
console.log('🔧 Platform:', process.platform);

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

(async () => {
  console.log('🚀 Starting LoadTracker Pro server...');
  console.log('📊 STARTUP TRACE: Entering main server initialization function');
  
  try {
    console.log('📊 STARTUP TRACE: Beginning try block for server startup');
    // Comprehensive environment variable validation for deployment
    console.log('🔧 Validating environment configuration...');
    
    // Port validation
    const portEnv = process.env.PORT;
    const port = parseInt(portEnv || '5000', 10);
    
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid PORT value: ${portEnv}. PORT must be a valid number between 1 and 65535.`);
    }
    
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
    
    // Test database connection
    console.log('🔧 Testing database connection...');
    try {
      // Import storage to test database connection
      const { storage } = await import('./storage');
      await storage.getLoads(); // Simple query to test connection
      console.log('✅ Database connection successful');
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError);
      throw new Error(`Database connection failed: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`);
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

    // Static serving restored - testing storage fixes
    console.log('📁 Setting up static file serving...');
    serveStatic(app);
    console.log('✅ Static file serving configured');

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
    console.error('💥 Server startup failed:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : error);
    process.exit(1);
  }
})();
