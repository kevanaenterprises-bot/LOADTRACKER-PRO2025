# LoadTracker Pro

## Overview
LoadTracker Pro is a comprehensive logistics management system designed for transportation companies. It handles load dispatch, driver coordination, and automated invoicing. The application offers separate interfaces for office staff and drivers, featuring real-time status tracking, document management, and automated invoicing capabilities. The system aims to streamline logistics operations and improve efficiency.

## Recent Changes
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
- **OCR**: Integration with Anthropic Claude 4.0 Sonnet for scanning and extracting data from rate confirmation images, including an editable interface for correction.
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
- **OCR Wright Con Scanner**: Tool to upload rate confirmation images, extract key data (load numbers, PO numbers, appointment times, addresses), and allow for editing before load creation.
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

## External Dependencies

### Cloud Services
- **Neon Database**: PostgreSQL hosting.
- **Google Cloud Storage**: Object storage for documents.
- **Replit Authentication**: OAuth 2.0/OIDC identity provider.
- **Telnyx**: SMS API for driver communications.
- **Resend**: Transactional email API for invoice delivery (cloud-friendly, no SMTP port blocking).
- **Anthropic Claude 4.0 Sonnet**: OCR service for rate confirmation scanning.
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