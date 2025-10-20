# LoadTracker Pro

## Overview
LoadTracker Pro is a comprehensive logistics management system designed to optimize operations for transportation companies. It streamlines load dispatch, driver coordination, and automates invoicing. Key capabilities include real-time status tracking, robust document management, and distinct user interfaces for office staff and drivers. The system also features advanced GPS-triggered audio tours for drivers, leveraging a database of over 222,969 historical markers. The project aims to significantly enhance operational efficiency, offering competitive pricing compared to existing market solutions.

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
- **Interactive Mapping**: HERE Maps JavaScript SDK v3.1 for real-time fleet tracking, weather overlays, and fuel station finding.
- **IFTA Reporting**: Advanced odometer-based mileage tracking with state-by-state breakdown using HERE Maps API v8.
- **Road Tour System**: GPS-triggered audio tours with a hybrid voice system (Revoicer and ElevenLabs on-demand TTS) and Google Cloud Storage caching.

### Feature Specifications
- **Load Management**: Create, track, and update loads with real-time status, driver assignment, and auto-calculated mileage.
- **Driver Portal**: Mobile-optimized interface for status updates, document uploads, and GPS tracking, including fuel receipt tracking and optional customer dropdown for load creation. Drivers can also track IFTA miles when returning to the terminal without a load, with route calculation and state-by-state IFTA mileage breakdown.
- **Automated Invoicing**: Generation of invoices based on completed loads with detailed breakdowns.
- **Document Management**: BOL validation, POD collection (supporting multiple documents per load), and secure storage with OCR for rate confirmation processing.
- **Real-Time Fleet Map**: Interactive HERE Maps dashboard showing active loads, truck markers, routes, weather, and fuel stations.
- **Driver Records**: Enhanced management with direct deposit banking fields, employment dates, and license/medical expiration tracking.
- **Truck Service Management**: Comprehensive tracking with odometer readings, service history, and maintenance alerts.
- **IFTA Reporting Dashboard**: Dedicated page displaying summary metrics, state-by-state mileage breakdown, and individual load details.
- **Historical Marker Road Tour**: GPS-triggered audio narration of historical markers, with voice selection, caching, and proximity detection.
- **Driver Pay Management**: Flexible pay structures (percentage-based or per-mile rates) with automatic calculation during invoice generation.
- **Aging Report**: Accounts receivable aging analysis categorizing unpaid invoices by time periods (0-30, 31-60, 61-90, 90+ days), with customer-level breakdown and color-coded severity indicators.
- **Usage-Based Billing**: Tiered subscription pricing with metered billing for API usage overages. Includes a real-time usage dashboard displaying current consumption vs. tier limits, overage costs, and billing projections.
- **Demo/Trial System**: Instant trial access for prospects with automatic data cleanup, visitor tracking, and conversion analytics.
- **Branding Hierarchy**: Clear separation between software vendor (Turtle Logistics) and customer (Go 4 Farms & Cattle) branding across demo pages, internal systems, invoices, and emails.

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