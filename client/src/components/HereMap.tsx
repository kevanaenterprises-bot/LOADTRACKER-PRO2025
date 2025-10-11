import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, RefreshCw, Truck, Building2, Cloud, DollarSign } from "lucide-react";

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

interface WeatherData {
  temp: number;
  description: string;
  icon: string;
}

interface FuelPrices {
  [state: string]: number;
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
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showWeather, setShowWeather] = useState(false);
  const [showFuelPrices, setShowFuelPrices] = useState(false);
  const [weather, setWeather] = useState<Map<string, WeatherData>>(new Map());
  const [fuelPrices, setFuelPrices] = useState<FuelPrices>({});
  const platformRef = useRef<any>(null);
  const uiRef = useRef<any>(null);

  // Fetch active loads with GPS data
  const { data: loads, refetch } = useQuery<LoadWithDriverLocation[]>({
    queryKey: ["/api/tracking/loads"],
    refetchInterval: autoRefresh ? 30000 : false,
    refetchIntervalInBackground: true,
  });

  // Fetch weather data for locations
  const fetchWeather = async (lat: number, lon: number, loadId: string) => {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=YOUR_OPENWEATHER_KEY`
      );
      const data = await response.json();
      setWeather(prev => new Map(prev).set(loadId, {
        temp: Math.round(data.main.temp),
        description: data.weather[0].description,
        icon: data.weather[0].icon
      }));
    } catch (error) {
      console.error("Weather fetch error:", error);
    }
  };

  // Fetch diesel fuel prices (EIA API)
  const fetchFuelPrices = async () => {
    try {
      const response = await fetch(
        `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=YOUR_EIA_KEY&frequency=weekly&data[0]=value&facets[product][]=EPD2D&facets[area][]=R10,R20,R30,R40,R50&sort[0][column]=period&sort[0][direction]=desc&length=5`
      );
      const data = await response.json();
      const prices: FuelPrices = {};
      data.response?.data?.forEach((item: any) => {
        prices[item.area] = parseFloat(item.value);
      });
      setFuelPrices(prices);
    } catch (error) {
      console.error("Fuel price fetch error:", error);
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

  // Update markers when loads change
  useEffect(() => {
    if (!mapInstanceRef.current || !loads || !window.H) return;

    const map = mapInstanceRef.current;
    const H = window.H;
    const ui = uiRef.current;

    // Clear existing markers
    markersRef.current.forEach(marker => map.removeObject(marker));
    markersRef.current.clear();

    // Add markers for active loads
    loads.forEach(load => {
      if (!load.currentLatitude || !load.currentLongitude) return;

      const lat = parseFloat(load.currentLatitude);
      const lng = parseFloat(load.currentLongitude);

      if (isNaN(lat) || isNaN(lng)) return;

      // Fetch weather if enabled
      if (showWeather) {
        fetchWeather(lat, lng, load.id);
      }

      // Create truck marker
      const truckIcon = new H.map.DomIcon(`
        <div style="
          background-color: ${getStatusColor(load.status)};
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        ">
          🚛
        </div>
      `);

      const truckMarker = new H.map.DomMarker({ lat, lng }, { icon: truckIcon });
      
      // Create popup content
      const weatherInfo = weather.get(load.id);
      const popupContent = `
        <div style="padding: 12px; min-width: 220px; font-family: system-ui;">
          <h3 style="font-weight: bold; font-size: 18px; margin-bottom: 8px;">Load ${load.number109}</h3>
          <div style="font-size: 14px; line-height: 1.6;">
            <div><strong>Driver:</strong> ${load.driver?.firstName} ${load.driver?.lastName}</div>
            <div><strong>Status:</strong> <span style="color: ${getStatusColor(load.status)}">${getStatusText(load.status)}</span></div>
            <div><strong>Destination:</strong> ${load.location?.name}</div>
            <div><strong>City/State:</strong> ${load.location?.city}, ${load.location?.state}</div>
            ${load.driver?.phoneNumber ? `<div><strong>Phone:</strong> ${load.driver.phoneNumber}</div>` : ''}
            ${weatherInfo ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
              <strong>Weather:</strong> ${weatherInfo.temp}°F, ${weatherInfo.description}
            </div>` : ''}
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

          // Draw route line
          if (['in_transit', 'confirmed', 'en_route_pickup', 'at_shipper', 'left_shipper', 'en_route_receiver'].includes(load.status)) {
            const lineString = new H.geo.LineString();
            lineString.pushPoint({ lat, lng });
            lineString.pushPoint({ lat: destLat, lng: destLng });

            const polyline = new H.map.Polyline(lineString, {
              style: {
                strokeColor: getStatusColor(load.status),
                lineWidth: 3,
                lineDash: [5, 10]
              }
            });

            map.addObject(polyline);
            markersRef.current.set(`line-${load.id}`, polyline);
          }
        }
      }
    });

    // Auto-fit bounds
    if (markersRef.current.size > 0) {
      const markers = Array.from(markersRef.current.values()).filter(m => m instanceof H.map.DomMarker);
      if (markers.length > 0) {
        let bounds = new H.geo.Rect(90, 180, -90, -180);
        markers.forEach(marker => {
          const pos = marker.getGeometry();
          bounds = bounds.mergePoint(pos);
        });
        map.getViewModel().setLookAtData({ bounds }, true);
      }
    }
  }, [loads, showWeather, weather]);

  // Fetch fuel prices when enabled
  useEffect(() => {
    if (showFuelPrices) {
      fetchFuelPrices();
    }
  }, [showFuelPrices]);

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
              variant={showWeather ? "default" : "outline"}
              size="sm"
              onClick={() => setShowWeather(!showWeather)}
              className="flex items-center gap-1"
              data-testid="button-toggle-weather"
            >
              <Cloud className="w-4 h-4" />
              Weather
            </Button>
            <Button
              variant={showFuelPrices ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFuelPrices(!showFuelPrices)}
              className="flex items-center gap-1"
              data-testid="button-toggle-fuel"
            >
              <DollarSign className="w-4 h-4" />
              Fuel
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

              {showFuelPrices && Object.keys(fuelPrices).length > 0 && (
                <div className="mt-6 p-3 bg-blue-50 rounded-lg">
                  <h4 className="font-medium mb-2 text-sm flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    Diesel Prices
                  </h4>
                  <div className="space-y-1 text-xs">
                    {Object.entries(fuelPrices).slice(0, 5).map(([region, price]) => (
                      <div key={region} className="flex justify-between">
                        <span>{region}</span>
                        <span className="font-medium">${price.toFixed(2)}/gal</span>
                      </div>
                    ))}
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
