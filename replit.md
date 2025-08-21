# LoadTracker Pro

## Overview

LoadTracker Pro is a comprehensive logistics management system designed for transportation companies to handle load dispatch, driver coordination, and automated invoicing. The application provides separate interfaces for office staff to manage loads and drivers to update their progress, with real-time status tracking and document management capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

**August 21, 2025 - Implemented OCR Wright Con Scanner with Edit Capability**
- ✅ Added Anthropic Claude 4.0 Sonnet OCR service for reading rate confirmation images
- ✅ Created Wright Con Scanner tab in Dashboard for image upload and processing
- ✅ Auto-extracts: load numbers, PO numbers, appointment times, company names, pickup/delivery addresses
- ✅ **Edit functionality** - Users can review and correct extracted data before creating loads
- ✅ Toggle between read-only view and editable form for data verification
- ✅ Automatically generates loads from corrected Wright Con data with confidence scoring
- ✅ Updated database schema with OCR fields: poNumber, appointmentTime, pickupAddress, deliveryAddress, companyName
- ✅ Added multer file upload support for image processing (10MB limit, image files only)
- ✅ **Company Branding** - Integrated Go Farms & Cattle logo in dashboard header and invoices
- ✅ Updated company address to Melissa, Texas in all branding elements

**August 21, 2025 - Implemented Automatic GPS Tracking System**
- ✅ **GPS Confirmation Button** - Drivers can confirm load receipt with one click to start automatic tracking
- ✅ **Real-time Location Updates** - Browser GPS automatically tracks driver position every 30 seconds
- ✅ **Automatic Status Updates** - No manual updates needed: "at shipper", "left shipper", "at receiver" based on GPS proximity
- ✅ **Enhanced Database Schema** - Added GPS coordinates, tracking status, and confirmation timestamp fields
- ✅ **Distance-based Detection** - Uses 150-meter radius to detect arrivals/departures from pickup/delivery locations
- ✅ **Mobile-Optimized Interface** - GPS tracker component shows status, location accuracy, and automatic updates
- ✅ **Background Processing** - Continuous location monitoring with automatic server-side status calculations

**August 21, 2025 - Fixed Driver Assignment Authentication Error**
- ✅ **Resolved "HTTP not token" error** - Changed `isAuthenticated` to `isAdminAuthenticated` for admin operations
- ✅ **Added dedicated driver assignment endpoint** - `/api/loads/:id/assign-driver` with proper admin auth
- ✅ **Enhanced storage interface** - Added `updateLoad` method for partial load updates
- ✅ **SMS notifications on assignment** - Drivers receive text messages when loads are assigned
- ✅ **Comprehensive testing** - Successfully assigned driver (John Smith) to load TEST002
- ✅ **Consistent authentication** - All admin operations now use proper admin middleware

**August 21, 2025 - Fixed "HTTP not token" Authentication Error**
- ✅ Resolved authentication middleware to accept multiple auth methods (Admin, Replit, Driver)
- ✅ Updated manual invoice generation to work with any valid session
- ✅ Successfully tested invoice generation: INV-1755756388476 for $1350.00
- ✅ Created comprehensive test pages at `/quick-invoice` and `/admin-invoice`
- ✅ All authentication methods now work: Admin (admin/admin123), Driver (john_doe/1234567890), Replit Auth

## System Architecture

### Frontend Architecture
- **React with TypeScript**: Modern single-page application using React 18 with full TypeScript support
- **shadcn/ui Components**: Comprehensive UI component library built on Radix UI primitives with Tailwind CSS styling
- **Client-Side Routing**: Uses Wouter for lightweight routing with role-based access control
- **State Management**: TanStack Query for server state management with optimistic updates and caching
- **Form Handling**: React Hook Form with Zod validation for type-safe form validation
- **Responsive Design**: Mobile-first approach with Tailwind CSS, optimized for both desktop office use and mobile driver portal

### Backend Architecture
- **Express.js Server**: RESTful API server with TypeScript support
- **Modular Route Structure**: Organized API endpoints with middleware for authentication and logging
- **Error Handling**: Centralized error handling with structured error responses
- **Development Tools**: Hot reload with Vite integration for development mode

### Authentication System
- **Replit Auth Integration**: Uses OpenID Connect (OIDC) with Replit's authentication service
- **Session Management**: PostgreSQL-based session storage with configurable TTL
- **Role-Based Access**: Two-tier system with "office" and "driver" roles for different user experiences
- **Passport.js**: Authentication middleware with automatic user profile management

### Database Design
- **PostgreSQL with Drizzle ORM**: Type-safe database operations with schema-first approach
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Schema Management**: Centralized schema definitions shared between client and server
- **Migration System**: Drizzle Kit for database schema migrations

### File Storage System
- **Google Cloud Storage**: Object storage for documents like POD (Proof of Delivery) files
- **Access Control Lists (ACL)**: Granular permission system for file access based on user groups
- **Upload Integration**: Uppy file uploader with progress tracking and validation
- **Replit Integration**: Uses Replit's sidecar for GCS credentials management

### Core Business Logic
- **Load Management**: Complete lifecycle tracking from creation to delivery with status updates
- **Driver Assignment**: Automatic load assignment with mobile-optimized driver interface
- **Document Workflow**: BOL (Bill of Lading) validation and POD document collection
- **Real-time Updates**: Status tracking with timestamp logging and SMS notifications
- **Invoice Generation**: Automated invoicing based on completed loads and rates

### Communication Services
- **SMS Integration**: Twilio service for driver notifications and status updates
- **Email Notifications**: Planned integration for office staff notifications
- **Real-time Sync**: Query invalidation and refetching for live data updates

## External Dependencies

### Cloud Services
- **Neon Database**: PostgreSQL hosting with serverless scaling
- **Google Cloud Storage**: Document and file storage with enterprise-grade security
- **Replit Authentication**: OAuth 2.0/OIDC identity provider
- **Twilio SMS API**: Text messaging service for driver communications

### Development Tools
- **Vite**: Frontend build tool with hot module replacement
- **esbuild**: Fast JavaScript bundler for production builds
- **TypeScript**: Type checking and development tooling
- **Tailwind CSS**: Utility-first CSS framework with custom design system

### UI and UX Libraries
- **Radix UI**: Headless component primitives for accessibility
- **Lucide Icons**: Consistent icon system
- **Uppy**: File upload handling with progress and validation
- **Wouter**: Lightweight client-side routing

### Validation and Forms
- **Zod**: Runtime type validation and schema definition
- **React Hook Form**: Performant form handling with minimal re-renders
- **TanStack Query**: Server state management with caching and synchronization