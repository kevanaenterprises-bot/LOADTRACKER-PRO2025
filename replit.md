# LoadTracker Pro

## Overview
LoadTracker Pro is a comprehensive logistics management system for transportation companies, streamlining load dispatch, driver coordination, and automated invoicing. It features real-time status tracking, document management, and separate interfaces for office staff and drivers, aiming to significantly improve operational efficiency. The system includes advanced capabilities like GPS-triggered audio tours for drivers, powered by a database of over 222,969 historical markers.

## Recent Changes
### October 17, 2025 - Return to Terminal Feature & Railway Deployment Fix
- **Return to Terminal IFTA Tracking**: Drivers can now track IFTA miles when returning to the terminal without a load
  - Added checkbox in driver portal that appears only when driver has no active loads
  - Terminal address: 1800 Plano Pkwy, Plano, Texas 75079
  - Calculates route from current GPS location to terminal using HERE Maps API v8
  - Displays total miles and state-by-state IFTA mileage breakdown before starting trip
  - Creates special "RTT" (Return To Terminal) load to track the trip with full IFTA compliance
  - Automatically saves milesByState data for each return trip
  - Component: client/src/components/ReturnToTerminal.tsx
  - Backend routes: `/api/return-to-terminal/calculate-route`, `/api/return-to-terminal/start`
- **Railway Deployment Fix**: Fixed Puppeteer/Chromium installation for Railway deployment
  - Removed hard-coded Replit-specific Chromium paths that caused Railway failures
  - Updated `getChromeExecutablePath()` to auto-detect Railway environment
  - Configured nixpacks.toml to use Puppeteer's bundled Chrome instead of apt-get chromium
  - Removed problematic apt package installation that was failing on Railway
  - PDF generation (invoices, documents) now works on both Replit and Railway
- **Files**: server/emailService.ts, nixpacks.toml, railway.json, client/src/components/ReturnToTerminal.tsx, client/src/pages/DriverPortal.tsx, server/routes.ts

### October 14, 2025 - Branding Hierarchy & OCR Enhancement
- **Branding Hierarchy Established**: Proper separation between software vendor and customer branding
  - **Turtle Logistics** = Software company that owns/sells LoadTracker Pro (prominent on demo/marketing pages)
  - **Go 4 Farms & Cattle** = Customer using the tracking system (internal system branding)
  - Demo and landing pages showcase Turtle Logistics as the LoadTracker Pro vendor
  - Headers, invoices, and emails maintain Go 4 Farms & Cattle branding for operations
- **Rate Con Scanner Error Handling**: Improved OCR error feedback for low-quality images
  - Backend detects quality/resolution issues and provides specific guidance
  - Frontend displays actionable suggestions: better lighting, use scanner, ensure focus, higher resolution
  - Quality issues return 400 (bad request) instead of 500 (server error)
  - Error messages formatted with bullet points for clarity
- **Files**: client/src/pages/Landing.tsx, client/src/components/Header.tsx, client/src/components/PrintButton.tsx, server/emailService.ts, server/googleDocumentAI.ts, server/routes.ts, client/src/components/OCRUploader.tsx

### October 14, 2025 - Driver Pay & Aging Report Features
- **Driver Pay Structure**: 
  - Added flexible pay options for drivers (percentage-based or per-mile rates)
  - Database schema: `payType`, `percentageRate`, `mileageRate` fields on users table
  - UI form with conditional validation - requires appropriate rate based on selected pay type
  - Data type conversion ensures backend receives numeric values
- **Automatic Driver Pay Calculation**:
  - Integrated into invoice generation (`ensureAutoInvoice` function)
  - Percentage: `pay = totalRevenue * (percentageRate / 100)`
  - Mileage: `pay = tripMiles * mileageRate`
  - Tracks driverId, payType, payRate, payAmount, and tripMiles on each invoice
