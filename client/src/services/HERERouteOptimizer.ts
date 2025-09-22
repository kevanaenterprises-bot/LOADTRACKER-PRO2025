/**
 * HERE Maps Route Optimizer - Perfect for Trucking & Logistics
 * Provides truck-specific routing, route optimization, and accurate mileage calculation
 */

export interface Location {
  address: string;
  lat?: number;
  lng?: number;
  name?: string;
  type?: 'pickup' | 'dropoff';
}

export interface OptimizedRoute {
  totalMiles: number;
  totalDuration: number; // in minutes
  optimizedOrder: Location[];
  routeDetails: any; // HERE route response
  estimatedFuelCost?: number;
  truckSpecificWarnings?: string[];
}

export interface TruckSpecs {
  maxWeight?: number; // in pounds
  maxHeight?: number; // in feet
  maxWidth?: number; // in feet
  maxLength?: number; // in feet
  axleCount?: number;
  hazmatClass?: string;
}

export interface HERERouteOptions {
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  optimizeForTime?: boolean;
  fuelCostPerGallon?: number;
  milesPerGallon?: number;
  truckSpecs?: TruckSpecs;
}

class HERERouteOptimizerService {
  private apiKey: string = '';
  private baseUrl = 'https://route.ls.hereapi.com/routing/7.2';
  private geocodeUrl = 'https://geocode.search.hereapi.com/v1';
  private isInitialized = false;

  /**
   * Initialize HERE Maps with API key
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Get API key from environment
      this.apiKey = import.meta.env.VITE_HERE_MAPS_API_KEY || 
                    import.meta.env.HERE_MAPS_API_KEY || 
                    import.meta.env.VITE_HERE_API_KEY || 
                    import.meta.env.HERE_API_KEY;
      
      if (!this.apiKey) {
        throw new Error('HERE Maps API key not found. Please add HERE_MAPS_API_KEY to your environment variables.');
      }

      // Test API key with a simple request
      await this.testConnection();
      
      this.isInitialized = true;
      console.log('✅ HERE Maps RouteOptimizer initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize HERE Maps RouteOptimizer:', error);
      throw error;
    }
  }

  /**
   * Test HERE Maps API connection
   */
  private async testConnection(): Promise<void> {
    try {
      const response = await fetch(
        `${this.geocodeUrl}/geocode?q=Dallas,TX&apikey=${this.apiKey}&limit=1`
      );
      
      if (!response.ok) {
        throw new Error(`HERE Maps API test failed: ${response.status}`);
      }
      
      console.log('✅ HERE Maps API connection verified');
    } catch (error) {
      console.error('❌ HERE Maps API connection test failed:', error);
      throw new Error('HERE Maps API key invalid or service unavailable');
    }
  }

  /**
   * Geocode an address using HERE Maps Geocoding API
   */
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
    await this.initialize();
    
    try {
      const response = await fetch(
        `${this.geocodeUrl}/geocode?q=${encodeURIComponent(address)}&apikey=${this.apiKey}&limit=1`
      );
      
      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        throw new Error(`No results found for address: ${address}`);
      }
      
