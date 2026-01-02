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
  // v2.0 - Fixed GPS tracking POST endpoint and in_transit auto-start
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
  const [lastLocationError, setLastLocationError] = useState<string | null>(null);
  const [locationUpdateCount, setLocationUpdateCount] = useState(0);
  
  const updateLocationMutation = useMutation({
    mutationFn: async (position: GeolocationPosition) => {
      console.log(`📍 Sending GPS update to server: ${position.latitude}, ${position.longitude}`);
      return await apiRequest(`/api/loads/${load.id}/location`, 'POST', {
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      });
    },
    onSuccess: (data) => {
      console.log('✅ GPS location saved to server:', data);
      setLastLocationError(null);
      setLocationUpdateCount(prev => prev + 1);
    },
    onError: (error: any) => {
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      console.error('❌ Failed to update location:', errorMsg);
      setLastLocationError(errorMsg);
      toast({
        title: 'GPS Sync Issue',
        description: 'Location captured but failed to sync to server. Will retry.',
        variant: 'destructive',
      });
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

    // Request high accuracy location updates
    // Increased timeout to 30 seconds for mobile devices that take longer to get GPS fix
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
        console.error('Geolocation error:', error.code, error.message);
        
        // Handle all error types with specific messages
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setPermissionStatus('denied');
            toast({
              title: 'Location Permission Denied',
              description: 'Please allow location access in your browser/phone settings, then refresh the page.',
              variant: 'destructive',
            });
            break;
          case error.POSITION_UNAVAILABLE:
            // GPS signal issue - don't change permission status, try again
            toast({
              title: 'GPS Signal Unavailable',
              description: 'Unable to get your location. Please ensure you have a clear view of the sky or move to a better location.',
              variant: 'destructive',
            });
            break;
          case error.TIMEOUT:
            // Timeout - GPS took too long, usually works on retry
            toast({
              title: 'GPS Timeout',
              description: 'Getting your location is taking longer than expected. Please wait or try moving to an area with better signal.',
              variant: 'destructive',
            });
            break;
          default:
            toast({
              title: 'Location Error',
              description: `Unable to get location: ${error.message || 'Unknown error'}`,
              variant: 'destructive',
            });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 30000, // 30 seconds - more time for mobile GPS to get a fix
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
      case 'in_transit':
        return { color: 'bg-blue-500', text: 'In Transit - GPS Active', icon: Navigation };
      case 'in_progress':
        return { color: 'bg-blue-500', text: 'In Progress - GPS Active', icon: Navigation };
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
          <div className={`p-4 rounded-lg border ${lastLocationError ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex items-center">
              <MapPin className={`w-5 h-5 mr-2 ${lastLocationError ? 'text-yellow-600' : 'text-green-600'}`} />
              <div className="flex-1">
                <h4 className={`font-medium ${lastLocationError ? 'text-yellow-800' : 'text-green-800'}`}>
                  GPS Active {locationUpdateCount > 0 && `(${locationUpdateCount} synced)`}
                </h4>
                <p className={`text-sm ${lastLocationError ? 'text-yellow-700' : 'text-green-700'}`}>
                  Last updated: {new Date().toLocaleTimeString()}
                  <br />
                  Accuracy: ±{Math.round(currentPosition.accuracy)}m
                  {lastLocationError && (
                    <>
                      <br />
                      <span className="text-red-600">Sync error: {lastLocationError}</span>
                    </>
                  )}
                </p>
              </div>
              {updateLocationMutation.isPending && (
                <div className="animate-pulse text-blue-500 text-xs">Syncing...</div>
              )}
            </div>
          </div>
        )}

        {/* Load Details */}
        <div className="space-y-2 pt-4 border-t">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Pickup:</span>
            <span className="font-medium text-right">
              {load.pickupAddress || 
               (load.pickupLocation ? 
                 (() => {
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
                   return result || 'Not specified';
                 })()
                 : load.companyName || 'Not specified')}
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