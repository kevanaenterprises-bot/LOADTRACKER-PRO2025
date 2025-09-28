import { Request, Response } from "express";
import { hereTracking } from "../services/hereTracking";
import { z } from "zod";

// Validation schemas
const LocationUpdateSchema = z.object({
  driverId: z.string(),
  loadId: z.string(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional()
  })
});

const RouteCalculationSchema = z.object({
  pickup: z.object({
    lat: z.number(),
    lng: z.number()
  }),
  delivery: z.object({
    lat: z.number(),
    lng: z.number()
  })
});

const ETACalculationSchema = z.object({
  currentLocation: z.object({
    lat: z.number(),
    lng: z.number()
  }),
  destination: z.object({
    lat: z.number(),
    lng: z.number()
  })
});

/**
 * Start tracking for a load assignment
 */
export async function startLoadTracking(req: Request, res: Response) {
  try {
    const { driverId, loadId } = req.params;
    
    if (!driverId || !loadId) {
      return res.status(400).json({ error: 'Driver ID and Load ID are required' });
    }

    const result = await hereTracking.createDriverTracker(driverId, loadId);
    
    res.json({
      success: true,
      trackingId: result.trackingId,
      message: `Tracking started for driver ${driverId} on load ${loadId}`
    });
  } catch (error) {
    console.error('❌ Start tracking error:', error);
    res.status(500).json({ 
      error: 'Failed to start tracking',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Update driver location and process tracking events
 */
export async function updateDriverLocation(req: Request, res: Response) {
  try {
    const validatedData = LocationUpdateSchema.parse(req.body);
    
    const events = await hereTracking.processLocationUpdate(
      validatedData.driverId,
      validatedData.loadId,
      validatedData.location
    );

    res.json({
      success: true,
      events,
      message: `Location updated for driver ${validatedData.driverId}`
    });
  } catch (error) {
    console.error('❌ Location update error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: error.errors
      });
    }
    res.status(500).json({ 
      error: 'Failed to update location',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Calculate optimized route for a load
 */
export async function calculateRoute(req: Request, res: Response) {
  try {
    const validatedData = RouteCalculationSchema.parse(req.body);
    
    const routeData = await hereTracking.calculateOptimizedRoute(
      validatedData.pickup,
      validatedData.delivery
    );

    res.json({
      success: true,
      route: routeData,
      message: 'Route calculated successfully'
    });
  } catch (error) {
    console.error('❌ Route calculation error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: error.errors
      });
    }
    res.status(500).json({ 
      error: 'Failed to calculate route',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Calculate real-time ETA with traffic data
 */
export async function calculateETA(req: Request, res: Response) {
  try {
    const validatedData = ETACalculationSchema.parse(req.body);
    
    const etaData = await hereTracking.calculateETA(
      validatedData.currentLocation,
      validatedData.destination
    );

    res.json({
      success: true,
      eta: etaData,
      message: 'ETA calculated successfully'
    });
  } catch (error) {
    console.error('❌ ETA calculation error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: error.errors
      });
    }
    res.status(500).json({ 
      error: 'Failed to calculate ETA',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get tracking status for a specific load
 */
export async function getLoadTrackingStatus(req: Request, res: Response) {
  try {
    const { loadId } = req.params;
    
    if (!loadId) {
      return res.status(400).json({ error: 'Load ID is required' });
    }

    // This would typically fetch from a tracking events database table
    // For now, we'll return a basic response
    res.json({
      success: true,
      loadId,
      trackingActive: true,
      lastUpdate: new Date().toISOString(),
      message: `Tracking status for load ${loadId}`
    });
  } catch (error) {
    console.error('❌ Get tracking status error:', error);
    res.status(500).json({ 
      error: 'Failed to get tracking status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}