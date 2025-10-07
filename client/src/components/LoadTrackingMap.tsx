import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, RefreshCw, Truck, Building2 } from "lucide-react";

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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

export default function LoadTrackingMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch active loads with GPS data
  const { data: loads, refetch } = useQuery<LoadWithDriverLocation[]>({
    queryKey: ["/api/tracking/loads"],
    refetchInterval: autoRefresh ? 30000 : false, // Refresh every 30 seconds
    refetchIntervalInBackground: true,
  });

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Create map centered on Texas (Go Farms location)
    const map = L.map(mapRef.current).setView([33.0, -97.0], 7);

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Custom icons for different markers
  const createTruckIcon = (status: string) => {
    const color = getStatusColor(status);
    return L.divIcon({
      className: 'custom-truck-icon',
      html: `
        <div style="
          background-color: ${color};
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: white;
        ">
          🚛
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  };

  const createDestinationIcon = () => {
    return L.divIcon({
      className: 'custom-destination-icon',
      html: `
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
          color: white;
        ">
          🏭
        </div>
      `,
      iconSize: [25, 25],
      iconAnchor: [12, 12],
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
      case 'en_route_pickup':
        return '#3b82f6'; // blue
      case 'at_shipper':
        return '#f59e0b'; // amber
      case 'left_shipper':
      case 'en_route_receiver':
        return '#8b5cf6'; // purple
      case 'at_receiver':
        return '#10b981'; // emerald
      case 'delivered':
        return '#059669'; // emerald-600
      default:
        return '#6b7280'; // gray
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmed';
      case 'en_route_pickup':
        return 'En Route to Pickup';
      case 'at_shipper':
        return 'At Shipper';
      case 'left_shipper':
        return 'Left Shipper';
      case 'en_route_receiver':
        return 'En Route to Delivery';
      case 'at_receiver':
        return 'At Receiver';
      case 'delivered':
        return 'Delivered';
      default:
        return status;
    }
  };

  // Update map markers when loads data changes
  useEffect(() => {
    if (!mapInstanceRef.current || !loads) return;

    const map = mapInstanceRef.current;
    const markers = markersRef.current;

    // Clear existing markers
    markers.forEach(marker => marker.remove());
    markers.clear();

    // Add markers for active loads with GPS data
    loads.forEach(load => {
      if (!load.currentLatitude || !load.currentLongitude) return;

      const lat = parseFloat(load.currentLatitude);
      const lng = parseFloat(load.currentLongitude);

      if (isNaN(lat) || isNaN(lng)) return;

      // Create truck marker for driver location
      const truckMarker = L.marker([lat, lng], {
        icon: createTruckIcon(load.status)
      }).addTo(map);

      // Create popup content
      const popupContent = `
        <div class="p-3 min-w-[200px]">
          <h3 class="font-bold text-lg mb-2">Load ${load.number109}</h3>
          <div class="space-y-1 text-sm">
            <div><strong>Driver:</strong> ${load.driver?.firstName} ${load.driver?.lastName}</div>
            <div><strong>Status:</strong> <span style="color: ${getStatusColor(load.status)}">${getStatusText(load.status)}</span></div>
            <div><strong>Destination:</strong> ${load.location?.name}</div>
            <div><strong>City/State:</strong> ${load.location?.city}, ${load.location?.state}</div>
            ${load.driver?.phoneNumber ? `<div><strong>Phone:</strong> ${load.driver.phoneNumber}</div>` : ''}
          </div>
        </div>
      `;

      truckMarker.bindPopup(popupContent);
      markers.set(`truck-${load.id}`, truckMarker);

      // Add destination marker if receiver coordinates exist
      if (load.receiverLatitude && load.receiverLongitude) {
        const destLat = parseFloat(load.receiverLatitude);
        const destLng = parseFloat(load.receiverLongitude);

        if (!isNaN(destLat) && !isNaN(destLng)) {
          const destMarker = L.marker([destLat, destLng], {
            icon: createDestinationIcon()
          }).addTo(map);

          const destPopupContent = `
            <div class="p-3">
              <h3 class="font-bold text-lg mb-2">Destination</h3>
              <div class="space-y-1 text-sm">
                <div><strong>Location:</strong> ${load.location?.name}</div>
                <div><strong>City/State:</strong> ${load.location?.city}, ${load.location?.state}</div>
                <div><strong>For Load:</strong> ${load.number109}</div>
              </div>
            </div>
          `;

          destMarker.bindPopup(destPopupContent);
          markers.set(`dest-${load.id}`, destMarker);

          // Draw line between truck and destination for active loads
          if (['in_progress', 'in_transit', 'confirmed', 'en_route_pickup', 'at_shipper', 'left_shipper', 'en_route_receiver'].includes(load.status)) {
            const polyline = L.polyline([[lat, lng], [destLat, destLng]], {
              color: getStatusColor(load.status),
              weight: 2,
              opacity: 0.6,
              dashArray: '5, 10'
            }).addTo(map);

            markers.set(`line-${load.id}`, polyline as any);
          }
        }
      }
    });

    // Auto-fit map to show all markers if there are any
    if (markers.size > 0) {
      const group = new L.FeatureGroup(Array.from(markers.values()).filter(m => m instanceof L.Marker));
      if (group.getLayers().length > 0) {
        map.fitBounds(group.getBounds().pad(0.1));
      }
    }
  }, [loads]);

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
            Real-Time Load Tracking
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="flex items-center gap-1"
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              Auto {autoRefresh ? 'ON' : 'OFF'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Map */}
            <div className="lg:col-span-3">
              <div 
                ref={mapRef} 
                className="w-full h-[600px] rounded-lg border"
                style={{ minHeight: '600px' }}
              />
            </div>

            {/* Load List */}
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
                    <Card key={load.id} className="p-3">
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

              {/* Legend */}
              <div className="mt-6 p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2 text-sm">Map Legend</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span>En Route</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    <span>At Shipper</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    <span>In Transit</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <span>At Receiver</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-red-500"></div>
                    <span>Destination</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}