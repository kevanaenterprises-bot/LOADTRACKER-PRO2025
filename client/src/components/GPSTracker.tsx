import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, CheckCircle, AlertCircle, Navigation } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface GPSTrackerProps {
  load: any;
  driverId: string;
}

interface GeolocationPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export default function GPSTracker({ load, driverId }: GPSTrackerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [watchId, setWatchId] = useState<number | null>(null);
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');

  // Check if browser supports geolocation
  const isGeolocationSupported = 'geolocation' in navigator;

  // Mutation to confirm load and start tracking
  const confirmLoadMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/loads/${load.id}/confirm`, 'POST', {});
    },
    onSuccess: () => {
      toast({
        title: 'Load Confirmed',
        description: 'GPS tracking has started. We will automatically track your progress.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/driver/loads'] });
      startTracking();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to confirm load. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Mutation to update location
  const updateLocationMutation = useMutation({
    mutationFn: async (position: GeolocationPosition) => {
      return await apiRequest(`/api/loads/${load.id}/location`, 'POST', {
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      });
    },
    onError: (error) => {
      console.error('Failed to update location:', error);
    },
  });

  // Function to start GPS tracking
  const startTracking = () => {
    if (!isGeolocationSupported) {
      toast({
        title: 'GPS Not Supported',
        description: 'Your device does not support GPS tracking.',
        variant: 'destructive',
      });
      return;
    }

    // Request high accuracy location updates every 30 seconds
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const newPosition: GeolocationPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        
        setCurrentPosition(newPosition);
        setPermissionStatus('granted');
        
        // Update location on server
        updateLocationMutation.mutate(newPosition);
      },
      (error) => {
        console.error('Geolocation error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          setPermissionStatus('denied');
          toast({
            title: 'GPS Permission Denied',
            description: 'Please enable location access to use automatic tracking.',
            variant: 'destructive',
          });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000, // Cache for 30 seconds
      }
    );

    setWatchId(id);
  };

  // Stop tracking
  const stopTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  };

  // Check permission status on mount
  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionStatus(result.state);
      });
    }
  }, []);

  // Auto-start tracking if load is already confirmed
  useEffect(() => {
    if ((load.status === 'confirmed' || load.status === 'assigned' || load.status === 'in_transit') && load.trackingEnabled && watchId === null) {
      startTracking();
    }

    // Cleanup on unmount
    return () => {
      stopTracking();
    };
  }, [load.status, load.trackingEnabled]);

  // Get status info
  const getStatusInfo = () => {
    switch (load.status) {
      case 'created':
      case 'assigned':
        return { color: 'bg-gray-500', text: 'Awaiting Confirmation', icon: Clock };
      case 'confirmed':
        return { color: 'bg-blue-500', text: 'Confirmed - Tracking Active', icon: Navigation };
      case 'en_route_pickup':
        return { color: 'bg-yellow-500', text: 'En Route to Pickup', icon: Navigation };
      case 'at_shipper':
        return { color: 'bg-orange-500', text: 'At Shipper', icon: MapPin };
      case 'left_shipper':
        return { color: 'bg-purple-500', text: 'Left Shipper', icon: Navigation };
      case 'en_route_receiver':
        return { color: 'bg-blue-600', text: 'En Route to Receiver', icon: Navigation };
      case 'at_receiver':
        return { color: 'bg-green-500', text: 'At Receiver', icon: MapPin };
      case 'delivered':
        return { color: 'bg-green-600', text: 'Delivered', icon: CheckCircle };
      case 'completed':
        return { color: 'bg-gray-600', text: 'Completed', icon: CheckCircle };
      default:
        return { color: 'bg-gray-400', text: 'Unknown', icon: AlertCircle };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">GPS Tracking</CardTitle>
          <Badge className={`${statusInfo.color} text-white`}>
            <StatusIcon className="w-4 h-4 mr-1" />
            {statusInfo.text}
          </Badge>
        </div>
        <CardDescription>
          Load #{load.number109} • {load.companyName || 'No Company'}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Load confirmation */}
        {(load.status === 'created' || load.status === 'assigned') && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">Confirm Load Receipt</h4>
            <p className="text-sm text-blue-700 mb-3">
              Click "Confirm Load" to start automatic GPS tracking. We'll track your progress automatically 
              as you travel to pickup, delivery locations, and notify the office of your status.
            </p>
            <Button
              onClick={() => confirmLoadMutation.mutate()}
              disabled={confirmLoadMutation.isPending || !isGeolocationSupported}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {confirmLoadMutation.isPending ? 'Confirming...' : 'Confirm Load & Start Tracking'}
            </Button>
          </div>
        )}

        {/* GPS Permission Status */}
        {load.status !== 'created' && load.status !== 'assigned' && permissionStatus !== 'granted' && (
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
              <div>
                <h4 className="font-medium text-yellow-800">GPS Permission Required</h4>
                <p className="text-sm text-yellow-700">
                  {permissionStatus === 'denied' 
                    ? 'Location access was denied. Please enable it in your browser settings.'
                    : 'Allow location access to enable automatic tracking.'
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Current Location Info */}
        {currentPosition && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center">
              <MapPin className="w-5 h-5 text-green-600 mr-2" />
              <div>
                <h4 className="font-medium text-green-800">GPS Active</h4>
                <p className="text-sm text-green-700">
                  Last updated: {new Date().toLocaleTimeString()}
                  <br />
                  Accuracy: ±{Math.round(currentPosition.accuracy)}m
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Load Details */}
        <div className="space-y-2 pt-4 border-t">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Pickup:</span>
            <span className="font-medium text-right">
              {(() => {
                if (load.pickupAddress) return load.pickupAddress;
                
                if (load.pickupLocation) {
                  const parts = [load.pickupLocation.name];
                  if (load.pickupLocation.address) parts.push(load.pickupLocation.address);
                  if (load.pickupLocation.city && load.pickupLocation.state) {
                    parts.push(`${load.pickupLocation.city}, ${load.pickupLocation.state}`);
                  } else if (load.pickupLocation.city) {
                    parts.push(load.pickupLocation.city);
                  } else if (load.pickupLocation.state) {
                    parts.push(load.pickupLocation.state);
                  }
                  const result = parts.filter(Boolean).join(' - ');
                  if (result) return result;
                }
                
                if (load.stops && load.stops.length > 0 && load.stops[0].stopType === 'pickup') {
                  const stop = load.stops[0];
                  const parts = [stop.companyName, stop.address].filter(Boolean);
                  if (parts.length > 0) return parts.join(' - ');
                }
                
                return load.companyName || 'Not specified';
              })()}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Delivery:</span>
            <span className="font-medium text-right">
              {load.deliveryAddress || 
               (load.location ? 
                 (() => {
                   const parts = [load.location.name];
                   if (load.location.address) parts.push(load.location.address);
                   if (load.location.city && load.location.state) {
                     parts.push(`${load.location.city}, ${load.location.state}`);
                   } else if (load.location.city) {
                     parts.push(load.location.city);
                   } else if (load.location.state) {
                     parts.push(load.location.state);
                   }
                   const result = parts.filter(Boolean).join(' - ');
                   return result || 'Not specified';
                 })()
                 : 'Not specified')}
            </span>
          </div>
          {load.appointmentTime && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Appointment:</span>
              <span className="font-medium">{load.appointmentTime}</span>
            </div>
          )}
        </div>

        {/* Manual Override (if needed) */}
        {load.trackingEnabled && load.status !== 'created' && load.status !== 'completed' && (
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 mb-2">
              GPS tracking is active. Status updates are automatic based on your location.
              If you need to manually update your status, contact dispatch.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}