- **Aging Report System**:
  - Categorizes unpaid invoices by age (0-30, 31-60, 61-90, 90+ days)
  - Groups by customer with totals for each age bucket
  - Color-coded severity indicators (green → yellow → orange → red)
  - Full-featured page with summary cards, customer breakdown table, and detail views
  - Endpoint: `/api/reports/aging`, Page: `/aging-report`
- **Files**: shared/schema.ts, server/routes.ts, client/src/pages/Dashboard.tsx, client/src/pages/AgingReport.tsx, client/src/App.tsx

### October 14, 2025 - Usage-Based Billing & Trial System
- **Tiered Pricing Model**: Implemented 3-tier subscription system (Starter $149, Professional $249, Enterprise $349+) to compete against $700/month competitors while maintaining profitability
- **Usage Tracking Infrastructure**:
  - Comprehensive middleware logs all API calls (HERE Maps, Document AI, SMS, Email, ElevenLabs) with precise cost tracking
  - Database schema: `api_usage_logs`, `customer_subscriptions`, `pricing_tiers`, `demo_sessions`, `visitor_tracking`
  - All costs normalized to cents with fractional precision (decimal 12,4) to prevent rounding errors
  - API_COSTS constants: HERE Maps 0.075¢/call, Document AI 10¢/doc, SMS 0.4¢/msg, Email 0.09¢/send, ElevenLabs 0.3¢/char
- **Usage Dashboard**: Real-time display showing current usage vs tier limits, overage costs, billing projections with progress bars and metrics
- **Demo/Trial System**: 
  - Landing page for prospects with instant trial access (no credit card required)
  - Automatic data wipeout on logout to prevent abuse
  - Visitor tracking for conversion analytics
- **Billing Accuracy**: All calculations verified by architect - no undercharges, proper overage math using single source of truth (API_COSTS constants)
- **Files**: server/usageTracking.ts, client/src/pages/UsageDashboard.tsx, client/src/pages/DemoLanding.tsx

### October 14, 2025 - HERE Maps Official Implementation
- **Official SDK Pattern**: Migrated HEREMapView component to use HERE's official JavaScript SDK initialization pattern as recommended by HERE Maps support
- **Key Improvements**:
  - Added official mapsjs-ui.css stylesheet for proper UI styling matching HERE's demos
  - Implemented correct MapEvents initialization: `new H.mapevents.Behavior(new H.mapevents.MapEvents(map))`
  - Added pixelRatio support for better display quality: `pixelRatio: window.devicePixelRatio`
  - Upgraded to v8 Routing API: `platform.getRoutingService(null, 8)` for latest features
  - Added resize listener for responsive map behavior
  - Proper flexible polyline decoding: `H.geo.LineString.fromFlexiblePolyline()`
- **Benefits**: Improved routing reliability (fixes Dallas to Pueblo routing issues), better visual appearance matching HERE's official demos, future-proof implementation using latest API versions
- **Component**: client/src/components/HEREMapView.tsx now follows HERE's official React integration pattern

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend utilizes React with TypeScript, `shadcn/ui` (built on Radix UI), and Tailwind CSS for a responsive, mobile-first design. Wouter is used for client-side routing with role-based access. The driver portal features a two-column layout for desktop, reorganizing content for better usability, and stacks vertically on mobile.

