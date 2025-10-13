# LoadTracker Pro

## Overview
LoadTracker Pro is a comprehensive logistics management system designed for transportation companies. It handles load dispatch, driver coordination, and automated invoicing. The application offers separate interfaces for office staff and drivers, featuring real-time status tracking, document management, and automated invoicing capabilities. The system aims to streamline logistics operations and improve efficiency.

## Recent Changes
### October 13, 2025 - Fuel Receipt Tracking System
- **Company Driver Designation**: Added `isCompanyDriver` boolean field to driver management for distinguishing company drivers from owner-operators
- **Fuel Receipt Tracking**: Comprehensive fuel expense tracking system for company drivers:
  - Track gallons purchased and total cost per fuel stop
  - Automatic price-per-gallon calculation in UI
  - Optional location and notes fields for each receipt
  - Tied to specific loads for accurate trip expense tracking
  - Summary statistics showing total gallons, total cost, and average $/gallon per load
  - Driver can add/delete receipts only for their active loads
- **Database Schema**: New `fuelReceipts` table with foreign keys to loads and drivers
- **API Endpoints**: 
  - `GET /api/loads/:loadId/fuel-receipts` - Get all receipts for a load
  - `POST /api/loads/:loadId/fuel-receipts` - Add new fuel receipt
  - `GET /api/drivers/:driverId/fuel-receipts` - Get driver receipts with optional date filters
  - `DELETE /api/fuel-receipts/:id` - Remove fuel receipt
- **Driver Portal Integration**: Fuel tracker automatically shows for company drivers with active loads, hidden for owner-operators
- **Security**: All operations use authenticated API requests with session validation

### October 12, 2025 - Driver Portal UI Redesign
- **Two-Column Layout**: Reorganized Driver Portal for better desktop experience
  - Left Column: Assigned loads display
  - Right Column: POD uploader and Road Tour feature
  - Responsive design: stacks vertically on mobile, side-by-side on desktop (lg breakpoint)
  - Wider viewport: Changed from max-w-lg (512px) to max-w-7xl (80rem) for full-screen desktop view

### October 12, 2025 - ElevenLabs On-Demand TTS with GCS Caching
- **Scalable Voice System**: Integrated ElevenLabs API for on-demand text-to-speech generation to handle 226k+ historical markers
- **Hybrid Voice Strategy**: 
  - 8 premium Revoicer voices (Colman male, Sophie female) for featured demo markers
  - ElevenLabs API on-demand generation for 226k database expansion
  - Voice selection UI with localStorage persistence (male: Adam, female: Rachel)
- **Google Cloud Storage Caching**: Intelligent caching system prevents repeated API calls
  - Cache key format: `tts-audio/marker-{id}-{voice}.mp3`
  - Cache-first strategy with 1-year TTL
  - Cost optimization: Max 452k one-time generations (226k markers × 2 voices), subsequent replays = $0
- **Graceful Degradation**: System works perfectly without GCS credentials
  - `isGCSAvailable()` checks configuration before cache operations
  - Skips caching when unavailable, generates fresh audio every time
  - No errors, no crashes - seamless fallback to direct API generation
- **Notification Chime**: Pleasant two-tone audio alert (E5→A5 notes) plays before each marker narration
  - Web Audio API implementation for browser compatibility
  - ~450ms duration with smooth volume envelope
  - Alerts driver that historical marker narration is about to begin
- **Implementation**:
  - Service: `server/services/elevenlabs.ts` with `generateSpeechWithCache()`
  - Model: Eleven Flash v2.5 (low-latency, real-time)
  - Endpoint: POST /api/road-tour/generate-audio with X-Cache-Status header
  - Response: audio/mpeg with Cache-Control: public, max-age=31536000
- **Cost Efficiency**: ElevenLabs $99/year (100k characters/month) vs $22-330/month alternatives

### October 12, 2025 - Historical Marker Road Tour Feature
- **GPS-Triggered Audio Tours**: Implemented a Road to Hana-style audio tour system for truck drivers featuring GPS-triggered narration of historical markers
- **222,969+ Marker Database Ready**: System designed to support importing from The Historical Marker Database (HMDB.org) with 8 sample markers across the US
- **Proximity Detection**: Haversine formula calculates distances with bounding box optimization for efficient queries
- **Driver-Friendly UI**: Simple toggle in driver portal, shows nearby markers, prevents repeats, displays "heard" status
- **Sample Markers Included**:
  - Route 66 (Flagstaff, AZ)
  - Gettysburg Address Site (PA)
  - Golden Gate Bridge (San Francisco, CA)
  - Oregon Trail (Wyoming)
  - Freedom Trail (Boston, MA)
  - Mount Rushmore (South Dakota)
  - Transcontinental Railroad (Utah)
  - Alamo Mission (San Antonio, TX)
