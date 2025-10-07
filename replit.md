# LoadTracker Pro

## Overview
LoadTracker Pro is a comprehensive logistics management system designed for transportation companies. It handles load dispatch, driver coordination, and automated invoicing. The application offers separate interfaces for office staff and drivers, featuring real-time status tracking, document management, and automated invoicing capabilities. The system aims to streamline logistics operations and improve efficiency.

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

### Feature Specifications
- **Load Management**: Create, track, and update loads with real-time status, driver assignment, and support for multiple pickup/delivery stops.
- **Driver Portal**: Mobile-optimized interface for drivers to update load status, upload documents (BOL, POD), and utilize GPS tracking.
- **Automated Invoicing**: Generation of invoices based on completed loads, with detailed line item breakdowns.
- **Document Management**: BOL validation, POD collection, and secure storage in Google Cloud Storage.
- **OCR Wright Con Scanner**: Tool to upload rate confirmation images, extract key data (load numbers, PO numbers, appointment times, addresses), and allow for editing before load creation.
- **Automatic GPS Tracking**: Drivers can opt-in for automatic location tracking, which updates load statuses based on geographical proximity to pickup/delivery points.
- **Universal Load Numbers**: System flexibly handles any load number format as the primary identifier.

## External Dependencies

### Cloud Services
- **Neon Database**: PostgreSQL hosting.
- **Google Cloud Storage**: Object storage for documents.
- **Replit Authentication**: OAuth 2.0/OIDC identity provider.
- **Telnyx**: SMS API for driver communications.
- **Resend**: Transactional email API for invoice delivery (cloud-friendly, no SMTP port blocking).
- **Anthropic Claude 4.0 Sonnet**: OCR service for rate confirmation scanning.

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