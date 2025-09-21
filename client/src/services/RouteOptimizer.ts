/**
 * RouteOptimizer Service - Google Maps Integration
 * Handles route optimization, mileage calculation, and mapping for LoadTracker Pro
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
  routeDetails: any; // google.maps.DirectionsResult
  estimatedFuelCost?: number;
}

export interface RouteOptimizationOptions {
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  optimizeForTime?: boolean;
  fuelCostPerGallon?: number;
  milesPerGallon?: number;
}

class RouteOptimizerService {
  private directionsService: any | null = null; // google.maps.DirectionsService
  private geocoder: any | null = null; // google.maps.Geocoder
  private isInitialized = false;

  /**
   * Initialize Google Maps services
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Wait for Google Maps to load
      if (typeof (window as any).google === 'undefined' || !(window as any).google.maps) {
        throw new Error('Google Maps API not loaded');
      }

      this.directionsService = new (window as any).google.maps.DirectionsService();
      this.geocoder = new (window as any).google.maps.Geocoder();
      this.isInitialized = true;
      
      console.log('✅ RouteOptimizer initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize RouteOptimizer:', error);
      throw error;
    }
  }

  /**
   * Geocode an address to get coordinates
   */
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      if (!this.geocoder) {
        reject(new Error('Geocoder not initialized'));
        return;
      }

      this.geocoder.geocode({ address }, (results: any, status: any) => {
        if (status === (window as any).google.maps.GeocoderStatus.OK && results && results[0]) {
          const location = results[0].geometry.location;
          resolve({
            lat: location.lat(),
            lng: location.lng()
          });
        } else {
          reject(new Error(`Geocoding failed: ${status} for address: ${address}`));
        }
      });
    });
  }

  /**
   * Calculate optimized route with multiple stops
   */
  async optimizeRoute(
    locations: Location[], 
    options: RouteOptimizationOptions = {}
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

      // For trucking, we typically want pickup first, then deliveries
      const pickupLocations = geocodedLocations.filter(loc => loc.type === 'pickup');
      const dropoffLocations = geocodedLocations.filter(loc => loc.type === 'dropoff');
      
      // Order: pickups first, then dropoffs (basic optimization)
      const orderedLocations = [...pickupLocations, ...dropoffLocations];
      
      // If no types specified, use original order
      const finalLocations = orderedLocations.length === geocodedLocations.length 
        ? orderedLocations 
        : geocodedLocations;

      // Calculate route using Google Directions API
      const route = await this.calculateDirections(finalLocations, options);
      
      // Calculate total distance and time
      let totalMiles = 0;
      let totalDuration = 0;

      route.routes[0].legs.forEach((leg: any) => {
        totalMiles += leg.distance?.value || 0;
        totalDuration += leg.duration?.value || 0;
      });

      // Convert meters to miles
      totalMiles = Math.round((totalMiles * 0.000621371) * 100) / 100;
      // Convert seconds to minutes
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
        optimizedOrder: finalLocations,
        routeDetails: route,
        estimatedFuelCost
      };

    } catch (error) {
      console.error('❌ Route optimization failed:', error);
      throw error;
    }
  }

  /**
   * Calculate directions using Google Maps Directions API
   */
  private async calculateDirections(
    locations: Location[], 
    options: RouteOptimizationOptions
  ): Promise<any> { // google.maps.DirectionsResult
    return new Promise((resolve, reject) => {
      if (!this.directionsService || locations.length < 2) {
        reject(new Error('DirectionsService not initialized or insufficient locations'));
        return;
      }

      const origin = new (window as any).google.maps.LatLng(locations[0].lat!, locations[0].lng!);
      const destination = new (window as any).google.maps.LatLng(
        locations[locations.length - 1].lat!, 
        locations[locations.length - 1].lng!
      );

      // Waypoints for stops in between
      const waypoints: any[] = locations
        .slice(1, -1)
        .map(location => ({
          location: new (window as any).google.maps.LatLng(location.lat!, location.lng!),
          stopover: true
        }));

      const request: google.maps.DirectionsRequest = {
        origin,
        destination,
        waypoints,
        optimizeWaypoints: true, // Let Google optimize the order
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL,
        avoidHighways: options.avoidHighways || false,
        avoidTolls: options.avoidTolls || false,
      };

      this.directionsService.route(request, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          resolve(result);
        } else {
          reject(new Error(`Directions request failed: ${status}`));
        }
      });
    });
  }

  /**
   * Calculate estimated fuel cost
   */
  private calculateFuelCost(miles: number, costPerGallon: number, mpg: number): number {
    const gallonsNeeded = miles / mpg;
    return Math.round(gallonsNeeded * costPerGallon * 100) / 100;
  }

  /**
   * Get simple distance between two points (straight line)
   */
  async calculateDistance(
    origin: string, 
    destination: string
  ): Promise<{ miles: number; duration: number }> {
    await this.initialize();

    try {
      const [originCoords, destCoords] = await Promise.all([
        this.geocodeAddress(origin),
        this.geocodeAddress(destination)
      ]);

      // Use Google Distance Matrix for accurate road distance
      const service = new google.maps.DistanceMatrixService();
      
      return new Promise((resolve, reject) => {
        service.getDistanceMatrix({
          origins: [new google.maps.LatLng(originCoords.lat, originCoords.lng)],
          destinations: [new google.maps.LatLng(destCoords.lat, destCoords.lng)],
          travelMode: google.maps.TravelMode.DRIVING,
          unitSystem: google.maps.UnitSystem.IMPERIAL,
          avoidHighways: false,
          avoidTolls: false,
        }, (response, status) => {
          if (status === google.maps.DistanceMatrixStatus.OK && response) {
            const element = response.rows[0].elements[0];
            if (element.status === google.maps.DistanceMatrixElementStatus.OK) {
              const miles = Math.round((element.distance.value * 0.000621371) * 100) / 100;
              const duration = Math.round(element.duration.value / 60); // Convert to minutes
              
              resolve({ miles, duration });
            } else {
              reject(new Error(`Distance calculation failed: ${element.status}`));
            }
          } else {
            reject(new Error(`Distance Matrix request failed: ${status}`));
          }
        });
      });
    } catch (error) {
      console.error('❌ Distance calculation failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const RouteOptimizer = new RouteOptimizerService();