- **Database Schema**: New `historical_markers` and `marker_history` tables track markers and driver listening history
- **API Routes**: Complete CRUD operations for markers, proximity search, toggle control, and history tracking

### October 12, 2025 - Google Cloud Document AI Integration
- **OCR Engine Upgrade**: Migrated from Anthropic Claude to Google Cloud Document AI for superior document processing capabilities
- **PDF Support Added**: Scanner now fully supports PDF files in addition to images (PNG, JPEG, GIF, WebP)
- **Enhanced Extraction**: Google Document AI provides:
  - Native PDF text extraction without conversion
  - Better accuracy on logistics documents
  - Pattern-based field extraction for load numbers, PO numbers, dates, addresses, and company names
  - Confidence scoring based on fields detected
- **Implementation Details**:
  - New service: `server/googleDocumentAI.ts` using `@google-cloud/documentai` SDK
  - Credentials stored securely in environment variables (GOOGLE_CLOUD_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON, GOOGLE_DOCUMENT_AI_PROCESSOR_ID)
  - Updated API route: POST /api/ocr/extract now accepts both PDFs and images
  - Frontend updated to accept PDF uploads with proper validation
  - Production build deployed with updated UI messaging

### October 12, 2025 - Customer Dropdown, Driver Records, and Truck Service Management
- **Customer Selection in Load Creation**: Added optional customer dropdown to load creation form (Step 1b). Loads can now be associated with a specific customer for better tracking and organization. Database schema updated with `customerId` foreign key in loads table.
- **Enhanced Driver Records**: Extended driver management with direct deposit banking fields (bank name, routing number, account number), employment dates (hire/fire), and license/medical expiration tracking. ⚠️ **Security Note**: Banking data currently stored in plain text - encryption recommended for production use.
- **Truck Service Management**: Implemented comprehensive truck service tracking with odometer readings, service history, and automated maintenance alerts (warns when service due within 1000 miles). Current odometer auto-updates when service records are added.
- **Bug Fixes**: Fixed date conversion in driver update endpoint (PATCH /api/drivers/:driverId) to properly handle ISO date strings. Fixed SelectItem empty value error in customer dropdown.

### October 12, 2025 - Database and Deployment Fixes
- **Session Store Database Fix**: Updated session store in `server/replitAuth.ts` to use `LOADTRACKER_DB_URL` with fallback to `DATABASE_URL`, fixing admin login after database migration from Railway to Replit/Neon.
- **Frontend Production Build**: Rebuilt and deployed frontend to include IFTA report route that was missing from previous static build. Production assets now served from `server/public/` with latest code.
- **Database Migration**: System successfully migrated from offline Railway database to Replit/Neon database. Connection string priority: `LOADTRACKER_DB_URL` → `DATABASE_URL`.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React with TypeScript, leveraging `shadcn/ui` components built on Radix UI primitives and styled with Tailwind CSS for a responsive, mobile-first design. Wouter handles client-side routing with role-based access.

### Technical Implementations
- **Frontend**: React 18, TypeScript, TanStack Query for server state management, React Hook Form with Zod for form handling.
- **Backend**: Express.js server with TypeScript, modular route structure, centralized error handling.
- **Authentication**: Replit Auth (OpenID Connect), PostgreSQL-based session management, Passport.js, and a two-tier role-based access system ("office" and "driver"). The system supports admin, driver, Replit, and bypass token authentication.
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations, hosted on Neon Database. Drizzle Kit is used for schema migrations.
- **File Storage**: Google Cloud Storage for documents (e.g., POD files), with ACLs and Uppy for uploads.
- **OCR**: Integration with Google Cloud Document AI for scanning and extracting data from rate confirmation PDFs and images, including an editable interface for correction. Supports PDF, PNG, JPEG, GIF, and WebP formats.
- **GPS Tracking**: Automatic GPS tracking for drivers, providing real-time location updates and status changes ("at shipper," "left shipper," "at receiver") based on proximity.
- **Load Management**: Comprehensive lifecycle tracking, including support for multiple stops per load, flexible load number formats, and automated status updates.
- **Communication**: Telnyx for SMS notifications to drivers, Resend for email delivery (transactional email API - works with Railway/cloud hosting without SMTP port blocking).
- **Interactive Mapping**: HERE Maps JavaScript SDK v3.1 for real-time fleet tracking with weather overlays and fuel station finder. Replaced Leaflet with native HERE Maps integration.
- **Weather Integration**: HERE Weather API providing real-time temperature, sky conditions, and weather descriptions along routes (converted from Celsius to Fahrenheit).
- **Fuel Station Finder**: HERE Places API for locating nearby diesel fuel stations with names and addresses along routes.
- **IFTA Reporting**: Advanced odometer-based mileage tracking with automatic state-by-state breakdown using HERE Maps API v8 for International Fuel Tax Agreement compliance. System captures:
  - **Starting odometer** when driver accepts load and enables GPS tracking
  - **Ending odometer** at POD upload
  - **Route miles by state** from HERE Maps truck routing API
  - **Deadhead miles** (empty/without load): calculated as (ending odometer - starting odometer) - route miles, clamped to zero minimum, assigned to pickup state
  - Separate tracking of loaded vs deadhead miles for accurate IFTA compliance

