import { DatabaseStorage } from "./storage";
import { LoadStop } from "@shared/schema";

interface RouteCalculationResult {
  distance: number; // Distance in miles
  duration: number; // Duration in minutes
  routeData: any; // Full route response from API
}

interface RoutePoint {
  latitude: number;
  longitude: number;
  address?: string;
}

export class RouteService {
  private apiKey: string;
  private storage: DatabaseStorage;

  constructor(storage: DatabaseStorage) {
    this.apiKey = process.env.HERE_API_KEY || '';
    this.storage = storage;
    
    if (!this.apiKey) {
      console.warn('⚠️ HERE_API_KEY not configured - route calculation will be disabled');
    }
  }

  /**
   * Calculate route distance and duration between pickup and delivery locations
   */
  async calculateRoute(pickup: RoutePoint, delivery: RoutePoint): Promise<RouteCalculationResult | null> {
    if (!this.apiKey) {
      console.log('📍 Route calculation skipped - no API key configured');
      return null;
    }

    try {
      console.log(`🗺️ Calculating route from ${pickup.address || 'pickup'} to ${delivery.address || 'delivery'}`);
      
      // HERE Routing API v8 endpoint
      const url = new URL('https://router.hereapi.com/v8/routes');
      url.searchParams.set('apikey', this.apiKey);
      url.searchParams.set('transportMode', 'truck'); // Use truck routing for logistics
      url.searchParams.set('origin', `${pickup.latitude},${pickup.longitude}`);
      url.searchParams.set('destination', `${delivery.latitude},${delivery.longitude}`);
      url.searchParams.set('return', 'summary,polyline'); // Return route summary and polyline
      
      // Add truck-specific parameters for better routing
      url.searchParams.set('truck[grossWeight]', '40000'); // 40,000 lbs typical truck weight
      url.searchParams.set('truck[axleCount]', '5'); // Standard semi-truck
      url.searchParams.set('truck[length]', '16.5'); // 53ft trailer length in meters
      url.searchParams.set('truck[width]', '2.6'); // Standard truck width
      url.searchParams.set('truck[height]', '4.0'); // Standard truck height

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HERE API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.routes || data.routes.length === 0) {
        throw new Error('No routes found between the specified locations');
      }

      const route = data.routes[0];
      const summary = route.sections[0].summary;
      
      // Convert meters to miles (1 meter = 0.000621371 miles)
      const distanceInMiles = (summary.length * 0.000621371);
      
      // Convert seconds to minutes
      const durationInMinutes = (summary.duration / 60);

      const result: RouteCalculationResult = {
        distance: Math.round(distanceInMiles * 100) / 100, // Round to 2 decimal places
        duration: Math.round(durationInMinutes),
        routeData: {
          provider: 'HERE',
          calculatedAt: new Date().toISOString(),
          route: {
            distance: {
              value: summary.length,
              unit: 'meters'
            },
            duration: {
              value: summary.duration,
              unit: 'seconds'
            },
            polyline: route.sections[0].polyline,
            origin: pickup,
            destination: delivery
          },
          apiResponse: data
        }
      };

      console.log(`✅ Route calculated: ${result.distance} miles, ${result.duration} minutes`);
      return result;

    } catch (error) {
      console.error('❌ Route calculation failed:', error);
      return null;
    }
  }

  /**
   * Calculate route with multiple stops (pickup + multiple deliveries)
   */
  async calculateMultiStopRoute(stops: RoutePoint[]): Promise<RouteCalculationResult | null> {
    if (!this.apiKey || stops.length < 2) {
      console.log('📍 Multi-stop route calculation skipped - no API key or insufficient stops');
      return null;
    }

    try {
      console.log(`🗺️ Calculating multi-stop route with ${stops.length} stops`);
      
      // For multi-stop routing, we'll use the Matrix API to get optimized route
      const url = new URL('https://matrix.router.hereapi.com/v8/matrix');
      url.searchParams.set('apikey', this.apiKey);
      url.searchParams.set('async', 'false');
      url.searchParams.set('transportMode', 'truck');
      
      // Add origins and destinations (all stops)
      stops.forEach((stop, index) => {
        url.searchParams.append('origins', `${stop.latitude},${stop.longitude}`);
        url.searchParams.append('destinations', `${stop.latitude},${stop.longitude}`);
      });

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HERE Matrix API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Calculate total distance by summing the optimal route between consecutive stops
      let totalDistance = 0;
      let totalDuration = 0;
      
      for (let i = 0; i < stops.length - 1; i++) {
        const matrixIndex = i * stops.length + (i + 1);
        if (data.matrix && data.matrix[matrixIndex]) {
          totalDistance += data.matrix[matrixIndex].distance || 0;
          totalDuration += data.matrix[matrixIndex].duration || 0;
        }
      }

      // Convert meters to miles and seconds to minutes
      const distanceInMiles = (totalDistance * 0.000621371);
      const durationInMinutes = (totalDuration / 60);

      const result: RouteCalculationResult = {
        distance: Math.round(distanceInMiles * 100) / 100,
        duration: Math.round(durationInMinutes),
        routeData: {
          provider: 'HERE',
          calculatedAt: new Date().toISOString(),
          multiStop: true,
          stops: stops,
          totalDistance: {
            value: totalDistance,
            unit: 'meters'
          },
          totalDuration: {
            value: totalDuration,
            unit: 'seconds'
          },
          apiResponse: data
        }
      };

      console.log(`✅ Multi-stop route calculated: ${result.distance} miles, ${result.duration} minutes`);
      return result;

    } catch (error) {
      console.error('❌ Multi-stop route calculation failed:', error);
      return null;
    }
  }

  /**
   * Update load with calculated route information
   */
  async updateLoadRoute(loadId: string): Promise<boolean> {
    try {
      const load = await this.storage.getLoad(loadId);
      if (!load) {
        console.log(`❌ Load ${loadId} not found for route calculation`);
        return false;
      }

      // Get load stops for multi-stop routing
      const stops = await this.storage.getLoadStops(loadId);
      
      let routeResult: RouteCalculationResult | null = null;

      if (stops && stops.length > 0) {
        // Multi-stop route calculation
        const routePoints: RoutePoint[] = [];
        
        // Note: LoadStops don't have coordinates in current schema
        // For now, we'll use basic two-point routing with shipper/receiver coordinates
        console.log('⚠️ Multi-stop routing with coordinate extraction not yet implemented - using basic route');

        if (routePoints.length >= 2) {
          routeResult = await this.calculateMultiStopRoute(routePoints);
        }
      } else {
        // Simple two-point route calculation
        const pickup: RoutePoint | null = load.shipperLatitude && load.shipperLongitude ? {
          latitude: parseFloat(load.shipperLatitude),
          longitude: parseFloat(load.shipperLongitude),
          address: load.pickupAddress || undefined
        } : null;

        const delivery: RoutePoint | null = load.receiverLatitude && load.receiverLongitude ? {
          latitude: parseFloat(load.receiverLatitude),
          longitude: parseFloat(load.receiverLongitude),
          address: load.deliveryAddress || undefined
        } : null;

        if (pickup && delivery) {
          routeResult = await this.calculateRoute(pickup, delivery);
        }
      }

      if (routeResult) {
        // Update load with calculated route data
        await this.storage.updateLoadRoute(loadId, {
          calculatedMiles: routeResult.distance,
          routeData: routeResult.routeData,
          lastRouteCalculated: new Date()
        });

        console.log(`✅ Load ${loadId} updated with calculated route: ${routeResult.distance} miles`);
        return true;
      } else {
        console.log(`⚠️ Could not calculate route for load ${loadId} - insufficient location data`);
        return false;
      }

    } catch (error) {
      console.error(`❌ Failed to update route for load ${loadId}:`, error);
      return false;
    }
  }

  /**
   * Calculate route for a specific load and return the result
   */
  async calculateLoadRoute(load: any): Promise<{ success: boolean; mileage?: number; routeData?: any; error?: string }> {
    try {
      if (!this.apiKey) {
        return { 
          success: false, 
          error: 'HERE API key not configured' 
        };
      }

      // Get load stops for multi-stop routing
      const stops = await this.storage.getLoadStops(load.id);
      
      let routeResult: RouteCalculationResult | null = null;

      if (stops && stops.length > 0) {
        // Multi-stop route calculation
        console.log('⚠️ Multi-stop routing with coordinate extraction not yet implemented - using basic route');
        // For now, fall back to basic two-point routing
      }
      
      // Simple two-point route calculation
      const pickup: RoutePoint | null = load.shipperLatitude && load.shipperLongitude ? {
        latitude: parseFloat(load.shipperLatitude),
        longitude: parseFloat(load.shipperLongitude),
        address: load.pickupAddress || undefined
      } : null;

      const delivery: RoutePoint | null = load.receiverLatitude && load.receiverLongitude ? {
        latitude: parseFloat(load.receiverLatitude),
        longitude: parseFloat(load.receiverLongitude),
        address: load.deliveryAddress || undefined
      } : null;

      if (!pickup || !delivery) {
        return { 
          success: false, 
          error: 'Load missing pickup or delivery coordinates' 
        };
      }

      routeResult = await this.calculateRoute(pickup, delivery);
      
      if (routeResult) {
        return {
          success: true,
          mileage: routeResult.distance,
          routeData: routeResult.routeData
        };
      } else {
        return { 
          success: false, 
          error: 'Route calculation failed' 
        };
      }
    } catch (error) {
      console.error('❌ Error in calculateLoadRoute:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}