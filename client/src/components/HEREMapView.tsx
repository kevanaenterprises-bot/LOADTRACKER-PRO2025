import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MapPin, Route, Clock, DollarSign, Navigation, Truck, AlertTriangle } from 'lucide-react';
import { HERERouteOptimizer, type Location, type OptimizedRoute, type TruckSpecs } from '@/services/HERERouteOptimizer';

interface HEREMapViewProps {
  locations: Location[];
  onRouteOptimized?: (route: OptimizedRoute) => void;
  showOptimization?: boolean;
  height?: string;
  truckSpecs?: TruckSpecs;
}

export function HEREMapView({ 
  locations, 
  onRouteOptimized, 
  showOptimization = true,
  height = '400px',
  truckSpecs
}: HEREMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hereApiKey, setHereApiKey] = useState<string | null>(null);

  // Get HERE API key from environment
  useEffect(() => {
    const key = import.meta.env.VITE_HERE_MAPS_API_KEY || import.meta.env.HERE_MAPS_API_KEY || import.meta.env.VITE_HERE_API_KEY || import.meta.env.HERE_API_KEY;
    if (key) {
      setHereApiKey(key);
    } else {
      setMapError('HERE Maps API key not configured');
    }
  }, []);

  // Initialize HERE Map
  useEffect(() => {
    const initMap = async () => {
      if (!hereApiKey || !mapRef.current) return;

      try {
        // Load HERE Maps API dynamically
        await loadHEREMapsAPI(hereApiKey);
        
        // Create map instance
        const platform = new (window as any).H.service.Platform({
          'apikey': hereApiKey
        });

        const defaultMapTypes = platform.createDefaultMapTypes();
        
        const map = new (window as any).H.Map(
          mapRef.current,
          defaultMapTypes.vector.normal.map,
          {
            zoom: 6,
            center: { lat: 32.7767, lng: -96.7970 } // Default to Dallas, TX
          }
        );

        // Enable interaction
        const behavior = new (window as any).H.mapevents.Behavior();
        const ui = new (window as any).H.ui.UI.createDefault(map);

        mapInstanceRef.current = { map, platform, ui };
        setIsMapLoaded(true);
        setMapError(null);

        console.log('✅ HERE Map initialized successfully');

      } catch (error) {
        console.error('HERE Map initialization failed:', error);
        setMapError(error instanceof Error ? error.message : 'Failed to load HERE Map');
      }
    };

    initMap();
  }, [hereApiKey]);

  // Update map when locations change
  useEffect(() => {
    if (isMapLoaded && locations.length > 0 && !showOptimization) {
      displayBasicMarkers();
    }
  }, [locations, isMapLoaded, showOptimization]);

  // Display basic markers without route optimization
  const displayBasicMarkers = () => {
    if (!mapInstanceRef.current || locations.length === 0) return;

    const { map } = mapInstanceRef.current;
    
    // Clear existing markers
    map.removeObjects(map.getObjects());

    const group = new (window as any).H.map.Group();
    
    // Add markers for each location
    locations.forEach((location, index) => {
      if (location.lat && location.lng) {
        // Create custom icon based on type
        const icon = new (window as any).H.map.Icon(
          createMarkerSVG(location.type === 'pickup' ? '#10B981' : '#EF4444', index + 1),
          { size: { w: 32, h: 32 } }
        );

        const marker = new (window as any).H.map.Marker(
          { lat: location.lat, lng: location.lng },
          { icon }
        );

        // Add info bubble
        marker.setData(`<div><strong>${location.name || `${location.type} Location`}</strong><br/>${location.address}</div>`);
        
        group.addObject(marker);
      }
    });

    map.addObject(group);

    // Fit map to show all markers
    if (group.getBoundingBox()) {
      map.getViewPort().setBounds(group.getBoundingBox());
    }
  };

  // Optimize route and display
  const handleOptimizeRoute = async () => {
    if (!isMapLoaded || locations.length < 2) return;

    setIsOptimizing(true);
    try {
      const route = await HERERouteOptimizer.optimizeRoute(locations, {
        avoidTolls: false,
        avoidHighways: false,
        optimizeForTime: true,
        fuelCostPerGallon: 3.50,
        milesPerGallon: 6.5, // Truck MPG
        truckSpecs
      });

      setOptimizedRoute(route);
      
      // Display route on map
      if (mapInstanceRef.current && route.routeDetails) {
        displayRouteOnMap(route);
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

  // Display optimized route on HERE Map
  const displayRouteOnMap = (route: OptimizedRoute) => {
    if (!mapInstanceRef.current) return;

    const { map } = mapInstanceRef.current;
    
    // Clear existing objects
    map.removeObjects(map.getObjects());

    const group = new (window as any).H.map.Group();

    // Add route polyline
    if (route.routeDetails && route.routeDetails.routes[0]) {
      const routeShape = route.routeDetails.routes[0].sections[0].polyline;
      const polyline = (window as any).H.geo.LineString.fromFlexiblePolyline(routeShape);
      
      const routeLine = new (window as any).H.map.Polyline(polyline, {
        style: { strokeColor: '#2563EB', lineWidth: 4 }
      });
      
      group.addObject(routeLine);
    }

    // Add optimized waypoint markers
    route.optimizedOrder.forEach((location, index) => {
      if (location.lat && location.lng) {
        const icon = new (window as any).H.map.Icon(
          createMarkerSVG(location.type === 'pickup' ? '#10B981' : '#EF4444', index + 1),
          { size: { w: 32, h: 32 } }
        );

        const marker = new (window as any).H.map.Marker(
          { lat: location.lat, lng: location.lng },
          { icon }
        );

        group.addObject(marker);
      }
    });

    map.addObject(group);

    // Fit map to show route
    if (group.getBoundingBox()) {
      map.getViewPort().setBounds(group.getBoundingBox());
    }
  };

  // Create SVG marker
  const createMarkerSVG = (color: string, number: number) => {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="12" fill="${color}" stroke="white" stroke-width="2"/>
        <text x="16" y="20" text-anchor="middle" fill="white" font-family="Arial" font-size="12" font-weight="bold">${number}</text>
      </svg>
    `)}`;
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
            Please check your HERE Maps API key configuration.
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
              <Truck className="h-5 w-5 mr-2" />
              Truck Route Map (HERE Maps)
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
              <div className="text-gray-600">Loading HERE Map...</div>
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
              Truck Route Details
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

            {/* Truck Warnings */}
            {optimizedRoute.truckSpecificWarnings && optimizedRoute.truckSpecificWarnings.length > 0 && (
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-center mb-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
                  <span className="font-semibold text-yellow-800">Truck Route Warnings</span>
                </div>
                <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                  {optimizedRoute.truckSpecificWarnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

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
    </div>
  );
}

// Load HERE Maps API dynamically
async function loadHEREMapsAPI(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).H) {
      resolve();
      return;
    }

    // Create script element
    const script = document.createElement('script');
    script.src = 'https://js.api.here.com/v3/3.1/mapsjs-core.js';
    script.async = true;

    script.onload = () => {
      // Load additional HERE Maps modules
      Promise.all([
        loadScript('https://js.api.here.com/v3/3.1/mapsjs-service.js'),
        loadScript('https://js.api.here.com/v3/3.1/mapsjs-ui.js'),
        loadScript('https://js.api.here.com/v3/3.1/mapsjs-mapevents.js'),
      ]).then(() => {
        console.log('✅ HERE Maps API loaded successfully');
        resolve();
      }).catch(reject);
    };

    script.onerror = () => {
      reject(new Error('Failed to load HERE Maps API'));
    };

    document.head.appendChild(script);
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}