### Feature Specifications
- **Load Management**: Create, track, and update loads with real-time status, driver assignment, and support for multiple pickup/delivery stops. **Auto-calculates mileage** using HERE Maps API during load creation (geocodes addresses → calculates truck route distance).
- **Driver Portal**: Mobile-optimized interface for drivers to update load status, upload documents (BOL, POD), and utilize GPS tracking.
- **Automated Invoicing**: Generation of invoices based on completed loads, with detailed line item breakdowns and pickup/delivery in/out timestamps.
- **Document Management**: BOL validation, POD collection, and secure storage in Google Cloud Storage.
- **OCR Wright Con Scanner**: Tool to upload rate confirmation PDFs or images, extract key data (load numbers, PO numbers, appointment times, addresses), and allow for editing before load creation. Powered by Google Cloud Document AI.
- **Automatic GPS Tracking**: Drivers can opt-in for automatic location tracking, which updates load statuses based on geographical proximity to pickup/delivery points.
- **Universal Load Numbers**: System flexibly handles any load number format as the primary identifier.
- **Real-Time Fleet Map**: Interactive HERE Maps dashboard showing all active loads with truck markers, destination pins, route polylines, weather overlays, and nearby diesel fuel station locations. Auto-refreshes every 30 seconds. Displays loads with status: in_progress, in_transit, confirmed, en_route_pickup, at_shipper, left_shipper, en_route_receiver, at_receiver, or delivered when tracking is enabled.
- **Driver Route Map**: Individual route visualization for drivers showing current position, destination, and route line with weather conditions.
- **IFTA Reporting Dashboard**: Dedicated reporting page (`/ifta-report`) displaying:
  - Summary metrics: total tracked loads, states traveled, total miles
  - State-by-state mileage breakdown showing route miles, deadhead miles, and totals
  - Individual load details with truck number, delivery date, and mileage breakdowns
  - Separate visualization of loaded vs deadhead miles for compliance reporting
- **Error Handling**: React ErrorBoundary prevents white-page crashes, displaying user-friendly error messages with reload/home options instead of blank screens.
- **Historical Marker Road Tour**: GPS-triggered audio tour system for drivers featuring automatic narration of historical markers as they drive past them. **Hybrid voice system** combining 8 premium Revoicer demo markers with ElevenLabs on-demand generation for 226k+ database expansion. Drivers can toggle on/off, select voice preference (persisted in localStorage), see nearby markers within 500 meters, and system prevents repeating the same marker. Google Cloud Storage caching prevents repeated API costs. Includes tracking of which markers have been heard and supports importing 222,969+ markers from The Historical Marker Database.

## External Dependencies

### Cloud Services
- **Neon Database**: PostgreSQL hosting.
- **Google Cloud Storage**: Object storage for documents.
- **Replit Authentication**: OAuth 2.0/OIDC identity provider.
- **Telnyx**: SMS API for driver communications.
- **Resend**: Transactional email API for invoice delivery (cloud-friendly, no SMTP port blocking).
- **Google Cloud Document AI**: OCR service for rate confirmation scanning with PDF and image support.
- **HERE Weather API**: Real-time weather observations including temperature, sky conditions, and descriptions.
- **HERE Places API**: Fuel station search and location finder.
- **HERE Maps API v8**: Truck routing and state-by-state mileage breakdown for IFTA reporting.
- **HERE Maps JavaScript SDK v3.1**: Interactive mapping, fleet tracking, and route visualization.

### Development Tools
- **Vite**: Frontend build tool.
- **esbuild**: JavaScript bundler.
- **TypeScript**: Language and tooling.
- **Tailwind CSS**: Utility-first CSS framework.

### UI and UX Libraries
- **Radix UI**: Headless component primitives.
- **Lucide Icons**: Icon system.
- **Uppy**: File upload handling.
- **Wouter**: Client-side routing.

### Validation and Forms
- **Zod**: Runtime type validation.
- **React Hook Form**: Form handling.
- **TanStack Query**: Server state management.