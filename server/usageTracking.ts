import { db } from "./db";
import { apiUsageLogs } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import { eq, and, gte, lte } from "drizzle-orm";

// API service cost structure (in cents)
const API_COSTS = {
  here_maps: {
    routing: 75, // $0.75 per 1,000 transactions
    weather: 500, // $5.00 per 1,000 transactions
    geocoding: 75, // $0.75 per 1,000 transactions
    matrix: 500, // $5.00 per 1,000 transactions
  },
  document_ai: {
    scan: 10, // $0.10 per document (1-10 pages)
  },
  sms: {
    message: 0.4, // $0.004 per message
  },
  email: {
    send: 0.09, // $0.90 per 1,000 emails = $0.0009 each
  },
  elevenlabs: {
    character: 0.003, // Approximately $0.003 per character (varies by model)
  },
  storage: {
    gb_month: 2, // $0.02 per GB per month
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

  // Calculate cost based on service
  let costCents = 0;
  
  // Parse API service and endpoint to determine cost
  if (apiService === "here_maps") {
    if (apiEndpoint?.includes("routing")) {
      costCents = Math.round((API_COSTS.here_maps.routing / 1000) * quantity * 100) / 100;
    } else if (apiEndpoint?.includes("weather")) {
      costCents = Math.round((API_COSTS.here_maps.weather / 1000) * quantity * 100) / 100;
    } else if (apiEndpoint?.includes("geocode")) {
      costCents = Math.round((API_COSTS.here_maps.geocoding / 1000) * quantity * 100) / 100;
    } else if (apiEndpoint?.includes("matrix")) {
      costCents = Math.round((API_COSTS.here_maps.matrix / 1000) * quantity * 100) / 100;
    }
  } else if (apiService === "document_ai") {
    costCents = API_COSTS.document_ai.scan * quantity;
  } else if (apiService === "sms") {
    costCents = API_COSTS.sms.message * quantity;
  } else if (apiService === "email") {
    costCents = Math.round((API_COSTS.email.send / 1000) * quantity * 100) / 100;
  } else if (apiService === "elevenlabs") {
    costCents = Math.round(API_COSTS.elevenlabs.character * quantity * 100) / 100;
  } else if (apiService === "storage") {
    costCents = Math.round(API_COSTS.storage.gb_month * quantity * 100) / 100;
  }

  try {
    await db.insert(apiUsageLogs).values({
      userId,
      subscriptionId: subscriptionId || null,
      apiService,
      apiEndpoint: apiEndpoint || null,
      quantity: quantity.toString(),
      costCents: Math.round(costCents),
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
    const service = log.apiService as keyof typeof usage;
    
    if (service in usage && service !== "totalCostCents") {
      usage[service] += quantity;
    }
    usage.totalCostCents += log.costCents || 0;
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

  // Calculate overage costs
  let overageCostCents = 0;

  // HERE Maps overage (at $0.75 per 1k for routing)
  overageCostCents += Math.round((overages.here_maps * 0.75 / 1000) * 100);
  
  // Document AI overage ($0.10 per doc)
  overageCostCents += overages.document_ai * 10;
  
  // SMS overage ($0.004 per message)
  overageCostCents += Math.round(overages.sms * 0.4);
  
  // Email overage ($0.90 per 1k)
  overageCostCents += Math.round((overages.email * 0.90 / 1000) * 100);
  
  // ElevenLabs overage (approx $0.003 per character)
  overageCostCents += Math.round(overages.elevenlabs * 0.3) / 100;

  return {
    overages,
    overageCostCents,
    overageCostDollars: (overageCostCents / 100).toFixed(2),
  };
}
