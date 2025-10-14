import { db } from "./db";
import { apiUsageLogs } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import { eq, and, gte, lte } from "drizzle-orm";

// API service cost structure (ALL values in cents)
const API_COSTS = {
  here_maps: {
    routing: 75, // 75 cents per 1,000 transactions = 0.075 cents each
    weather: 500, // 500 cents per 1,000 transactions = 0.5 cents each
    geocoding: 75, // 75 cents per 1,000 transactions = 0.075 cents each
    matrix: 500, // 500 cents per 1,000 transactions = 0.5 cents each
  },
  document_ai: {
    scan: 10, // 10 cents per document (1-10 pages)
  },
  sms: {
    message: 0.4, // 0.4 cents per message ($0.004)
  },
  email: {
    send: 90, // 90 cents per 1,000 emails = 0.09 cents each
  },
  elevenlabs: {
    character: 0.3, // 0.3 cents per character ($0.003)
  },
  storage: {
    gb_month: 2, // 2 cents per GB per month ($0.02)
  },
};

// Usage tracking function
export async function logApiUsage(params: {
  userId: string;
  subscriptionId?: string | null;
  apiService: string;
  apiEndpoint?: string;
  quantity?: number;
  metadata?: Record<string, any>;
}) {
  const { userId, subscriptionId, apiService, apiEndpoint, quantity = 1, metadata } = params;

  // Calculate cost based on service (keep everything in cents, no premature rounding)
  let costCents = 0;
  
  // Parse API service and endpoint to determine cost
  if (apiService === "here_maps") {
    if (apiEndpoint?.includes("routing")) {
      costCents = (API_COSTS.here_maps.routing / 1000) * quantity; // Already in cents
    } else if (apiEndpoint?.includes("weather")) {
      costCents = (API_COSTS.here_maps.weather / 1000) * quantity;
    } else if (apiEndpoint?.includes("geocode")) {
      costCents = (API_COSTS.here_maps.geocoding / 1000) * quantity;
    } else if (apiEndpoint?.includes("matrix")) {
      costCents = (API_COSTS.here_maps.matrix / 1000) * quantity;
    }
  } else if (apiService === "document_ai") {
    costCents = API_COSTS.document_ai.scan * quantity; // Already in cents
  } else if (apiService === "sms") {
    costCents = API_COSTS.sms.message * quantity; // Already in cents (0.4)
  } else if (apiService === "email") {
    costCents = (API_COSTS.email.send / 1000) * quantity; // Already in cents
  } else if (apiService === "elevenlabs") {
    costCents = API_COSTS.elevenlabs.character * quantity; // Already in cents (0.003)
  } else if (apiService === "storage") {
    costCents = API_COSTS.storage.gb_month * quantity; // Already in cents
  }

  try {
    await db.insert(apiUsageLogs).values({
      userId,
      subscriptionId: subscriptionId || null,
      apiService,
      apiEndpoint: apiEndpoint || null,
      quantity: quantity.toString(),
      costCents: costCents.toString(), // Store precise fractional cents (e.g., 0.0075)
      requestMetadata: metadata || null,
    });
  } catch (error) {
    // Log error but don't fail the request
    console.error("Failed to log API usage:", error);
  }
}

// Middleware to track HERE Maps API usage
export function trackHereMapUsage(endpoint: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    const userId = user?.id;
    
    if (userId) {
      // Track usage asynchronously (don't block the request)
      logApiUsage({
        userId,
        apiService: "here_maps",
        apiEndpoint: endpoint,
        metadata: {
          url: req.originalUrl,
          method: req.method,
        },
      }).catch(err => console.error("Usage tracking error:", err));
    }
    
    next();
  };
}

// Middleware to track Document AI usage
export function trackDocumentAIUsage() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    const userId = user?.id;
    
    if (userId) {
      logApiUsage({
        userId,
        apiService: "document_ai",
        apiEndpoint: "ocr_extract",
        metadata: {
          fileType: req.body?.fileType || "unknown",
        },
      }).catch(err => console.error("Usage tracking error:", err));
    }
    
    next();
  };
}

// Helper function to get current usage for a user in the current billing period
export async function getCurrentUsage(userId: string, periodStart: Date, periodEnd: Date) {
  const usageLogs = await db
    .select()
    .from(apiUsageLogs)
    .where(
      and(
        eq(apiUsageLogs.userId, userId),
        gte(apiUsageLogs.createdAt, periodStart),
        lte(apiUsageLogs.createdAt, periodEnd)
      )
    );

  // Aggregate usage by service
  const usage = {
    here_maps: 0,
    document_ai: 0,
    sms: 0,
    email: 0,
    elevenlabs: 0,
    storage: 0,
    totalCostCents: 0,
  };

  for (const log of usageLogs) {
    const quantity = parseFloat(log.quantity || "0");
    const costCents = parseFloat(log.costCents?.toString() || "0");
    const service = log.apiService as keyof typeof usage;
    
    if (service in usage && service !== "totalCostCents") {
      usage[service] += quantity;
    }
    usage.totalCostCents += costCents;
  }

  return usage;
}

// Helper function to check if user has exceeded tier limits
export async function checkTierLimits(userId: string, tier: any, usage: any) {
  const overages = {
    here_maps: Math.max(0, usage.here_maps - (tier.includedHereMapsTransactions || 0)),
    document_ai: Math.max(0, usage.document_ai - (tier.includedDocumentAiScans || 0)),
    sms: Math.max(0, usage.sms - (tier.includedSmsMessages || 0)),
    email: Math.max(0, usage.email - (tier.includedEmails || 0)),
    elevenlabs: Math.max(0, usage.elevenlabs - (tier.includedElevenlabsCharacters || 0)),
  };

  // Calculate overage costs (all in cents) - reuse API_COSTS for consistency
  let overageCostCents = 0;

  // HERE Maps overage (75 cents per 1k transactions)
  overageCostCents += (overages.here_maps * API_COSTS.here_maps.routing / 1000);
  
  // Document AI overage (10 cents per doc)
  overageCostCents += overages.document_ai * API_COSTS.document_ai.scan;
  
  // SMS overage (0.4 cents per message)
  overageCostCents += overages.sms * API_COSTS.sms.message;
  
  // Email overage (90 cents per 1k emails)
  overageCostCents += (overages.email * API_COSTS.email.send / 1000);
  
  // ElevenLabs overage (0.3 cents per character)
  overageCostCents += overages.elevenlabs * API_COSTS.elevenlabs.character;

  return {
    overages,
    overageCostCents,
    overageCostDollars: (overageCostCents / 100).toFixed(2),
  };
}
