import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Truck, MapPin, Clock, Route, Zap, Navigation } from "lucide-react";

interface Location {
  lat: number;
  lng: number;
  address?: string;
}

interface TrackingEvent {
  driverId: string;
  loadId: string;
  eventType: 'pickup_arrived' | 'pickup_departed' | 'delivery_arrived' | 'delivery_departed' | 'en_route';
  location: Location;
  timestamp: Date;
}

interface RouteData {
  route: any;
  distance: number;
  duration: number;
  instructions: string[];
}

interface ETAData {
  etaMinutes: number;
  distanceRemaining: number;
  trafficDelay: number;
}

interface TrackingDashboardProps {
  loadId: string;
  driverId?: string;
  onClose?: () => void;
}

export function TrackingDashboard({ loadId, driverId, onClose }: TrackingDashboardProps) {
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [etaData, setETAData] = useState<ETAData | null>(null);
  const queryClient = useQueryClient();

  // Get load details
  const { data: loads = [] } = useQuery<any[]>({
    queryKey: ["/api/loads"],
    queryFn: () => apiRequest("/api/loads", "GET"),
  });

  const currentLoad = loads.find(load => load.id === loadId);

  // Start tracking mutation
  const startTrackingMutation = useMutation({
    mutationFn: async () => {
      if (!driverId) throw new Error('Driver ID required');
      return await apiRequest(`/api/tracking/start/${driverId}/${loadId}`, "POST");
    },
    onSuccess: () => {
      setIsTracking(true);
      console.log("🚛 Tracking started successfully");
    },
    onError: (error) => {
      console.error("❌ Failed to start tracking:", error);
    }
  });

  // Update location mutation
  const updateLocationMutation = useMutation({
    mutationFn: async (location: Location) => {
      if (!driverId) throw new Error('Driver ID required');
      return await apiRequest("/api/tracking/location", "POST", {
        driverId,
        loadId,
        location
      });
    },
    onSuccess: (data) => {
      console.log("📍 Location updated:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    }
  });

  // Calculate route mutation
  const calculateRouteMutation = useMutation({
    mutationFn: async ({ pickup, delivery }: { pickup: Location; delivery: Location }) => {
      return await apiRequest("/api/tracking/route", "POST", {
        pickup,
        delivery
      });
    },
    onSuccess: (data) => {
      setRouteData(data.route);
      console.log("🗺️ Route calculated:", data);
    }
  });

  // Calculate ETA mutation
  const calculateETAMutation = useMutation({
    mutationFn: async ({ currentLocation, destination }: { currentLocation: Location; destination: Location }) => {
      return await apiRequest("/api/tracking/eta", "POST", {
        currentLocation,
        destination
      });
    },
    onSuccess: (data) => {
      setETAData(data.eta);
      console.log("⏱️ ETA calculated:", data);
    }
  });

  // Get current location using GPS
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      console.error("❌ Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: Location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setCurrentLocation(location);
        
        if (isTracking) {
          updateLocationMutation.mutate(location);
        }
      },
      (error) => {
        console.error("❌ Failed to get location:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // Auto-track location every 30 seconds when tracking is active
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isTracking) {
      getCurrentLocation(); // Get initial location
      interval = setInterval(getCurrentLocation, 30000); // Update every 30 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTracking]);

  // Calculate route when load details are available
  useEffect(() => {
    if (currentLoad && currentLoad.shipperLatitude && currentLoad.receiverLatitude) {
      const pickup: Location = {
        lat: parseFloat(currentLoad.shipperLatitude),
        lng: parseFloat(currentLoad.shipperLongitude)
      };
      const delivery: Location = {
        lat: parseFloat(currentLoad.receiverLatitude),
        lng: parseFloat(currentLoad.receiverLongitude)
      };
      
      calculateRouteMutation.mutate({ pickup, delivery });
    }
  }, [currentLoad]);

  // Calculate ETA when current location changes
  useEffect(() => {
    if (currentLocation && currentLoad && currentLoad.receiverLatitude) {
      const destination: Location = {
        lat: parseFloat(currentLoad.receiverLatitude),
        lng: parseFloat(currentLoad.receiverLongitude)
      };
      
      calculateETAMutation.mutate({ currentLocation, destination });
    }
  }, [currentLocation, currentLoad]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned': return 'bg-blue-500';
      case 'at_shipper': return 'bg-orange-500';
      case 'left_shipper': return 'bg-yellow-500';
      case 'at_receiver': return 'bg-green-500';
      case 'delivered': return 'bg-emerald-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatDistance = (meters: number) => {
    const miles = meters * 0.000621371;
    return `${miles.toFixed(1)} mi`;
  };

  if (!currentLoad) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-6 text-center">
          <p>Load not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" />
            Load Tracking - {currentLoad.loadNumber || currentLoad.number109}
          </CardTitle>
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge className={`${getStatusColor(currentLoad.status)} text-white`}>
              {currentLoad.status || 'Unknown'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Driver: {currentLoad.driver ? `${currentLoad.driver.firstName} ${currentLoad.driver.lastName}` : 'Unassigned'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Tracking Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Tracking Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {!isTracking ? (
              <Button 
                onClick={() => startTrackingMutation.mutate()}
                disabled={!driverId || startTrackingMutation.isPending}
                className="flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Start Tracking
              </Button>
            ) : (
              <Button 
                variant="destructive"
                onClick={() => setIsTracking(false)}
                className="flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Stop Tracking
              </Button>
            )}
            
            <Button 
              variant="outline"
              onClick={getCurrentLocation}
              disabled={updateLocationMutation.isPending}
              className="flex items-center gap-2"
            >
              <MapPin className="h-4 w-4" />
              Update Location
            </Button>
          </div>

          {isTracking && (
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md">
              <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                Live tracking active - location updates every 30 seconds
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Location & ETA */}
      {(currentLocation || (currentLoad.currentLatitude && currentLoad.currentLongitude)) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Current Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-2">Current Location</h4>
                <p className="text-sm text-muted-foreground">
                  {currentLocation 
                    ? `${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)}`
                    : `${parseFloat(currentLoad.currentLatitude).toFixed(6)}, ${parseFloat(currentLoad.currentLongitude).toFixed(6)}`
                  }
                </p>
              </div>
              
              {etaData && (
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    ETA to Delivery
                  </h4>
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-blue-600">
                      {etaData.etaMinutes} minutes
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDistance(etaData.distanceRemaining)} remaining
                    </p>
                    {etaData.trafficDelay > 0 && (
                      <p className="text-sm text-orange-600">
                        +{Math.round(etaData.trafficDelay / 60)}min traffic delay
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Route Information */}
      {routeData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5" />
              Route Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-2">Total Distance</h4>
                <p className="text-lg font-bold">{formatDistance(routeData.distance)}</p>
              </div>
              <div>
                <h4 className="font-medium mb-2">Estimated Duration</h4>
                <p className="text-lg font-bold">{formatDuration(routeData.duration)}</p>
              </div>
            </div>
            
            {routeData.instructions && routeData.instructions.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Route Instructions</h4>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {routeData.instructions.slice(0, 5).map((instruction, index) => (
                    <p key={index} className="text-sm text-muted-foreground">
                      {index + 1}. {instruction}
                    </p>
                  ))}
                  {routeData.instructions.length > 5 && (
                    <p className="text-sm text-muted-foreground italic">
                      +{routeData.instructions.length - 5} more instructions...
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Load Details */}
      <Card>
        <CardHeader>
          <CardTitle>Load Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Pickup</h4>
              <p className="text-sm">{currentLoad.shipperName}</p>
              <p className="text-sm text-muted-foreground">{currentLoad.shipperAddress}</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Delivery</h4>
              <p className="text-sm">{currentLoad.receiverName}</p>
              <p className="text-sm text-muted-foreground">{currentLoad.receiverAddress}</p>
            </div>
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">Rate:</span> ${currentLoad.tripRate || 'N/A'}
            </div>
            <div>
              <span className="font-medium">Miles:</span> {currentLoad.estimatedMiles || 'N/A'}
            </div>
            <div>
              <span className="font-medium">Truck:</span> {currentLoad.truckNumber || 'N/A'}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}