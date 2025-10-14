import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MapPin, Route, Clock, DollarSign, Navigation, Truck, AlertTriangle } from 'lucide-react';

interface Location {
  lat?: number;
  lng?: number;
  address: string;
  type: 'pickup' | 'dropoff';
  name?: string;
}

interface HEREMapViewProps {
  locations: Location[];
  onRouteCalculated?: (route: any) => void;
  showOptimization?: boolean;
  height?: string;
}

export function HEREMapView({ 
  locations, 
  onRouteCalculated, 
  showOptimization = true,
  height = '400px'
}: HEREMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [routeData, setRouteData] = useState<any>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hereApiKey, setHereApiKey] = useState<string | null>(null);

  // Get HERE API key from environment
  useEffect(() => {
    const key = import.meta.env.VITE_HERE_MAPS_API_KEY || 
                import.meta.env.HERE_MAPS_API_KEY || 
                import.meta.env.VITE_HERE_API_KEY || 
                import.meta.env.HERE_API_KEY;
    if (key) {
      setHereApiKey(key);
    } else {
      setMapError('HERE Maps API key not configured');
    }
  }, []);

  // Initialize HERE Map using official pattern
  useEffect(() => {
    const initMap = async () => {
      if (!hereApiKey || !mapRef.current) return;

      try {
        // Load HERE Maps API and CSS (official pattern)
        await loadHEREMapsAPI();
        loadHEREMapsCSS();
        
        // Official HERE Maps initialization pattern
        const platform = new (window as any).H.service.Platform({
          apikey: hereApiKey
        });

        // Get default layers (official method)
        const defaultLayers = platform.createDefaultLayers();
        
        // Create map with pixelRatio for better display
        const map = new (window as any).H.Map(
          mapRef.current,
          defaultLayers.vector.normal.map,
          {
            pixelRatio: window.devicePixelRatio || 1,
            zoom: 6,
            center: { lat: 32.7767, lng: -96.7970 } // Default to Dallas, TX
          }
        );

        // Add resize listener (HERE official pattern)
        window.addEventListener('resize', () => map.getViewPort().resize());

        // Enable map interactions (official pattern with MapEvents)
        const mapEvents = new (window as any).H.mapevents.MapEvents(map);
        const behavior = new (window as any).H.mapevents.Behavior(mapEvents);

        // Create default UI components (official pattern)
        const ui = (window as any).H.ui.UI.createDefault(map, defaultLayers);

        // Get v8 routing service (latest API)
        const router = platform.getRoutingService(null, 8);

        mapInstanceRef.current = { map, platform, ui, router, defaultLayers };
        setIsMapLoaded(true);
        setMapError(null);

        console.log('✅ HERE Map initialized successfully (official pattern)');

      } catch (error) {
        console.error('HERE Map initialization failed:', error);
        setMapError(error instanceof Error ? error.message : 'Failed to load HERE Map');
      }
    };

    initMap();

    return () => {
      window.removeEventListener('resize', () => {});
    };
  }, [hereApiKey]);

  // Update map when locations change
  useEffect(() => {
    if (isMapLoaded && locations.length > 0) {
      displayLocationsOnMap();
    }
  }, [locations, isMapLoaded]);

  // Display locations on map
  const displayLocationsOnMap = () => {
    if (!mapInstanceRef.current || locations.length === 0) return;

    const { map } = mapInstanceRef.current;
    
    // Clear existing objects
    map.removeObjects(map.getObjects());

    const group = new (window as any).H.map.Group();
    
    // Add markers for each location
    locations.forEach((location, index) => {
      if (location.lat && location.lng) {
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
      map.getViewModel().setLookAtData({
        bounds: group.getBoundingBox()
      });
    }
  };

  // Calculate route using HERE v8 Routing API (official pattern)
  const handleCalculateRoute = async () => {
    if (!isMapLoaded || !mapInstanceRef.current || locations.length < 2) return;

    const { map, router } = mapInstanceRef.current;
    
    // Filter locations with coordinates
    const validLocations = locations.filter(loc => loc.lat && loc.lng);
    if (validLocations.length < 2) {
      setMapError('Need at least 2 locations with coordinates for routing');
      return;
    }

    setIsRouting(true);
    setMapError(null);

    try {
      const origin = `${validLocations[0].lat},${validLocations[0].lng}`;
      const destination = `${validLocations[validLocations.length - 1].lat},${validLocations[validLocations.length - 1].lng}`;

      // Build via points for middle locations
      const via = validLocations.slice(1, -1).map(loc => `${loc.lat},${loc.lng}`);

      // HERE v8 Routing API parameters (official pattern)
      const routingParameters: any = {
        routingMode: 'fast',
        transportMode: 'truck',
        origin: origin,
        destination: destination,
        return: 'polyline,summary,actions'
      };

      // Add via points if any
      if (via.length > 0) {
        routingParameters.via = new (window as any).H.service.Url.MultiValueQueryParameter(via);
      }

      // Calculate route (official v8 API callback pattern)
      router.calculateRoute(
        routingParameters,
        (result: any) => {
          // Success callback
          if (result.routes && result.routes.length > 0) {
            const route = result.routes[0];
            
            // Clear map
            map.removeObjects(map.getObjects());
            const group = new (window as any).H.map.Group();

            // Add route polyline (official pattern with flexible polyline)
            route.sections.forEach((section: any) => {
              const linestring = (window as any).H.geo.LineString.fromFlexiblePolyline(section.polyline);
              
              const routeLine = new (window as any).H.map.Polyline(linestring, {
                style: { strokeColor: '#0088ff', lineWidth: 5 }
              });
              
              group.addObject(routeLine);
            });

            // Add location markers
            validLocations.forEach((location, index) => {
              const icon = new (window as any).H.map.Icon(
                createMarkerSVG(location.type === 'pickup' ? '#10B981' : '#EF4444', index + 1),
                { size: { w: 32, h: 32 } }
              );

              const marker = new (window as any).H.map.Marker(
                { lat: location.lat!, lng: location.lng! },
                { icon }
              );

              group.addObject(marker);
            });

            map.addObject(group);

            // Fit map to route bounds
            map.getViewModel().setLookAtData({
              bounds: group.getBoundingBox()
            });

            // Calculate route stats
            let totalDistance = 0;
            let totalDuration = 0;

            route.sections.forEach((section: any) => {
              totalDistance += section.summary.length || 0;
              totalDuration += section.summary.duration || 0;
            });

            // Convert to miles and minutes
            const totalMiles = Math.round((totalDistance * 0.000621371) * 100) / 100;
            const totalMinutes = Math.round(totalDuration / 60);

            const routeInfo = {
              totalMiles,
              totalDuration: totalMinutes,
              route: route
            };

            setRouteData(routeInfo);
            
            if (onRouteCalculated) {
              onRouteCalculated(routeInfo);
            }

            console.log('✅ Route calculated successfully:', routeInfo);
          }
        },
        (error: any) => {
          // Error callback
          console.error('❌ Routing error:', error);
          setMapError(`Routing failed: ${error.message || 'Unknown error'}`);
        }
      );

    } catch (error) {
      console.error('Route calculation failed:', error);
      setMapError(error instanceof Error ? error.message : 'Route calculation failed');
    } finally {
      setIsRouting(false);
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
              Truck Route Map (HERE Maps v8)
            </div>
            {showOptimization && locations.length >= 2 && (
              <Button 
                onClick={handleCalculateRoute}
                disabled={isRouting || !isMapLoaded}
                size="sm"
                data-testid="button-calculate-route"
              >
                <Navigation className="h-4 w-4 mr-2" />
                {isRouting ? 'Calculating...' : 'Calculate Route'}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div 
            ref={mapRef} 
            style={{ height }} 
            className="w-full rounded-b-lg"
            data-testid="here-map-container"
          />
          {!isMapLoaded && (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-600">Loading HERE Map...</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Route Results */}
      {routeData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Route className="h-5 w-5 mr-2" />
              Route Details (HERE v8 API)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center">
                  <Route className="h-5 w-5 text-blue-600 mr-2" />
                  <span className="font-medium">Total Distance</span>
                </div>
                <Badge variant="secondary" data-testid="badge-total-miles">{routeData.totalMiles} miles</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <Clock className="h-5 w-5 text-green-600 mr-2" />
                  <span className="font-medium">Est. Time</span>
                </div>
                <Badge variant="secondary" data-testid="badge-total-duration">
                  {Math.floor(routeData.totalDuration / 60)}h {routeData.totalDuration % 60}m
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Location List */}
            <div>
              <h4 className="font-semibold mb-3">Route Stops</h4>
              <div className="space-y-2">
                {locations.filter(loc => loc.lat && loc.lng).map((location, index) => (
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

// Load HERE Maps CSS (official pattern)
function loadHEREMapsCSS() {
  if (document.querySelector('link[href*="mapsjs-ui.css"]')) {
    return; // Already loaded
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = 'https://js.api.here.com/v3/3.1/mapsjs-ui.css';
  document.head.appendChild(link);
  console.log('✅ HERE Maps CSS loaded');
}

// Load HERE Maps API scripts (official pattern)
async function loadHEREMapsAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).H) {
      resolve();
      return;
    }

    // Load core library first
    const coreScript = document.createElement('script');
    coreScript.src = 'https://js.api.here.com/v3/3.1/mapsjs-core.js';
    coreScript.async = true;

    coreScript.onload = () => {
      // Load additional modules in parallel (official pattern)
      Promise.all([
        loadScript('https://js.api.here.com/v3/3.1/mapsjs-service.js'),
        loadScript('https://js.api.here.com/v3/3.1/mapsjs-ui.js'),
        loadScript('https://js.api.here.com/v3/3.1/mapsjs-mapevents.js'),
      ]).then(() => {
        console.log('✅ HERE Maps API loaded successfully (official scripts)');
        resolve();
      }).catch(reject);
    };

    coreScript.onerror = () => {
      reject(new Error('Failed to load HERE Maps core library'));
    };

    document.head.appendChild(coreScript);
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
