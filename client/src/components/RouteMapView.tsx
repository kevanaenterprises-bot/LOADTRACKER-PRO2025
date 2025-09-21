import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MapPin, Route, Clock, DollarSign, Navigation } from 'lucide-react';
import { ensureGoogleMapsLoaded } from '@/utils/googleMaps';
import { RouteOptimizer, type Location, type OptimizedRoute } from '@/services/RouteOptimizer';

interface RouteMapViewProps {
  locations: Location[];
  onRouteOptimized?: (route: OptimizedRoute) => void;
  showOptimization?: boolean;
  height?: string;
}

export function RouteMapView({ 
  locations, 
  onRouteOptimized, 
  showOptimization = true,
  height = '400px' 
}: RouteMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Initialize map
  useEffect(() => {
    const initMap = async () => {
      try {
        await ensureGoogleMapsLoaded();
        
        if (!mapRef.current) return;

        // Create map instance
        const map = new window.google.maps.Map(mapRef.current, {
          zoom: 6,
          center: { lat: 32.7767, lng: -96.7970 }, // Default to Dallas, TX
          mapTypeId: window.google.maps.MapTypeId.ROADMAP,
        });

        // Create directions renderer
        const directionsRenderer = new window.google.maps.DirectionsRenderer({
          draggable: false,
          panel: null,
        });
        
        directionsRenderer.setMap(map);
        
        mapInstanceRef.current = map;
        directionsRendererRef.current = directionsRenderer;
        setIsMapLoaded(true);
        setMapError(null);

      } catch (error) {
        console.error('Map initialization failed:', error);
        setMapError(error instanceof Error ? error.message : 'Failed to load map');
      }
    };

    initMap();
  }, []);

  // Update map when locations change
  useEffect(() => {
    if (isMapLoaded && locations.length > 0 && !showOptimization) {
      displayBasicMarkers();
    }
  }, [locations, isMapLoaded, showOptimization]);

  // Display basic markers without optimization
  const displayBasicMarkers = () => {
    if (!mapInstanceRef.current || locations.length === 0) return;

    // Clear existing markers and routes
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setDirections({ routes: [] });
    }

    const bounds = new window.google.maps.LatLngBounds();
    
    // Add markers for each location
    locations.forEach((location, index) => {
      // If location has coordinates, use them; otherwise we'll need to geocode
      if (location.lat && location.lng) {
        const marker = new window.google.maps.Marker({
          position: { lat: location.lat, lng: location.lng },
          map: mapInstanceRef.current,
          title: location.name || location.address,
          label: {
            text: `${index + 1}`,
            color: 'white',
            fontWeight: 'bold'
          },
          icon: {
            url: location.type === 'pickup' 
              ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'
              : 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
          }
        });
        
        bounds.extend({ lat: location.lat, lng: location.lng });
      }
    });

    // Fit map to show all markers
    if (!bounds.isEmpty()) {
      mapInstanceRef.current.fitBounds(bounds);
    }
  };

  // Optimize route and display
  const handleOptimizeRoute = async () => {
    if (!isMapLoaded || locations.length < 2) return;

    setIsOptimizing(true);
    try {
      const route = await RouteOptimizer.optimizeRoute(locations, {
        avoidTolls: false,
        avoidHighways: false,
        optimizeForTime: true,
        fuelCostPerGallon: 3.50,
        milesPerGallon: 6.5
      });

      setOptimizedRoute(route);
      
      // Display route on map
      if (directionsRendererRef.current && route.routeDetails) {
        directionsRendererRef.current.setDirections(route.routeDetails);
      }

      // Notify parent component
      if (onRouteOptimized) {
        onRouteOptimized(route);
      }

    } catch (error) {
      console.error('Route optimization failed:', error);
      setMapError(error instanceof Error ? error.message : 'Route optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  if (mapError) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center text-red-600">
            <MapPin className="h-5 w-5 mr-2" />
            <span>Map Error: {mapError}</span>
          </div>
          <p className="text-sm text-gray-600 mt-2 text-center">
            Please check your Google Maps API key configuration.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Map Container */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Route className="h-5 w-5 mr-2" />
              Route Map
            </div>
            {showOptimization && locations.length >= 2 && (
              <Button 
                onClick={handleOptimizeRoute}
                disabled={isOptimizing || !isMapLoaded}
                size="sm"
              >
                <Navigation className="h-4 w-4 mr-2" />
                {isOptimizing ? 'Optimizing...' : 'Optimize Route'}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div 
            ref={mapRef} 
            style={{ height }} 
            className="w-full rounded-b-lg"
          />
          {!isMapLoaded && (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-600">Loading map...</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Route Optimization Results */}
      {optimizedRoute && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Route className="h-5 w-5 mr-2" />
              Optimized Route Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Route Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center">
                  <Route className="h-5 w-5 text-blue-600 mr-2" />
                  <span className="font-medium">Total Distance</span>
                </div>
                <Badge variant="secondary">{optimizedRoute.totalMiles} miles</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <Clock className="h-5 w-5 text-green-600 mr-2" />
                  <span className="font-medium">Est. Time</span>
                </div>
                <Badge variant="secondary">
                  {Math.floor(optimizedRoute.totalDuration / 60)}h {optimizedRoute.totalDuration % 60}m
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <div className="flex items-center">
                  <DollarSign className="h-5 w-5 text-orange-600 mr-2" />
                  <span className="font-medium">Est. Fuel Cost</span>
                </div>
                <Badge variant="secondary">${optimizedRoute.estimatedFuelCost}</Badge>
              </div>
            </div>

            <Separator />

            {/* Optimized Stop Order */}
            <div>
              <h4 className="font-semibold mb-3">Optimized Stop Order</h4>
              <div className="space-y-2">
                {optimizedRoute.optimizedOrder.map((location, index) => (
                  <div key={index} className="flex items-center p-2 bg-gray-50 rounded">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold mr-3 ${
                      location.type === 'pickup' ? 'bg-green-500' : 'bg-red-500'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {location.name || `${location.type === 'pickup' ? 'Pickup' : 'Delivery'} Location`}
                      </div>
                      <div className="text-sm text-gray-600">{location.address}</div>
                    </div>
                    <Badge variant={location.type === 'pickup' ? 'default' : 'destructive'}>
                      {location.type}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Location List */}
      {locations.length > 0 && !optimizedRoute && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <MapPin className="h-5 w-5 mr-2" />
              Stops ({locations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {locations.map((location, index) => (
                <div key={index} className="flex items-center p-2 bg-gray-50 rounded">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold mr-3 ${
                    location.type === 'pickup' ? 'bg-green-500' : 'bg-red-500'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">
                      {location.name || `${location.type === 'pickup' ? 'Pickup' : 'Delivery'} Location`}
                    </div>
                    <div className="text-sm text-gray-600">{location.address}</div>
                  </div>
                  <Badge variant={location.type === 'pickup' ? 'default' : 'destructive'}>
                    {location.type}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}