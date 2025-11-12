# LoadTracker Pro

## Overview
LoadTracker Pro is a comprehensive logistics management system designed to optimize operations for transportation companies. It streamlines load dispatch, driver coordination, automates invoicing, and features real-time status tracking, robust document management, and distinct user interfaces for office staff and drivers. A unique feature includes GPS-triggered audio tours for drivers leveraging a vast database of historical markers. The system aims to significantly enhance operational efficiency, offer competitive pricing, and integrate AI for improved decision-making and quality assurance.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React with TypeScript, `shadcn/ui` (built on Radix UI), and Tailwind CSS for a responsive, mobile-first design. Wouter is used for client-side routing with role-based access. The driver portal features a two-column layout for desktop and stacks vertically on mobile.

### Technical Implementations
- **Frontend**: React 18, TypeScript, TanStack Query, React Hook Form with Zod.
- **Backend**: Express.js with TypeScript, modular routing, centralized error handling.
- **Authentication**: Replit Auth (OpenID Connect), PostgreSQL-based session management, Passport.js, two-tier role-based access (admin, driver, Replit, bypass token).
- **Database**: PostgreSQL with Drizzle ORM, hosted on Neon Database. Drizzle Kit for migrations.
- **File Storage**: Google Cloud Storage for documents, with ACLs and Uppy for uploads.
- **OCR**: Google Cloud Document AI for scanning and data extraction from PDFs.
- **GPS Tracking**: Automatic GPS tracking for real-time location and status updates.
- **Load Management**: Comprehensive lifecycle tracking, multiple stops, flexible load numbers, automated status updates.
- **Communication**: Telnyx for SMS, Resend for email delivery.
- **Interactive Mapping**: HERE Maps JavaScript SDK v3.1 for real-time fleet tracking with WAZE traffic alerts.
- **Traffic Alerts**: RapidAPI WAZE integration for real-time accident, hazard, and police alerts.
- **IFTA Reporting**: Odometer-based mileage tracking with state-by-state breakdown using HERE Maps API v8.
- **Road Tour System**: GPS-triggered audio tours with hybrid voice (Revoicer, ElevenLabs) and GCS caching.
- **AI Integration**: OpenAI integration via Replit AI Integrations for AI-powered features.
- **AI Testing Assistant**: Automated QA system running daily at midnight (ET) with AI-powered failure analysis using GPT-4o-mini and email alerts.

### Feature Specifications
- **Load Management**: Create, track, and update loads with real-time status, driver assignment, and auto-calculated mileage.
- **Driver Portal**: Mobile-optimized interface for status updates, document uploads, GPS tracking, fuel receipt tracking, IFTA mileage tracking.
- **Automated Invoicing**: Generation of invoices based on completed loads with detailed breakdowns.
- **Document Management**: BOL validation, POD collection, secure storage with OCR for rate confirmations.
- **Real-Time Fleet Map**: Interactive HERE Maps dashboard showing active loads, truck markers, routes, and WAZE traffic alerts.
- **Driver Records**: Enhanced management with direct deposit, employment dates, license/medical expiration tracking.
- **Truck Service Management**: Tracking with odometer readings, service history, and maintenance alerts.
- **IFTA Reporting Dashboard**: Summary metrics, state-by-state mileage breakdown, and individual load details.
- **Historical Marker Road Tour**: GPS-triggered audio narration, voice selection, caching, proximity detection.
- **Driver Pay Management**: Flexible pay structures with automatic calculation.
- **Aging Report**: Accounts receivable analysis by time periods, with customer-level breakdown.
- **Usage-Based Billing**: Tiered subscription pricing with metered billing and real-time usage dashboard.
- **Demo/Trial System**: Instant trial access with automatic data cleanup, visitor tracking, and conversion analytics.
- **Branding Hierarchy**: Clear separation between software vendor and customer branding.
- **LoadRight Integration**: Automated load tendering workflow with Puppeteer-based portal scraping, manual sync, and one-click acceptance.
- **AI Load Advisor**: Intelligent driver recommendation system using OpenAI GPT-4o-mini, analyzing load and driver data for optimal suggestions, with confidence scoring, estimated profit, and detailed reasoning.
- **AI Testing Assistant**: Proactive quality assurance testing entire application daily, covering critical workflows, GPS, IFTA, maps, document management, invoicing, and driver portal. Provides AI-generated insights for failures and email alerts.

## External Dependencies

### Cloud Services
- **Neon Database**: PostgreSQL hosting.
- **Google Cloud Storage**: Object storage.
- **Replit Authentication**: OAuth 2.0/OIDC.
- **Telnyx**: SMS API.
- **Resend**: Transactional email API.
- **Google Cloud Document AI**: OCR service.
- **HERE Maps API v8**: Truck routing and mileage breakdown.
- **HERE Maps JavaScript SDK v3.1**: Interactive mapping.
- **RapidAPI WAZE API**: Real-time traffic alerts.
- **ElevenLabs**: On-demand Text-to-Speech generation.
- **OpenAI**: GPT-4o-mini (via Replit AI Integrations).