      const location = data.items[0].position;
      return {
        lat: location.lat,
        lng: location.lng
      };
    } catch (error) {
      console.error('❌ HERE Maps geocoding failed:', error);
      throw error;
    }
  }

  /**
   * Calculate optimized truck route with multiple stops
   */
  async optimizeRoute(
    locations: Location[], 
    options: HERERouteOptions = {}
  ): Promise<OptimizedRoute> {
    await this.initialize();

    if (locations.length < 2) {
      throw new Error('At least 2 locations required for route optimization');
    }

    try {
      // Geocode addresses that don't have coordinates
      const geocodedLocations = await Promise.all(
        locations.map(async (location) => {
          if (location.lat && location.lng) {
            return location;
          }
          
          const coords = await this.geocodeAddress(location.address);
          return {
            ...location,
            lat: coords.lat,
            lng: coords.lng
          };
        })
      );

      // Order locations: pickups first, then deliveries (optimal for trucking)
      const pickupLocations = geocodedLocations.filter(loc => loc.type === 'pickup');
      const dropoffLocations = geocodedLocations.filter(loc => loc.type === 'dropoff');
      
      const orderedLocations = pickupLocations.length > 0 && dropoffLocations.length > 0
        ? [...pickupLocations, ...dropoffLocations]
        : geocodedLocations;

      // Build HERE Maps routing request
      const route = await this.calculateHERERoute(orderedLocations, options);
      
      // Parse route response
      const routeData = route.routes[0];
      let totalMiles = 0;
      let totalDuration = 0;
      const warnings: string[] = [];

      // Calculate totals from route segments
      routeData.sections.forEach((section: any) => {
        totalMiles += section.summary.length || 0;
        totalDuration += section.summary.duration || 0;
        
        // Check for truck-specific warnings
        if (section.notices) {
          section.notices.forEach((notice: any) => {
            if (notice.code.includes('TRUCK') || notice.code.includes('WEIGHT')) {
              warnings.push(notice.title || notice.code);
            }
          });
        }
      });

      // Convert meters to miles and seconds to minutes
      totalMiles = Math.round((totalMiles * 0.000621371) * 100) / 100;
      totalDuration = Math.round(totalDuration / 60);

      // Calculate fuel cost estimate
      const estimatedFuelCost = this.calculateFuelCost(
        totalMiles, 
        options.fuelCostPerGallon || 3.50, 
        options.milesPerGallon || 6.5
      );

      return {
        totalMiles,
        totalDuration,
        optimizedOrder: orderedLocations,
        routeDetails: route,
        estimatedFuelCost,
        truckSpecificWarnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      console.error('❌ HERE Maps route optimization failed:', error);
      throw error;
    }
  }

  /**
   * Calculate route using HERE Maps Routing API with truck specifications
   */
  private async calculateHERERoute(
    locations: Location[], 
    options: HERERouteOptions
  ): Promise<any> {
    const origin = `${locations[0].lat},${locations[0].lng}`;
    const destination = `${locations[locations.length - 1].lat},${locations[locations.length - 1].lng}`;
    
    // Waypoints for intermediate stops
    const waypoints = locations.slice(1, -1).map(loc => `${loc.lat},${loc.lng}`);
    
    // Build URL parameters
    const params = new URLSearchParams({
      apikey: this.apiKey,
      transportMode: 'truck', // 🚛 Truck-specific routing!
      origin,
      destination,
      return: 'summary,polyline,actions,instructions,travelSummary',
      routingMode: options.optimizeForTime ? 'fast' : 'short',
    });

    // Add waypoints if any
    if (waypoints.length > 0) {
      waypoints.forEach((waypoint, index) => {
        params.append(`via[${index}]`, waypoint);
      });
    }

    // Add truck specifications for better routing
    if (options.truckSpecs) {
      const specs = options.truckSpecs;
      if (specs.maxWeight) {
        params.append('truck[grossWeight]', Math.round(specs.maxWeight * 0.453592).toString()); // Convert lbs to kg
      }
      if (specs.maxHeight) {
        params.append('truck[height]', Math.round(specs.maxHeight * 0.3048 * 100).toString()); // Convert ft to cm
      }
      if (specs.maxWidth) {
        params.append('truck[width]', Math.round(specs.maxWidth * 0.3048 * 100).toString()); // Convert ft to cm
      }
      if (specs.maxLength) {
        params.append('truck[length]', Math.round(specs.maxLength * 0.3048 * 100).toString()); // Convert ft to cm
      }
    }

    // Route preferences
    if (options.avoidTolls) {
      params.append('avoid[features]', 'tollRoad');
    }
    if (options.avoidHighways) {
      params.append('avoid[features]', 'controlledAccessHighway');
    }

    try {
      const response = await fetch(`${this.baseUrl}/calculateroute?${params}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HERE routing failed: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.routes || data.routes.length === 0) {
        throw new Error('No routes found');
      }
      
      return data;
    } catch (error) {
      console.error('❌ HERE route calculation failed:', error);
      throw error;
    }
  }

  /**
   * Calculate simple distance between two points
   */
  async calculateDistance(
    origin: string, 
    destination: string,
    truckSpecs?: TruckSpecs
  ): Promise<{ miles: number; duration: number; warnings?: string[] }> {
    await this.initialize();

    try {
      const [originCoords, destCoords] = await Promise.all([
        this.geocodeAddress(origin),
        this.geocodeAddress(destination)
      ]);

      const params = new URLSearchParams({
        apikey: this.apiKey,
        transportMode: 'truck',
        origin: `${originCoords.lat},${originCoords.lng}`,
        destination: `${destCoords.lat},${destCoords.lng}`,
        return: 'summary',
        routingMode: 'fast',
      });

      // Add truck specs if provided
      if (truckSpecs) {
        if (truckSpecs.maxWeight) {
          params.append('truck[grossWeight]', Math.round(truckSpecs.maxWeight * 0.453592).toString());
        }
      }

      const response = await fetch(`${this.baseUrl}/calculateroute?${params}`);
      
      if (!response.ok) {
        throw new Error(`Distance calculation failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.routes || data.routes.length === 0) {
        throw new Error('No route found for distance calculation');
      }
      
      const route = data.routes[0];
      const summary = route.sections[0].summary;
      
      const miles = Math.round((summary.length * 0.000621371) * 100) / 100;
      const duration = Math.round(summary.duration / 60);
      
      // Extract any truck warnings
      const warnings: string[] = [];
      if (route.sections[0].notices) {
        route.sections[0].notices.forEach((notice: any) => {
          if (notice.code.includes('TRUCK')) {
            warnings.push(notice.title);
          }
        });
      }
      
      return { 
        miles, 
        duration,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      console.error('❌ HERE distance calculation failed:', error);
      throw error;
    }
  }

  /**
   * Calculate estimated fuel cost for trucks
   */
  private calculateFuelCost(miles: number, costPerGallon: number, mpg: number): number {
    const gallonsNeeded = miles / mpg;
    return Math.round(gallonsNeeded * costPerGallon * 100) / 100;
  }
}

// Export singleton instance
export const HERERouteOptimizer = new HERERouteOptimizerService();