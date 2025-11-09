# LoadTracker Pro

## Overview
LoadTracker Pro is a comprehensive logistics management system designed to optimize operations for transportation companies. It streamlines load dispatch, driver coordination, and automates invoicing. Key capabilities include real-time status tracking, robust document management, and distinct user interfaces for office staff and drivers. The system also features advanced GPS-triggered audio tours for drivers, leveraging a database of over 222,969 historical markers. The project aims to significantly enhance operational efficiency, offering competitive pricing compared to existing market solutions.

## Recent Changes (November 2025)

### Critical Bug Fixes

#### November 9, 2025 - WAZE Traffic Alerts Integration & Cost Reduction
1. **WAZE Traffic Alerts Integration** - Replaced expensive fuel pricing and weather APIs with WAZE real-time traffic alerts via RapidAPI. Displays accidents, hazards, and police alerts on the fleet map with color-coded markers (🚗 red for accidents, ⚠️ orange for hazards, 🚔 blue for police). Toggle button shows/hides alerts with detailed popup info. Alert panel displays top 5 alerts with descriptions. Fetches alerts in 50km radius around active loads. Requires RAPIDAPI_WAZE_KEY environment variable (free tier available, then paid plans based on usage).

2. **Removed Expensive Features** - Eliminated Barchart OnDemand fuel pricing (~$150/month) and HERE Weather API calls to significantly reduce operational costs while maintaining essential fleet tracking functionality.

3. **Truck Service History Query Fix** - Fixed the truck service history display by replacing broken 3-element array query with explicit queryFn and segmented cache keys `["/api/trucks", truckId, "service-records"]`. Cache invalidation now properly matches the segmented key structure for reliable updates.

4. **Rates Management Query Fix** - Added explicit queryFn to rates query in RateManagement component to ensure reliable API calls when fetching, editing, and deleting rate records.

5. **Delete Office Staff Fix (Enhanced)** - Fixed foreign key constraint error when deleting users with demo sessions. The system now cascade-deletes demo_sessions and visitor_tracking records in a transaction before removing the user. This resolves issues where duplicate accounts couldn't be deleted due to hidden dependencies in the demo/trial system. Transaction ensures data integrity while cleaning up temporary sandbox data automatically.

6. **OCR Scanner Production Diagnostics** - Enhanced error logging for Google Document AI OCR failures on Railway. Added detailed environment variable validation (project ID, processor ID, credentials) with specific error messages for missing configuration. Removed credential preview from logs for security. This helps diagnose production OCR failures that don't appear in development.

#### Previous Fixes
3. **Invoice Workflow Fix** - Loads now automatically move from "awaiting_invoicing" to "awaiting_payment" when invoices are finalized, regardless of email delivery success. This ensures the workflow always progresses even if email fails. The status update logic was moved into `storage.finalizeInvoice()` to be the single source of truth.

4. **AI Testing Enhancements** - Expanded test coverage to catch the above bugs:
   - Added deterministic invoice workflow test (create → finalize → verify status update to awaiting_payment)
   - Added user deletion dependency test (creates test driver + load, verifies deletion fails)
   - Added HERE Maps integration tests (validates API key handling and error responses)
   - All tests now create their own test data to ensure reliable, repeatable results

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React with TypeScript, `shadcn/ui` (built on Radix UI), and Tailwind CSS for a responsive, mobile-first design. Wouter is used for client-side routing with role-based access. The driver portal features a two-column layout for desktop and stacks vertically on mobile for better usability.

### Technical Implementations
- **Frontend**: React 18, TypeScript, TanStack Query for server state, React Hook Form with Zod for forms.
- **Backend**: Express.js with TypeScript, modular routing, and centralized error handling.
- **Authentication**: Replit Auth (OpenID Connect), PostgreSQL-based session management, Passport.js, and a two-tier role-based access system ("office" and "driver") supporting admin, driver, Replit, and bypass token authentication.
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations, hosted on Neon Database. Drizzle Kit handles schema migrations.
- **File Storage**: Google Cloud Storage for documents, with ACLs and Uppy for uploads.
- **OCR**: Google Cloud Document AI for scanning and data extraction from rate confirmation PDFs and images.
- **GPS Tracking**: Automatic GPS tracking for real-time location updates and status changes.
- **Load Management**: Comprehensive lifecycle tracking, including multiple stops, flexible load number formats, and automated status updates.
- **Communication**: Telnyx for SMS notifications, Resend for email delivery.
- **Interactive Mapping**: HERE Maps JavaScript SDK v3.1 for real-time fleet tracking with WAZE traffic alerts integration.
- **Traffic Alerts**: RapidAPI WAZE integration for real-time accident, hazard, and police alerts displayed on fleet map.
- **IFTA Reporting**: Advanced odometer-based mileage tracking with state-by-state breakdown using HERE Maps API v8.
- **Road Tour System**: GPS-triggered audio tours with a hybrid voice system (Revoicer and ElevenLabs on-demand TTS) and Google Cloud Storage caching.
- **AI Integration**: OpenAI integration via Replit AI Integrations for AI-powered features (billed to Replit credits, no API key management required).
- **AI Testing Assistant**: Automated quality assurance system running comprehensive tests every 12 hours. Tests critical workflows (load creation → payment), GPS tracking, IFTA calculations, maps, document management, and driver portal functionality. Features AI-powered failure analysis using GPT-4o-mini, email alerts for test failures, manual test triggering via admin dashboard, and detailed test history tracking.

