import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, RefreshCw, Truck, Building2, AlertTriangle } from "lucide-react";

interface LoadWithDriverLocation {
  id: string;
  number109: string;
  status: string;
  currentLatitude?: string;
  currentLongitude?: string;
  trackingEnabled: boolean;
  driver?: {
    id: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
  };
  location?: {
    id: string;
    name: string;
    city: string;
    state: string;
  };
  receiverLatitude?: string;
  receiverLongitude?: string;
  shipperLatitude?: string;
  shipperLongitude?: string;
}

interface WazeAlert {
  type: string; // ACCIDENT, HAZARD, POLICE, etc.
  subtype?: string;
  latitude: number;
  longitude: number;
  reportDescription?: string;
  street?: string;
  city?: string;
  reliability?: number;
}

declare global {
  interface Window {
    H: any;
  }
}

export default function HereMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const alertMarkersRef = useRef<Map<string, any>>(new Map());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showWazeAlerts, setShowWazeAlerts] = useState(false);
  const [wazeAlerts, setWazeAlerts] = useState<WazeAlert[]>([]);
  const platformRef = useRef<any>(null);
  const uiRef = useRef<any>(null);

  // Fetch active loads with GPS data
  const { data: loads, refetch } = useQuery<LoadWithDriverLocation[]>({
    queryKey: ["/api/tracking/loads"],
    refetchInterval: autoRefresh ? 30000 : false,
    refetchIntervalInBackground: true,
  });

  // Fetch real-time traffic alerts via WAZE API (RapidAPI)
  const fetchWazeAlerts = async () => {
    if (!loads || loads.length === 0 || !showWazeAlerts) {
      return;
    }
    
    try {
      // Get average position of all active loads for regional alert search
      const activeLocs = loads.filter(l => {
        if (!l.currentLatitude || !l.currentLongitude) return false;
        const lat = parseFloat(l.currentLatitude);
        const lng = parseFloat(l.currentLongitude);
        // Skip invalid or null island (0, 0) coordinates
        return !isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0);
      });
      if (activeLocs.length === 0) return;
      
      const avgLat = activeLocs.reduce((sum, l) => sum + parseFloat(l.currentLatitude!), 0) / activeLocs.length;
      const avgLng = activeLocs.reduce((sum, l) => sum + parseFloat(l.currentLongitude!), 0) / activeLocs.length;
      
      console.log(`🚨 Fetching WAZE traffic alerts for region: ${avgLat.toFixed(4)}, ${avgLng.toFixed(4)}`);
      
      const response = await fetch(
        `/api/waze/alerts?latitude=${avgLat}&longitude=${avgLng}&radius=50`,
        { credentials: 'include' }
      );
      
      if (!response.ok) {
        console.warn('WAZE API unavailable');
        return;
      }
      
      const data = await response.json();
      
      if (data.alerts && data.alerts.length > 0) {
        console.log(`✅ Got ${data.alerts.length} WAZE traffic alerts`);
        setWazeAlerts(data.alerts);
      } else {
        console.log(`ℹ️ ${data.message || 'No traffic alerts in this area'}`);
        setWazeAlerts([]);
      }
    } catch (error) {
      console.error("WAZE alerts error:", error);
      setWazeAlerts([]);
    }
  };

  // Initialize HERE Map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const apiKey = import.meta.env.VITE_HERE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("HERE Maps API key not found");
      return;
    }

    // Load HERE Maps script
    const script = document.createElement('script');
    script.src = 'https://js.api.here.com/v3/3.1/mapsjs-core.js';
    script.async = true;
    script.onload = () => {
      const serviceScript = document.createElement('script');
      serviceScript.src = 'https://js.api.here.com/v3/3.1/mapsjs-service.js';
      serviceScript.async = true;
      serviceScript.onload = () => {
        const uiScript = document.createElement('script');
        uiScript.src = 'https://js.api.here.com/v3/3.1/mapsjs-ui.js';
        uiScript.async = true;
        uiScript.onload = () => {
          const eventsScript = document.createElement('script');
          eventsScript.src = 'https://js.api.here.com/v3/3.1/mapsjs-mapevents.js';
          eventsScript.async = true;
          eventsScript.onload = initializeMap;
          document.head.appendChild(eventsScript);
        };
        document.head.appendChild(uiScript);
      };
      document.head.appendChild(serviceScript);
    };
    document.head.appendChild(script);

    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://js.api.here.com/v3/3.1/mapsjs-ui.css';
    document.head.appendChild(cssLink);

    const initializeMap = () => {
      if (!window.H || !mapRef.current) return;

      const platform = new window.H.service.Platform({ apikey: apiKey });
      platformRef.current = platform;
      
      const defaultLayers = platform.createDefaultLayers();
      const map = new window.H.Map(
        mapRef.current,
        defaultLayers.vector.normal.map,
        {
          center: { lat: 33.0, lng: -97.0 },
          zoom: 7,
          pixelRatio: window.devicePixelRatio || 1
        }
      );

      const behavior = new window.H.mapevents.Behavior(
        new window.H.mapevents.MapEvents(map)
      );
      
      const ui = window.H.ui.UI.createDefault(map, defaultLayers);
      uiRef.current = ui;
      
      mapInstanceRef.current = map;
    };

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.dispose();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
      case 'en_route_pickup':
        return '#3b82f6';
      case 'at_shipper':
        return '#f59e0b';
      case 'left_shipper':
      case 'en_route_receiver':
      case 'in_transit':
        return '#8b5cf6';
      case 'at_receiver':
        return '#10b981';
      case 'delivered':
        return '#059669';
      default:
        return '#6b7280';
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: { [key: string]: string } = {
      confirmed: 'Confirmed',
      en_route_pickup: 'En Route to Pickup',
      at_shipper: 'At Shipper',
      left_shipper: 'Left Shipper',
      en_route_receiver: 'En Route to Delivery',
      in_transit: 'In Transit',
      at_receiver: 'At Receiver',
      delivered: 'Delivered'
    };
    return statusMap[status] || status;
  };

  // Calculate and display truck route using HERE Routing API v8
  const calculateTruckRoute = async (loadId: string, fromLat: number, fromLng: number, toLat: number, toLng: number, map: any, H: any) => {
    const apiKey = import.meta.env.VITE_HERE_MAPS_API_KEY;
    const load = loads?.find(l => l.id === loadId);
    const routeColor = load ? getStatusColor(load.status) : '#3b82f6';

    // Helper to draw fallback straight line
    const drawFallbackLine = (reason: string) => {
      console.log(`⚠️ Using fallback route for load ${loadId}: ${reason}`);
      const lineString = new H.geo.LineString();
      lineString.pushPoint({ lat: fromLat, lng: fromLng });
      lineString.pushPoint({ lat: toLat, lng: toLng });
      
      const fallbackLine = new H.map.Polyline(lineString, {
        style: {
          strokeColor: routeColor,
          lineWidth: 3,
          lineDash: [5, 10]
        }
      });
      
      map.addObject(fallbackLine);
      markersRef.current.set(`route-${loadId}`, fallbackLine);
    };

    // No API key - use fallback
    if (!apiKey) {
      drawFallbackLine('No HERE Maps API key configured');
      return;
    }

    try {
      // HERE Routing API v8 for truck routing
      const url = 'https://router.hereapi.com/v8/routes';
      const params = new URLSearchParams({
        apikey: apiKey,
        transportMode: 'truck',
        origin: `${fromLat},${fromLng}`,
        destination: `${toLat},${toLng}`,
        return: 'polyline,summary'
      });

      const response = await fetch(`${url}?${params}`);
      
      // Check if response is OK
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`HERE Routing API error ${response.status}:`, errorData);
        drawFallbackLine(`API returned ${response.status}`);
        return;
      }

      const data = await response.json();

      // Check if we got valid route data
      if (!data.routes || data.routes.length === 0) {
        console.warn(`No routes returned for load ${loadId}`);
        drawFallbackLine('No routes found');
        return;
      }

      const route = data.routes[0];
      const section = route.sections[0];
      
      // Validate section has polyline
      if (!section || !section.polyline) {
        drawFallbackLine('Invalid route data');
        return;
      }
      
      // Decode the flexible polyline
      const lineString = H.geo.LineString.fromFlexiblePolyline(section.polyline);
      
      // Create polyline for the route
      const routeLine = new H.map.Polyline(lineString, {
        style: {
          strokeColor: routeColor,
          lineWidth: 4,
          lineDash: [0, 0] // Solid line for actual route
        }
      });

      map.addObject(routeLine);
      markersRef.current.set(`route-${loadId}`, routeLine);
      
      const miles = section.summary?.length ? (section.summary.length / 1609.34).toFixed(1) : '?';
      console.log(`🛣️ Calculated truck route for load ${loadId}: ${miles} miles`);
    } catch (error) {
      console.error(`Failed to calculate route for load ${loadId}:`, error);
      drawFallbackLine('Network or parsing error');
    }
  };

  // Update markers when loads change
  useEffect(() => {
    if (!mapInstanceRef.current || !loads || !window.H) return;

    const map = mapInstanceRef.current;
    const H = window.H;
    const ui = uiRef.current;

    // Clear existing markers
    markersRef.current.forEach(marker => map.removeObject(marker));
    markersRef.current.clear();

    // Track valid coordinates for bounds calculation
    const validCoords: { lat: number; lng: number }[] = [];

    // Add markers for active loads
    loads.forEach(load => {
      if (!load.currentLatitude || !load.currentLongitude) return;

      const lat = parseFloat(load.currentLatitude);
      const lng = parseFloat(load.currentLongitude);

      // Skip invalid or null island (0, 0) coordinates
      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
        console.warn(`Skipping invalid coordinates for load ${load.number109}: ${lat}, ${lng}`);
        return;
      }

      // Add to valid coords
      validCoords.push({ lat, lng });

      // Create truck marker with driver name label
      const driverInitials = load.driver 
        ? `${load.driver.firstName.charAt(0)}${load.driver.lastName.charAt(0)}`
        : '?';
      const driverName = load.driver 
        ? `${load.driver.firstName} ${load.driver.lastName}`
        : 'Unknown Driver';
      
      const truckIcon = new H.map.DomIcon(`
        <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
          <div style="
            background-color: ${getStatusColor(load.status)};
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
          ">
            🚛
          </div>
          <div style="
            background-color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
            color: #1f2937;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            white-space: nowrap;
          ">
            ${driverName}
          </div>
        </div>
      `);

      const truckMarker = new H.map.DomMarker({ lat, lng }, { icon: truckIcon });
      
      // Create popup content
      const popupContent = `
        <div style="padding: 12px; min-width: 220px; font-family: system-ui;">
          <h3 style="font-weight: bold; font-size: 18px; margin-bottom: 8px;">Load ${load.number109}</h3>
          <div style="font-size: 14px; line-height: 1.6;">
            <div><strong>Driver:</strong> ${load.driver?.firstName} ${load.driver?.lastName}</div>
            <div><strong>Status:</strong> <span style="color: ${getStatusColor(load.status)}">${getStatusText(load.status)}</span></div>
            <div><strong>Destination:</strong> ${load.location?.name}</div>
            <div><strong>City/State:</strong> ${load.location?.city}, ${load.location?.state}</div>
            ${load.driver?.phoneNumber ? `<div><strong>Phone:</strong> ${load.driver.phoneNumber}</div>` : ''}
          </div>
        </div>
      `;

      truckMarker.addEventListener('tap', () => {
        if (ui) {
          const bubble = new H.ui.InfoBubble({ lat, lng }, {
            content: popupContent
          });
          ui.addBubble(bubble);
        }
      });

      map.addObject(truckMarker);
      markersRef.current.set(`truck-${load.id}`, truckMarker);

      // Add destination marker
      if (load.receiverLatitude && load.receiverLongitude) {
        const destLat = parseFloat(load.receiverLatitude);
        const destLng = parseFloat(load.receiverLongitude);

        if (!isNaN(destLat) && !isNaN(destLng)) {
          validCoords.push({ lat: destLat, lng: destLng });

          const destIcon = new H.map.DomIcon(`
            <div style="
              background-color: #ef4444;
              width: 25px;
              height: 25px;
              border-radius: 3px;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
            ">
              🏭
            </div>
          `);

          const destMarker = new H.map.DomMarker({ lat: destLat, lng: destLng }, { icon: destIcon });
          map.addObject(destMarker);
          markersRef.current.set(`dest-${load.id}`, destMarker);

          // Calculate and draw actual truck route using HERE Routing API
          if (['in_transit', 'confirmed', 'en_route_pickup', 'at_shipper', 'left_shipper', 'en_route_receiver'].includes(load.status)) {
            calculateTruckRoute(load.id, lat, lng, destLat, destLng, map, H);
          }
        }
      }
    });

    // Auto-fit bounds ONLY if we have valid coordinates
    if (validCoords.length > 0) {
      console.log(`📍 Fitting map to ${validCoords.length} valid coordinate(s)`);
      
      // Calculate proper bounding box from valid coordinates
      let minLat = validCoords[0].lat;
      let maxLat = validCoords[0].lat;
      let minLng = validCoords[0].lng;
      let maxLng = validCoords[0].lng;

      validCoords.forEach(coord => {
        minLat = Math.min(minLat, coord.lat);
        maxLat = Math.max(maxLat, coord.lat);
        minLng = Math.min(minLng, coord.lng);
        maxLng = Math.max(maxLng, coord.lng);
      });

      // Add padding to bounds (10%)
      const latPadding = (maxLat - minLat) * 0.1 || 0.1;
      const lngPadding = (maxLng - minLng) * 0.1 || 0.1;

      const bounds = new H.geo.Rect(
        maxLat + latPadding,  // top
        minLng - lngPadding,  // left
        minLat - latPadding,  // bottom
        maxLng + lngPadding   // right
      );

      console.log(`📍 Map bounds: top=${bounds.getTop()}, left=${bounds.getLeft()}, bottom=${bounds.getBottom()}, right=${bounds.getRight()}`);
      
      map.getViewModel().setLookAtData({ bounds }, true);
    } else {
      console.warn('⚠️ No valid GPS coordinates found - map not centered');
    }
  }, [loads]);

  // Fetch WAZE alerts when enabled and add markers to map
  useEffect(() => {
    if (showWazeAlerts && loads && loads.length > 0) {
      fetchWazeAlerts();
    }
  }, [showWazeAlerts, loads]);

  // Render WAZE alert markers on map
  useEffect(() => {
    if (!mapInstanceRef.current || !window.H || !uiRef.current) return;
    
    const map = mapInstanceRef.current;
    const H = window.H;
    const ui = uiRef.current;
    
    // Clear existing alert markers
    alertMarkersRef.current.forEach(marker => map.removeObject(marker));
    alertMarkersRef.current.clear();
    
    if (!showWazeAlerts || wazeAlerts.length === 0) return;
    
    // Add WAZE alert markers
    wazeAlerts.forEach((alert, index) => {
      const alertIcon = new H.map.DomIcon(`
        <div style="
          background-color: ${alert.type === 'ACCIDENT' ? '#ef4444' : alert.type === 'HAZARD' ? '#f59e0b' : '#3b82f6'};
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        ">
          ${alert.type === 'ACCIDENT' ? '🚗' : alert.type === 'HAZARD' ? '⚠️' : '🚔'}
        </div>
      `);
      
      const alertMarker = new H.map.DomMarker(
        { lat: alert.latitude, lng: alert.longitude },
        { icon: alertIcon }
      );
      
      const alertContent = `
        <div style="padding: 10px; min-width: 180px;">
          <h4 style="font-weight: bold; margin-bottom: 6px; color: ${alert.type === 'ACCIDENT' ? '#ef4444' : alert.type === 'HAZARD' ? '#f59e0b' : '#3b82f6'}">
            ${alert.type}${alert.subtype ? ` - ${alert.subtype}` : ''}
          </h4>
          <div style="font-size: 13px;">
            ${alert.reportDescription ? `<div><strong>Report:</strong> ${alert.reportDescription}</div>` : ''}
            ${alert.street ? `<div><strong>Location:</strong> ${alert.street}</div>` : ''}
            ${alert.city ? `<div><strong>City:</strong> ${alert.city}</div>` : ''}
          </div>
        </div>
      `;
      
      alertMarker.addEventListener('tap', () => {
        const bubble = new H.ui.InfoBubble(
          { lat: alert.latitude, lng: alert.longitude },
          { content: alertContent }
        );
        ui.addBubble(bubble);
      });
      
      map.addObject(alertMarker);
      alertMarkersRef.current.set(`alert-${index}`, alertMarker);
    });
  }, [showWazeAlerts, wazeAlerts]);

  const activeLoads = loads?.filter(load => 
    load.trackingEnabled && 
    load.currentLatitude && 
    load.currentLongitude &&
    ['in_progress', 'in_transit', 'confirmed', 'en_route_pickup', 'at_shipper', 'left_shipper', 'en_route_receiver', 'at_receiver'].includes(load.status)
  ) || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Navigation className="w-5 h-5" />
            Real-Time Fleet Tracking
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={showWazeAlerts ? "default" : "outline"}
              size="sm"
              onClick={() => setShowWazeAlerts(!showWazeAlerts)}
              className="flex items-center gap-1"
              data-testid="button-toggle-waze"
            >
              <AlertTriangle className="w-4 h-4" />
              Traffic Alerts
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="flex items-center gap-1"
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="flex items-center gap-1"
              data-testid="button-auto-refresh"
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              Auto {autoRefresh ? 'ON' : 'OFF'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3">
              <div 
                ref={mapRef} 
                className="w-full h-[600px] rounded-lg border"
                style={{ minHeight: '600px' }}
                data-testid="here-map-container"
              />
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Active Loads ({activeLoads.length})
              </h3>
              
              {activeLoads.length === 0 ? (
                <div className="text-center p-4 text-gray-500 border rounded-lg">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active loads with GPS tracking</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {activeLoads.map(load => (
                    <Card key={load.id} className="p-3" data-testid={`load-card-${load.id}`}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{load.number109}</span>
                          <Badge 
                            style={{ backgroundColor: getStatusColor(load.status) }}
                            className="text-white text-xs"
                          >
                            {getStatusText(load.status)}
                          </Badge>
                        </div>
                        
                        <div className="text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            {load.driver?.firstName} {load.driver?.lastName}
                          </div>
                          <div className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {load.location?.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {load.location?.city}, {load.location?.state}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {showWazeAlerts && wazeAlerts.length > 0 && (
                <div className="mt-6 p-3 bg-orange-50 rounded-lg">
                  <h4 className="font-medium mb-2 text-sm flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                    WAZE Traffic Alerts ({wazeAlerts.length})
                  </h4>
                  <div className="space-y-2 text-xs">
                    {wazeAlerts.slice(0, 5).map((alert, idx) => (
                      <div key={idx} className="border-b pb-2 last:border-0">
                        <div className="font-medium flex items-center gap-1">
                          <span style={{
                            color: alert.type === 'ACCIDENT' ? '#ef4444' : alert.type === 'HAZARD' ? '#f59e0b' : '#3b82f6'
                          }}>
                            {alert.type === 'ACCIDENT' ? '🚗' : alert.type === 'HAZARD' ? '⚠️' : '🚔'}
                          </span>
                          {alert.type}{alert.subtype ? ` - ${alert.subtype}` : ''}
                        </div>
                        {alert.street && <div className="text-gray-600 ml-5">{alert.street}</div>}
                        {alert.reportDescription && (
                          <div className="text-gray-500 ml-5 italic">{alert.reportDescription}</div>
                        )}
                      </div>
                    ))}
                    {wazeAlerts.length > 5 && (
                      <div className="text-center text-gray-500 pt-1">
                        +{wazeAlerts.length - 5} more alerts on map
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
