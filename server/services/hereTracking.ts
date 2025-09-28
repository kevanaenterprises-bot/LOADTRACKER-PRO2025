import { db } from "../db";
import { loads } from "@shared/schema";
import { eq } from "drizzle-orm";

// HERE API Configuration
const HERE_API_BASE = "https://router.hereapi.com/v8";
const HERE_GEOCODE_BASE = "https://geocoder.ls.hereapi.com/6.2";
const HERE_GEOFENCE_BASE = "https://geofencing.hereapi.com/v8";

interface Location {
  lat: number;
  lng: number;
  address?: string;
}

interface Driver {
  id: string;
  name: string;
  phone: string;
  currentLocation?: Location;
  isActive: boolean;
}

interface TrackingEvent {
  driverId: string;
  loadId: string;
  eventType: 'pickup_arrived' | 'pickup_departed' | 'delivery_arrived' | 'delivery_departed' | 'en_route';
  location: Location;
  timestamp: Date;
}

interface Geofence {
  id: string;
  name: string;
  center: Location;
  radiusMeters: number;
  type: 'pickup' | 'delivery';
}

export class HERETrackingService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.HERE_MAPS_API_KEY || process.env.HERE_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️ HERE API key not found. Tracking features will be disabled.');
    }
  }

  /**
   * Create a virtual tracking device for a driver
   */
  async createDriverTracker(driverId: string, loadId: string): Promise<{ trackingId: string }> {
    try {
      // In the modern HERE API, we manage tracking through our own service
      // rather than their deprecated device management
      const trackingId = `driver_${driverId}_load_${loadId}_${Date.now()}`;
      
      console.log(`🚛 Created tracking session: ${trackingId}`);
      return { trackingId };
    } catch (error) {
      console.error('❌ Failed to create driver tracker:', error);
      throw error;
    }
  }

  /**
   * Get optimized route from pickup to delivery using HERE Tour Planning
   */
  async calculateOptimizedRoute(pickup: Location, delivery: Location): Promise<{
    route: any;
    distance: number;
    duration: number;
    instructions: string[];
  }> {
    try {
      const url = `${HERE_API_BASE}/routes`;
      const params = new URLSearchParams({
        apikey: this.apiKey,
        transportMode: 'truck',
        origin: `${pickup.lat},${pickup.lng}`,
        destination: `${delivery.lat},${delivery.lng}`,
        return: 'summary,polyline,instructions,turnByTurnActions',
        lang: 'en-US'
      });

      const response = await fetch(`${url}?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HERE Routing API error: ${data.error?.message || 'Unknown error'}`);
      }

      const route = data.routes[0];
      const instructions = route.sections[0]?.actions?.map((action: any) => action.instruction) || [];

      return {
        route: route,
        distance: route.sections[0]?.summary?.length || 0, // meters
        duration: route.sections[0]?.summary?.duration || 0, // seconds
        instructions
      };
    } catch (error) {
      console.error('❌ Failed to calculate route:', error);
      throw error;
    }
  }

  /**
   * Create geofences around pickup and delivery locations
   */
  async createGeofences(loadId: string, pickup: Location, delivery: Location): Promise<{
    pickupGeofence: Geofence;
    deliveryGeofence: Geofence;
  }> {
    const pickupGeofence: Geofence = {
      id: `pickup_${loadId}`,
      name: `Pickup Zone - Load ${loadId}`,
      center: pickup,
      radiusMeters: 150, // 150 meter radius
      type: 'pickup'
    };

    const deliveryGeofence: Geofence = {
      id: `delivery_${loadId}`,
      name: `Delivery Zone - Load ${loadId}`,
      center: delivery,
      radiusMeters: 150,
      type: 'delivery'
    };

    console.log(`🔵 Created geofences for load ${loadId}`);
    return { pickupGeofence, deliveryGeofence };
  }

  /**
   * Check if driver is within a geofence
   */
  checkGeofenceEntry(driverLocation: Location, geofence: Geofence): boolean {
    const distance = this.calculateDistance(driverLocation, geofence.center);
    return distance <= geofence.radiusMeters;
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(point1: Location, point2: Location): number {
    const R = 6371000; // Earth's radius in meters
    const lat1Rad = point1.lat * Math.PI / 180;
    const lat2Rad = point2.lat * Math.PI / 180;
    const deltaLatRad = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLngRad = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLatRad/2) * Math.sin(deltaLatRad/2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad/2) * Math.sin(deltaLngRad/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  /**
   * Process location update from driver
   */
  async processLocationUpdate(
    driverId: string, 
    loadId: string, 
    location: Location
  ): Promise<TrackingEvent[]> {
    const events: TrackingEvent[] = [];

    try {
      // Get load details to check geofences
      const load = await db.select().from(loads).where(eq(loads.id, loadId)).limit(1);
      if (!load.length) {
        throw new Error(`Load ${loadId} not found`);
      }

      const currentLoad = load[0];
      
      // Create geofences for pickup and delivery
      const pickupLocation = { 
        lat: parseFloat(currentLoad.shipperLatitude || '0'), 
        lng: parseFloat(currentLoad.shipperLongitude || '0') 
      };
      const deliveryLocation = { 
        lat: parseFloat(currentLoad.receiverLatitude || '0'), 
        lng: parseFloat(currentLoad.receiverLongitude || '0') 
      };

      const { pickupGeofence, deliveryGeofence } = await this.createGeofences(
        loadId, 
        pickupLocation, 
        deliveryLocation
      );

      // Check geofence entries
      const atPickup = this.checkGeofenceEntry(location, pickupGeofence);
      const atDelivery = this.checkGeofenceEntry(location, deliveryGeofence);

      // Determine event type based on current status and location
      let eventType: TrackingEvent['eventType'] = 'en_route';
      
      if (atPickup && currentLoad.status === 'assigned') {
        eventType = 'pickup_arrived';
        // Update load status
        await db.update(loads)
          .set({ status: 'at_shipper', updatedAt: new Date() })
          .where(eq(loads.id, loadId));
      } else if (atPickup && currentLoad.status === 'at_shipper') {
        eventType = 'pickup_departed';
        // Update load status
        await db.update(loads)
          .set({ status: 'left_shipper', updatedAt: new Date() })
          .where(eq(loads.id, loadId));
      } else if (atDelivery && currentLoad.status === 'left_shipper') {
        eventType = 'delivery_arrived';
        // Update load status
        await db.update(loads)
          .set({ status: 'at_receiver', updatedAt: new Date() })
          .where(eq(loads.id, loadId));
      } else if (atDelivery && currentLoad.status === 'at_receiver') {
        eventType = 'delivery_departed';
        // Update load status (this would typically be 'delivered' after POD upload)
        await db.update(loads)
          .set({ status: 'delivered', updatedAt: new Date() })
          .where(eq(loads.id, loadId));
      }

      const event: TrackingEvent = {
        driverId,
        loadId,
        eventType,
        location,
        timestamp: new Date()
      };

      events.push(event);
      console.log(`📍 Tracking event: ${eventType} for driver ${driverId} on load ${loadId}`);

      return events;
    } catch (error) {
      console.error('❌ Failed to process location update:', error);
      throw error;
    }
  }

  /**
   * Get real-time ETA using HERE traffic data
   */
  async calculateETA(currentLocation: Location, destination: Location): Promise<{
    etaMinutes: number;
    distanceRemaining: number;
    trafficDelay: number;
  }> {
    try {
      const url = `${HERE_API_BASE}/routes`;
      const params = new URLSearchParams({
        apikey: this.apiKey,
        transportMode: 'truck',
        origin: `${currentLocation.lat},${currentLocation.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        return: 'summary',
        departureTime: 'now' // Use current traffic conditions
      });

      const response = await fetch(`${url}?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HERE ETA API error: ${data.error?.message || 'Unknown error'}`);
      }

      const route = data.routes[0];
      const summary = route.sections[0]?.summary;

      return {
        etaMinutes: Math.round((summary?.duration || 0) / 60),
        distanceRemaining: summary?.length || 0,
        trafficDelay: summary?.trafficDelay || 0
      };
    } catch (error) {
      console.error('❌ Failed to calculate ETA:', error);
      return {
        etaMinutes: 0,
        distanceRemaining: 0,
        trafficDelay: 0
      };
    }
  }
}

// Export singleton instance
export const hereTracking = new HERETrackingService();