import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Cloud } from "lucide-react";

interface DriverRouteMapProps {
  load: any;
  currentLat?: number;
  currentLng?: number;
}

interface WeatherData {
  temp: number;
  description: string;
  icon: string;
}

declare global {
  interface Window {
    H: any;
  }
}

export default function DriverRouteMap({ load, currentLat, currentLng }: DriverRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Fetch weather using HERE Weather API
  const fetchWeather = async (lat: number, lon: number) => {
    const apiKey = import.meta.env.VITE_HERE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("HERE Maps API key not configured");
      return;
    }
    
    try {
      const response = await fetch(
        `https://weather.ls.hereapi.com/weather/1.0/report.json?product=observation&latitude=${lat}&longitude=${lon}&oneobservation=true&apiKey=${apiKey}`
      );
      const data = await response.json();
      const obs = data.observations?.location?.[0]?.observation?.[0];
      if (obs) {
        setWeather({
          temp: Math.round((parseFloat(obs.temperature) * 9/5) + 32), // Convert C to F
          description: obs.description || obs.skyDescription || 'Clear',
          icon: obs.iconName || '01d'
        });
      }
    } catch (error) {
      console.error("Weather fetch error:", error);
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
      const defaultLayers = platform.createDefaultLayers();
      
      const centerLat = currentLat || parseFloat(load.receiverLatitude || '33.0');
      const centerLng = currentLng || parseFloat(load.receiverLongitude || '-97.0');

      const map = new window.H.Map(
        mapRef.current,
        defaultLayers.vector.normal.map,
        {
          center: { lat: centerLat, lng: centerLng },
          zoom: 12,
          pixelRatio: window.devicePixelRatio || 1
        }
      );

      new window.H.mapevents.Behavior(new window.H.mapevents.MapEvents(map));
      window.H.ui.UI.createDefault(map, defaultLayers);
      
      mapInstanceRef.current = map;
    };

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.dispose();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers and route
  useEffect(() => {
    if (!mapInstanceRef.current || !window.H || !load) return;

    const map = mapInstanceRef.current;
    const H = window.H;

    // Clear existing objects
    map.removeObjects(map.getObjects());

    // Add current location marker
    if (currentLat && currentLng) {
      const truckIcon = new H.map.DomIcon(`
        <div style="
          background-color: #8b5cf6;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        ">
          🚛
        </div>
      `);

      const currentMarker = new H.map.DomMarker({ lat: currentLat, lng: currentLng }, { icon: truckIcon });
      map.addObject(currentMarker);

      // Fetch weather for current location
      fetchWeather(currentLat, currentLng);
    }

    // Add destination marker
    if (load.receiverLatitude && load.receiverLongitude) {
      const destLat = parseFloat(load.receiverLatitude);
      const destLng = parseFloat(load.receiverLongitude);

      if (!isNaN(destLat) && !isNaN(destLng)) {
        const destIcon = new H.map.DomIcon(`
          <div style="
            background-color: #ef4444;
            width: 32px;
            height: 32px;
            border-radius: 4px;
            border: 3px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
          ">
            🏭
          </div>
        `);

        const destMarker = new H.map.DomMarker({ lat: destLat, lng: destLng }, { icon: destIcon });
        map.addObject(destMarker);

        // Draw route line if we have current location
        if (currentLat && currentLng) {
          const lineString = new H.geo.LineString();
          lineString.pushPoint({ lat: currentLat, lng: currentLng });
          lineString.pushPoint({ lat: destLat, lng: destLng });

          const polyline = new H.map.Polyline(lineString, {
            style: {
              strokeColor: '#8b5cf6',
              lineWidth: 4,
              lineDash: [8, 4]
            }
          });

          map.addObject(polyline);
        }

        // Fit bounds to show both markers
        if (currentLat && currentLng) {
          const group = new H.map.Group();
          group.addObject(new H.map.Marker({ lat: currentLat, lng: currentLng }));
          group.addObject(new H.map.Marker({ lat: destLat, lng: destLng }));
          map.getViewModel().setLookAtData({ bounds: group.getBounds() }, true);
        } else {
          map.setCenter({ lat: destLat, lng: destLng });
          map.setZoom(12);
        }
      }
    }
  }, [load, currentLat, currentLng]);

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      confirmed: 'bg-blue-500',
      en_route_pickup: 'bg-blue-500',
      at_shipper: 'bg-amber-500',
      left_shipper: 'bg-purple-500',
      en_route_receiver: 'bg-purple-500',
      in_transit: 'bg-purple-500',
      at_receiver: 'bg-emerald-500',
      delivered: 'bg-emerald-600'
    };
    return colors[status] || 'bg-gray-500';
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5" />
            Route Map
          </div>
          <Badge className={getStatusColor(load.status)}>
            {getStatusText(load.status)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div 
          ref={mapRef} 
          className="w-full h-[400px] rounded-lg border"
          data-testid="driver-route-map"
        />
        
        {weather && (
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium">Current Weather</p>
                <p className="text-xs text-gray-600 capitalize">{weather.description}</p>
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {weather.temp}°F
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 mt-0.5 text-gray-500" />
            <div>
              <p className="font-medium">Destination</p>
              <p className="text-gray-600">{load.location?.name}</p>
              <p className="text-xs text-gray-500">
                {load.location?.city}, {load.location?.state}
              </p>
            </div>
          </div>
          
          {load.stops && load.stops.length > 0 && (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 text-amber-500" />
              <div>
                <p className="font-medium">Stops</p>
                <p className="text-gray-600">{load.stops.length} stop(s)</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