### Feature Specifications
- **Load Management**: Create, track, and update loads with real-time status, driver assignment, and auto-calculated mileage.
- **Driver Portal**: Mobile-optimized interface for status updates, document uploads, and GPS tracking, including fuel receipt tracking and optional customer dropdown for load creation. Drivers can also track IFTA miles when returning to the terminal without a load, with route calculation and state-by-state IFTA mileage breakdown.
- **Automated Invoicing**: Generation of invoices based on completed loads with detailed breakdowns.
- **Document Management**: BOL validation, POD collection (supporting multiple documents per load), and secure storage with OCR for rate confirmation processing.
- **Real-Time Fleet Map**: Interactive HERE Maps dashboard showing active loads, truck markers, routes, and WAZE traffic alerts (accidents, hazards, police).
- **Driver Records**: Enhanced management with direct deposit banking fields, employment dates, and license/medical expiration tracking.
- **Truck Service Management**: Comprehensive tracking with odometer readings, service history, and maintenance alerts.
- **IFTA Reporting Dashboard**: Dedicated page displaying summary metrics, state-by-state mileage breakdown, and individual load details.
- **Historical Marker Road Tour**: GPS-triggered audio narration of historical markers, with voice selection, caching, and proximity detection.
- **Driver Pay Management**: Flexible pay structures (percentage-based or per-mile rates) with automatic calculation during invoice generation.
- **Aging Report**: Accounts receivable aging analysis categorizing unpaid invoices by time periods (0-30, 31-60, 61-90, 90+ days), with customer-level breakdown and color-coded severity indicators.
- **Usage-Based Billing**: Tiered subscription pricing with metered billing for API usage overages. Includes a real-time usage dashboard displaying current consumption vs. tier limits, overage costs, and billing projections.
- **Demo/Trial System**: Instant trial access for prospects with automatic data cleanup, visitor tracking, and conversion analytics.
- **Branding Hierarchy**: Clear separation between software vendor (Turtle Logistics) and customer (Go 4 Farms & Cattle) branding across demo pages, internal systems, invoices, and emails.
- **LoadRight Integration**: Automated load tendering workflow with Puppeteer-based portal scraping. Features include manual sync button to fetch tendered loads, one-click acceptance creating loads in the system (no driver assignment required at acceptance), and complete tender tracking with status management.
- **AI Load Advisor**: Intelligent driver recommendation system that analyzes load details (pickup/delivery locations, estimated miles) and driver data (location, recent performance, pay structure) to suggest the optimal driver for each load. Uses OpenAI GPT-4o-mini for analysis. Features confidence scoring (high/medium/low), estimated profit calculations, detailed reasoning, and key decision factors. Accessible via purple "Get AI Driver Suggestion" button in LoadForm after adding stops.
- **AI Testing Assistant**: Proactive quality assurance system that automatically tests the entire application every 12 hours. Comprehensive test coverage includes complete load workflow (create → assign → deliver → invoice → payment), GPS tracking validation, IFTA mileage calculations, maps integration, document management (GCS + OCR), invoicing accuracy, and driver portal functionality. When tests fail, GPT-4o-mini analyzes the failures and provides actionable recommendations. Email alerts notify admins of issues before customers discover them. Admin dashboard provides real-time test status, pass/fail metrics, AI-generated insights, manual test triggering, and complete test history. Accessible at /admin-test-dashboard.

## External Dependencies

### Cloud Services
- **Neon Database**: PostgreSQL hosting.
- **Google Cloud Storage**: Object storage for documents.
- **Replit Authentication**: OAuth 2.0/OIDC identity provider.
- **Telnyx**: SMS API.
- **Resend**: Transactional email API.
- **Google Cloud Document AI**: OCR service.
- **HERE Maps API v8**: Truck routing and mileage breakdown.
- **HERE Maps JavaScript SDK v3.1**: Interactive mapping.
- **RapidAPI WAZE API**: Real-time traffic alerts (accidents, hazards, police) displayed on fleet map.
- **ElevenLabs**: On-demand Text-to-Speech generation.
- **OpenAI**: GPT-4o-mini for AI-powered driver recommendations (via Replit AI Integrations).