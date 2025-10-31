# LoadTracker Pro - LoadRight Integration API Documentation

## Overview

LoadTracker Pro provides a two-way API integration for automated load tendering with LoadRight. This document outlines our API endpoints that LoadRight can use to send tendered loads to us, and the requirements for us to send acceptance/rejection responses back to LoadRight.

**Integration Type**: Webhook-based bidirectional API  
**Data Format**: JSON  
**Authentication**: To be configured based on LoadRight's preferred method

---

## 1. Webhook Endpoint: Receive Tendered Loads

**LoadRight calls this endpoint** to push tendered loads to LoadTracker Pro.

### Endpoint Details

```
POST https://web-production-153e.up.railway.app/api/loadright/webhook/receive-tender
```

### Authentication

**Status**: Pending LoadRight configuration

We support the following authentication methods:
- API Key (Header-based)
- HMAC Signature Verification
- Bearer Token
- IP Whitelisting

**Please provide** your preferred authentication method and we'll configure it immediately.

### Request Body

```json
{
  "loadNumber": "109-40340",
  "externalTenderId": "TENDER_12345",
  "shipper": "PCA PLANO",
  "pickupLocation": "123 Main St, Dallas, TX",
  "pickupCity": "Dallas",
  "pickupState": "TX",
  "pickupDate": "2025-11-15",
  "pickupTime": "08:00",
  "deliveryLocation": "456 Oak Ave, Houston, TX",
  "deliveryCity": "Houston",
  "deliveryState": "TX",
  "deliveryDate": "2025-11-16",
  "deliveryTime": "14:00",
  "orderNumber": "ORD-789",
  "pieces": "24",
  "miles": "250",
  "weight": "45000",
  "rate": "850.00",
  "notes": "Refrigerated load - maintain 34°F"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `loadNumber` | string | **Yes** | Unique load identifier |
| `externalTenderId` | string | No | LoadRight's internal tender ID |
| `shipper` | string | No | Shipper company name |
| `pickupLocation` | string | No | Full pickup address |
| `pickupCity` | string | No | Pickup city |
| `pickupState` | string | No | Pickup state code |
| `pickupDate` | string | No | Pickup date (YYYY-MM-DD) |
| `pickupTime` | string | No | Pickup time (HH:MM) |
| `deliveryLocation` | string | No | Full delivery address |
| `deliveryCity` | string | No | Delivery city |
| `deliveryState` | string | No | Delivery state code |
| `deliveryDate` | string | No | Delivery date (YYYY-MM-DD) |
| `deliveryTime` | string | No | Delivery time (HH:MM) |
| `orderNumber` | string | No | Order/PO number |
| `pieces` | string | No | Number of pieces/pallets |
| `miles` | string | No | Estimated miles |
| `weight` | string | No | Weight in pounds |
| `rate` | string | No | Rate in USD |
| `notes` | string | No | Special instructions |

### Response - Success (200 OK)

```json
{
  "success": true,
  "message": "Tender received",
  "tender": {
    "id": "uuid-12345",
    "loadNumber": "109-40340",
    "status": "tendered",
    "syncedAt": "2025-10-28T22:30:00Z"
  }
}
```

### Response - Update Existing (200 OK)

If a tender with the same `loadNumber` already exists, we update it:

```json
{
  "success": true,
  "message": "Tender updated",
  "tender": {
    "id": "uuid-12345",
    "loadNumber": "109-40340",
    "status": "tendered",
    "syncedAt": "2025-10-28T22:30:00Z"
  }
}
```

### Response - Error (400 Bad Request)

```json
{
  "success": false,
  "message": "loadNumber is required"
}
```

### Response - Error (500 Internal Server Error)

```json
{
  "success": false,
  "message": "Failed to receive tender"
}
```

---

## 2. Sending Responses Back to LoadRight

**LoadTracker Pro needs to call LoadRight's API** to send acceptance/rejection responses.

### Requirements from LoadRight

To complete the bidirectional integration, we need the following information from LoadRight:

#### API Endpoint Information

1. **Accept Tender Endpoint**
   - URL: `https://api.loadright.com/...` (please provide)
   - HTTP Method: POST/PUT/PATCH (please specify)
   - Example request body format

