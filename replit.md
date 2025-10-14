# LoadTracker Pro

## Overview
LoadTracker Pro is a comprehensive logistics management system for transportation companies, streamlining load dispatch, driver coordination, and automated invoicing. It features real-time status tracking, document management, and separate interfaces for office staff and drivers, aiming to significantly improve operational efficiency. The system includes advanced capabilities like GPS-triggered audio tours for drivers, powered by a database of over 222,969 historical markers.

## Recent Changes
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