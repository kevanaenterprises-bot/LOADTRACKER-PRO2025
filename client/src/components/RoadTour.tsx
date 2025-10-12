import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Radio, MapPin, Volume2, VolumeX } from "lucide-react";

interface HistoricalMarker {
  id: number;
  title: string;
  inscription: string;
  latitude: string;
  longitude: string;
  state: string;
  city: string;
  category: string;
  distance?: number;
}

interface RoadTourProps {
  driverId: string;
  loadId?: string;
}

export function RoadTour({ driverId, loadId }: RoadTourProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [nearbyMarkers, setNearbyMarkers] = useState<HistoricalMarker[]>([]);
  const [lastSpokenMarkerId, setLastSpokenMarkerId] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const speechSynthRef = useRef<SpeechSynthesis | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if Web Speech API is supported
  const isSpeechSupported = 'speechSynthesis' in window;

  // Get road tour status
  const { data: tourStatus } = useQuery<{ enabled: boolean; lastHeardMarkerId: string | null }>({
    queryKey: [`/api/road-tour/status/${driverId}`],
    enabled: !!driverId,
  });

  useEffect(() => {
    if (tourStatus) {
      setIsEnabled(tourStatus.enabled);
      setLastSpokenMarkerId(tourStatus.lastHeardMarkerId ? parseInt(tourStatus.lastHeardMarkerId) : null);
    }
  }, [tourStatus]);

  // Initialize speech synthesis
  useEffect(() => {
    if (isSpeechSupported) {
      speechSynthRef.current = window.speechSynthesis;
    }
  }, [isSpeechSupported]);

  // Toggle road tour
  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest('/api/road-tour/toggle', 'POST', { driverId, enabled });
    },
    onSuccess: (data) => {
      setIsEnabled(data.roadTourEnabled);
      queryClient.invalidateQueries({ queryKey: [`/api/road-tour/status/${driverId}`] });
      toast({
        title: data.roadTourEnabled ? "Road Tour Enabled" : "Road Tour Disabled",
        description: data.roadTourEnabled 
          ? "You'll hear historical markers as you drive past them"
          : "Historical marker audio is now off",
      });
    },
  });

  // Mark marker as heard
  const markHeardMutation = useMutation({
    mutationFn: async (markerId: number) => {
      return apiRequest('/api/road-tour/mark-heard', 'POST', { driverId, markerId, loadId });
    },
  });

  // Speak marker inscription using Web Speech API
  const speakMarker = (marker: HistoricalMarker) => {
    if (!isSpeechSupported || !speechSynthRef.current || isSpeaking) return;

    // Stop any ongoing speech
    speechSynthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance();
    utterance.text = `Historical Marker. ${marker.title}. ${marker.inscription}`;
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setLastSpokenMarkerId(marker.id);
      markHeardMutation.mutate(marker.id);
    };

    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      setIsSpeaking(false);
    };

    speechSynthRef.current.speak(utterance);
  };

  // Check for nearby markers
  const checkNearbyMarkers = async (lat: number, lon: number) => {
    try {
      const response = await fetch(
        `/api/road-tour/nearby?latitude=${lat}&longitude=${lon}&radiusMeters=500`
      );
      const markers: HistoricalMarker[] = await response.json();
      setNearbyMarkers(markers);

      // Auto-play if we have a new marker nearby that hasn't been spoken
      if (markers.length > 0 && isEnabled) {
        const closestMarker = markers[0];
        if (closestMarker.id !== lastSpokenMarkerId && !isSpeaking) {
          speakMarker(closestMarker);
        }
      }
    } catch (error) {
      console.error('Error fetching nearby markers:', error);
    }
  };

  // GPS tracking
  useEffect(() => {
    if (!isEnabled) {
      // Stop tracking when disabled
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setNearbyMarkers([]);
      return;
    }

    // Start GPS tracking
    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentPosition({ lat: latitude, lon: longitude });
          checkNearbyMarkers(latitude, longitude);
        },
        (error) => {
          console.error('Geolocation error:', error);
          toast({
            title: "GPS Error",
            description: "Unable to access your location. Please enable location services.",
            variant: "destructive",
          });
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000,
        }
      );
    } else {
      toast({
        title: "GPS Not Available",
        description: "Your device doesn't support location tracking",
        variant: "destructive",
      });
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isEnabled, lastSpokenMarkerId, driverId, loadId]);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      if (speechSynthRef.current) {
        speechSynthRef.current.cancel();
      }
    };
  }, []);

  if (!isSpeechSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Road Tour
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Historical marker audio tours are not supported on this device.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5" />
          Road Tour - Historical Markers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="road-tour-toggle" className="flex items-center gap-2">
            {isSpeaking ? (
              <Volume2 className="h-4 w-4 text-green-600 animate-pulse" />
            ) : (
              <VolumeX className="h-4 w-4 text-gray-400" />
            )}
            <span>Enable Audio Tour</span>
          </Label>
          <Switch
            id="road-tour-toggle"
            data-testid="toggle-road-tour"
            checked={isEnabled}
            onCheckedChange={(checked) => toggleMutation.mutate(checked)}
            disabled={toggleMutation.isPending}
          />
        </div>

        {isEnabled && (
          <>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                🎧 Audio tour active! You'll hear about historical markers as you drive past them.
              </p>
            </div>

            {currentPosition && (
              <div className="text-xs text-gray-500">
                📍 GPS: {currentPosition.lat.toFixed(5)}, {currentPosition.lon.toFixed(5)}
              </div>
            )}

            {nearbyMarkers.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Nearby Markers ({nearbyMarkers.length})
                </h4>
                {nearbyMarkers.slice(0, 3).map((marker) => (
                  <div
                    key={marker.id}
                    className="p-2 bg-gray-50 rounded border"
                    data-testid={`marker-${marker.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{marker.title}</p>
                        <p className="text-xs text-gray-600">
                          {marker.city}, {marker.state}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {marker.distance ? Math.round(marker.distance) : 0}m
                      </Badge>
                    </div>
                    {marker.id === lastSpokenMarkerId && (
                      <Badge variant="default" className="text-xs mt-1">
                        ✓ Heard
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isSpeaking && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-green-800 flex items-center gap-2">
                  <Volume2 className="h-4 w-4 animate-pulse" />
                  Playing audio...
                </p>
              </div>
            )}
          </>
        )}

        {!isEnabled && (
          <p className="text-sm text-gray-500">
            Toggle on to hear historical markers automatically as you drive
          </p>
        )}
      </CardContent>
    </Card>
  );
}
