import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Home, MapPin, Navigation, Loader2 } from "lucide-react";

interface ReturnToTerminalProps {
  driverId: string;
  hasActiveLoad: boolean;
}

// Terminal address constant
const TERMINAL_ADDRESS = "1800 Plano Pkwy, Plano, Texas 75079";
const TERMINAL_COORDINATES = {
  lat: 33.0198,
  lng: -96.6989
};

interface RouteData {
  totalMiles: number;
  milesByState: Record<string, number>;
  estimatedTime: number;
}

export function ReturnToTerminal({ driverId, hasActiveLoad }: ReturnToTerminalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isReturning, setIsReturning] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Get current location when component mounts
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  }, []);

  // Mutation to calculate return route
  const calculateRouteMutation = useMutation({
    mutationFn: async () => {
      if (!currentLocation) {
        throw new Error("Current location not available");
      }

      return await apiRequest("/api/return-to-terminal/calculate-route", "POST", {
        currentLat: currentLocation.lat,
        currentLng: currentLocation.lng,
        terminalLat: TERMINAL_COORDINATES.lat,
        terminalLng: TERMINAL_COORDINATES.lng,
        driverId
      });
    },
    onSuccess: (data) => {
      setRouteData(data);
      toast({
        title: "Route Calculated",
        description: `${data.totalMiles.toFixed(1)} miles to terminal`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to calculate route",
        variant: "destructive"
      });
    }
  });

  // Mutation to start return trip and track IFTA miles
  const startReturnTripMutation = useMutation({
    mutationFn: async () => {
      if (!currentLocation || !routeData) {
        throw new Error("Route data not available");
      }

      return await apiRequest("/api/return-to-terminal/start", "POST", {
        currentLat: currentLocation.lat,
        currentLng: currentLocation.lng,
        terminalLat: TERMINAL_COORDINATES.lat,
        terminalLng: TERMINAL_COORDINATES.lng,
        driverId,
        totalMiles: routeData.totalMiles,
        milesByState: routeData.milesByState
      });
    },
    onSuccess: () => {
      toast({
        title: "Return Trip Started",
        description: "IFTA miles are being tracked for your return to terminal"
      });
      setIsReturning(true);
      queryClient.invalidateQueries({ queryKey: [`/api/drivers/${driverId}/loads`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start return trip",
        variant: "destructive"
      });
    }
  });

  const handleCheckboxChange = async (checked: boolean) => {
    if (checked) {
      if (!currentLocation) {
        toast({
          title: "Location Required",
          description: "Please enable location services to calculate route",
          variant: "destructive"
        });
        return;
      }
      
      setIsCalculating(true);
      await calculateRouteMutation.mutateAsync();
      setIsCalculating(false);
    } else {
      setRouteData(null);
    }
  };

  const handleStartReturn = () => {
    startReturnTripMutation.mutate();
  };

  // Don't show if driver has an active load
  if (hasActiveLoad) {
    return null;
  }

  return (
    <Card data-testid="card-return-to-terminal">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          Return to Terminal
        </CardTitle>
        <CardDescription>
          Track IFTA miles for your return trip to the yard
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="return-to-terminal" 
            checked={!!routeData || isReturning}
            onCheckedChange={handleCheckboxChange}
            disabled={isCalculating || isReturning}
            data-testid="checkbox-return-to-terminal"
          />
          <Label 
            htmlFor="return-to-terminal" 
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            No load - Return to terminal
          </Label>
        </div>

        {isCalculating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculating route...
          </div>
        )}

        {routeData && !isReturning && (
          <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium">Terminal Address</p>
                <p className="text-sm text-muted-foreground">{TERMINAL_ADDRESS}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Navigation className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium">Total Distance</p>
                <p className="text-sm text-muted-foreground">{routeData.totalMiles.toFixed(1)} miles</p>
              </div>
            </div>

            {Object.keys(routeData.milesByState).length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">IFTA Miles by State</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(routeData.milesByState).map(([state, miles]) => (
                    <Badge key={state} variant="outline" data-testid={`badge-state-${state}`}>
                      {state}: {miles.toFixed(1)} mi
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Button 
              onClick={handleStartReturn} 
              className="w-full"
              disabled={startReturnTripMutation.isPending}
              data-testid="button-start-return"
            >
              {startReturnTripMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start Return Trip"
              )}
            </Button>
          </div>
        )}

        {isReturning && (
          <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                Return trip in progress - IFTA miles tracking
              </p>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300 mt-2">
              {routeData?.totalMiles.toFixed(1)} miles to {TERMINAL_ADDRESS}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