2. **Reject Tender Endpoint**
   - URL: `https://api.loadright.com/...` (please provide)
   - HTTP Method: POST/PUT/PATCH (please specify)
   - Example request body format

#### Authentication Details

Please provide:
- Authentication method (API Key, OAuth 2.0, Bearer Token, etc.)
- API credentials or how to obtain them
- Required headers

#### Request/Response Format

Please provide example API calls for:
- Accepting a tender
- Rejecting a tender
- Any required parameters (tender ID, load number, reason codes, etc.)

### Our Implementation Plan

Once you provide the above details, we will:

1. Add LoadRight API client to our backend
2. Call your accept/reject endpoints when our users take action
3. Handle API errors and retry logic
4. Provide status updates to our users

---

## 3. Integration Workflow

### Current Flow

```
1. LoadRight → LoadTracker Pro
   ├─ LoadRight tenders a load
   ├─ Sends POST to /api/loadright/webhook/receive-tender
   └─ LoadTracker Pro stores tender in database

2. LoadTracker Pro User Action
   ├─ User reviews tender in LoadTracker Pro UI
   ├─ User clicks "Accept" or "Reject"
   └─ Tender status updated in our database

3. LoadTracker Pro → LoadRight (PENDING API DETAILS)
   ├─ We call LoadRight's accept/reject API
   ├─ Send tender decision with load number/tender ID
   └─ LoadRight updates their system
```

### Complete Integration (After LoadRight Provides API Details)

Once we receive LoadRight's API documentation, the flow will be fully automated:
- ✅ LoadRight sends tenders → We receive them automatically
- ✅ User accepts/rejects → We notify LoadRight immediately via their API
- ✅ Both systems stay in sync in real-time

---

## 4. Testing

### Test Webhook Endpoint

You can test our webhook endpoint using this curl command:

```bash
curl -X POST https://web-production-153e.up.railway.app/api/loadright/webhook/receive-tender \
  -H "Content-Type: application/json" \
  -d '{
    "loadNumber": "TEST-12345",
    "shipper": "Test Shipper",
    "pickupLocation": "Test Pickup Address",
    "pickupCity": "Dallas",
    "pickupState": "TX",
    "pickupDate": "2025-11-15",
    "deliveryLocation": "Test Delivery Address",
    "deliveryCity": "Houston",
    "deliveryState": "TX",
    "deliveryDate": "2025-11-16",
    "rate": "500.00",
    "miles": "250"
  }'
```

Expected Response:
```json
{
  "success": true,
  "message": "Tender received",
  "tender": {
    "id": "...",
    "loadNumber": "TEST-12345",
    "status": "tendered",
    "syncedAt": "2025-10-28T..."
  }
}
```

### Staging Environment

We can provide a staging environment for testing if needed. Please let us know if you'd like to test the integration before going live.

---

## 5. Next Steps

To complete this integration, we need from LoadRight:

### ☐ Webhook Configuration
- [ ] Preferred authentication method (API Key, HMAC, Bearer Token, etc.)
- [ ] IP addresses for whitelisting (if applicable)
- [ ] Webhook signing secret (if using HMAC)

### ☐ LoadRight API Access
- [ ] API base URL
- [ ] Accept tender endpoint details
- [ ] Reject tender endpoint details
- [ ] API authentication credentials
- [ ] API documentation or example requests

### ☐ Testing
- [ ] Test tender data for validation
- [ ] Staging environment access (if available)
- [ ] Go-live date

---

## 6. Support & Contact

**Technical Contact**: [Your Name/Email]  
**Company**: Turtle Logistics / LoadTracker Pro  
**Integration Status**: Ready to deploy pending LoadRight API details

We're excited to partner with LoadRight and provide seamless load tendering for our mutual customers. Please provide the requested API details and we'll have the full integration live within 24-48 hours.

---

## Appendix: LoadTracker Pro Current Capabilities

Our system is **production-ready** with:
- ✅ Webhook endpoint live and tested
- ✅ Database schema for tender tracking
- ✅ UI for reviewing and accepting/rejecting tenders
- ✅ Load creation from accepted tenders
- ✅ Status tracking (tendered → accepted/rejected)
- ✅ Audit trail with timestamps
- ⏳ LoadRight API integration (waiting for API details)

**Next**: Once you provide API details, we'll add the bidirectional communication layer to complete the integration.