### Technical Implementations
- **Frontend**: React 18, TypeScript, TanStack Query for server state, React Hook Form with Zod for forms.
- **Backend**: Express.js with TypeScript, modular routing, centralized error handling.
- **Authentication**: Replit Auth (OpenID Connect), PostgreSQL-based session management, Passport.js, and a two-tier role-based access system ("office" and "driver") supporting admin, driver, Replit, and bypass token authentication.
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations, hosted on Neon Database. Drizzle Kit handles schema migrations.
- **File Storage**: Google Cloud Storage for documents (e.g., POD files), with ACLs and Uppy for uploads.
- **OCR**: Google Cloud Document AI for scanning and data extraction from rate confirmation PDFs and images, offering native PDF text extraction, improved accuracy, and pattern-based field extraction.
- **GPS Tracking**: Automatic GPS tracking for drivers, providing real-time location updates and status changes based on proximity.
- **Load Management**: Comprehensive lifecycle tracking, including multiple stops, flexible load number formats, and automated status updates.
- **Communication**: Telnyx for SMS notifications, Resend for email delivery.
- **Interactive Mapping**: HERE Maps JavaScript SDK v3.1 for real-time fleet tracking, weather overlays, and fuel station finding.
- **Weather Integration**: HERE Weather API for real-time weather conditions along routes.
- **Fuel Station Finder**: HERE Places API for locating nearby diesel fuel stations.
- **IFTA Reporting**: Advanced odometer-based mileage tracking with state-by-state breakdown using HERE Maps API v8 for compliance.
- **Road Tour System**: GPS-triggered audio tours with a hybrid voice system (Revoicer and ElevenLabs on-demand TTS) and Google Cloud Storage caching.

### Feature Specifications
- **Load Management**: Create, track, and update loads with real-time status, driver assignment, and auto-calculated mileage using HERE Maps API.
- **Driver Portal**: Mobile-optimized interface for status updates, document uploads, and GPS tracking. Includes fuel receipt tracking for company drivers, and an optional customer dropdown for load creation.
- **Automated Invoicing**: Generation of invoices based on completed loads with detailed breakdowns.
- **Document Management**: BOL validation, POD collection, and secure storage. OCR Wright Con Scanner for rate confirmation processing.
- **Real-Time Fleet Map**: Interactive HERE Maps dashboard showing active loads, truck markers, routes, weather, and fuel stations.
- **Driver Records**: Enhanced management with direct deposit banking fields, employment dates, and license/medical expiration tracking.
- **Truck Service Management**: Comprehensive tracking with odometer readings, service history, and maintenance alerts.
- **IFTA Reporting Dashboard**: Dedicated page displaying summary metrics, state-by-state mileage breakdown (loaded vs. deadhead), and individual load details.
- **Historical Marker Road Tour**: GPS-triggered audio narration of historical markers, with voice selection, caching, and proximity detection, preventing repeats.
- **Driver Pay Management**: Flexible pay structures supporting both percentage-based (% of revenue) and per-mile rates. Automatic calculation during invoice generation tracks driver earnings with full transparency.
- **Aging Report**: Accounts receivable aging analysis categorizing unpaid invoices by time periods (0-30, 31-60, 61-90, 90+ days). Provides customer-level breakdown with color-coded severity indicators for collections management.
- **Usage-Based Billing**: Tiered subscription pricing (Starter $149, Professional $249, Enterprise $349+) with metered billing for API usage overages. Real-time usage dashboard shows current consumption vs tier limits, overage costs, and billing projections.
- **Demo/Trial System**: Instant trial access for prospects with automatic data cleanup, visitor tracking, and conversion analytics.
- **Return to Terminal**: Drivers can check a box when they have no load to calculate and track their return trip to the terminal (1800 Plano Pkwy, Plano, TX 75079). System calculates route, displays state-by-state IFTA miles, and creates a tracking load for compliance.

## External Dependencies

### Cloud Services
- **Neon Database**: PostgreSQL hosting.
- **Google Cloud Storage**: Object storage for documents.
- **Replit Authentication**: OAuth 2.0/OIDC identity provider.
- **Telnyx**: SMS API.
- **Resend**: Transactional email API.
- **Google Cloud Document AI**: OCR service.
- **HERE Weather API**: Real-time weather observations.
- **HERE Places API**: Fuel station search.
- **HERE Maps API v8**: Truck routing and mileage breakdown.
- **HERE Maps JavaScript SDK v3.1**: Interactive mapping.
- **ElevenLabs**: On-demand Text-to-Speech generation.

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