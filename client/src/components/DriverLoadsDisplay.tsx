import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { DigitalSignaturePad } from "@/components/DigitalSignaturePad";
import { apiRequest } from "@/lib/queryClient";

interface DriverLoadsDisplayProps {
  driverId: string;
}

export default function DriverLoadsDisplay({ driverId }: DriverLoadsDisplayProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLoad, setSelectedLoad] = useState<any>(null);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [showLoadDetails, setShowLoadDetails] = useState(false);

  // Fetch driver's assigned loads
  const { data: allLoads = [], isLoading, error } = useQuery<any[]>({
    queryKey: [`/api/drivers/${driverId}/loads`],
    retry: false,
    refetchOnWindowFocus: true, // Auto-refresh when switching back to app (mobile fix!)
    refetchInterval: 15000, // Refresh every 15 seconds for faster updates
  });


  // Filter out loads that have been completed (POD uploaded)
  // Keep "delivered" loads so drivers can force-advance to invoicing
  const loads = allLoads.filter((load: any) => 
    !['awaiting_invoicing', 'awaiting_payment', 'completed', 'paid'].includes(load.status)
  );

  // Status update mutation
  const statusUpdateMutation = useMutation({
    mutationFn: async ({ loadId, status }: { loadId: string; status: string }) => {
      return await apiRequest(`/api/loads/${loadId}/status`, "PATCH", { status });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Status updated successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/drivers/${driverId}/loads`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to update status",
        variant: "destructive"
      });
    },
  });

  // Force status update mutation (bypasses business rules)
  const forceStatusUpdateMutation = useMutation({
    mutationFn: async ({ loadId, status }: { loadId: string; status: string }) => {
      return await apiRequest(`/api/loads/${loadId}/force-status`, "PATCH", { status });
    },
    onSuccess: () => {
      toast({ 
        title: "Force Update Successful", 
        description: "Load status forced to next stage (business rules bypassed)",
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: [`/api/drivers/${driverId}/loads`] });
    },
    onError: (error: any) => {
      toast({
        title: "Force Update Failed", 
        description: error.message || "Failed to force status update",
        variant: "destructive"
      });
    },
  });

  // Load return mutation
  const returnLoadMutation = useMutation({
    mutationFn: async (loadId: string) => {
      return await apiRequest(`/api/loads/${loadId}/return-load`, "PATCH", {});
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Load Returned", 
        description: "Load has been returned to the admin dashboard" 
      });
      queryClient.invalidateQueries({ queryKey: [`/api/drivers/${driverId}/loads`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to return load",
        variant: "destructive"
      });
    },
  });

  const getStatusColor = (status: string) => {
    // Handle undefined/null status gracefully
    const safeStatus = status || 'created';
    
    switch (safeStatus) {
      case "created": return "bg-blue-100 text-blue-800";
      case "assigned": return "bg-yellow-100 text-yellow-800";
      case "in_progress": return "bg-orange-100 text-orange-800";
      case "at_shipper": return "bg-purple-100 text-purple-800";
      case "left_shipper": return "bg-indigo-100 text-indigo-800";
      case "at_receiver": return "bg-pink-100 text-pink-800";
      case "delivered": return "bg-green-100 text-green-800";
      case "completed": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const updateStatus = (loadId: string, newStatus: string) => {
    statusUpdateMutation.mutate({ loadId, status: newStatus });
  };

  // Combined function to accept tracking and move to in-transit
  const handleAcceptTracking = async (loadId: string) => {
    try {
      // Update status to in_transit to show load is active and start tracking
      statusUpdateMutation.mutate({ loadId, status: "in_transit" });
      
      toast({
        title: "Load Accepted & Tracking Started! 🚛",
        description: "You're now tracking this load. GPS updates will be sent automatically.",
      });
    } catch (error) {
      console.error("Failed to accept tracking:", error);
      toast({
        title: "Accept Tracking Failed",
        description: "Could not start tracking. Please try again.",
        variant: "destructive"
      });
    }
  };

  const getNextStatus = (currentStatus: string): string | null => {
    const statusProgression = {
      "created": "assigned",
      "assigned": "in_progress", 
      "in_progress": "at_shipper",
      "at_shipper": "left_shipper",
      "left_shipper": "at_receiver",
      "at_receiver": "delivered",
      "delivered": "awaiting_invoicing",
      "awaiting_invoicing": "awaiting_payment",
      "awaiting_payment": "paid",
      "paid": "completed"
    };
    return statusProgression[currentStatus as keyof typeof statusProgression] || null;
  };

  const forceToNextStage = (loadId: string, currentStatus: string) => {
    const nextStatus = getNextStatus(currentStatus);
    if (nextStatus) {
      if (confirm(`⚠️ Are you sure you want to FORCE this load to "${nextStatus}" status? This will bypass all business rules and validations.`)) {
        forceStatusUpdateMutation.mutate({ loadId, status: nextStatus });
      }
    } else {
      toast({
        title: "Cannot Force", 
        description: "This load is already at the final stage or no next stage available",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-gray-600">Loading your loads...</p>
        </CardContent>
      </Card>
    );
  }

  if (loads.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <h3 className="font-semibold text-gray-700">No Loads Assigned</h3>
          <p className="text-gray-600 mt-2">You don't have any loads assigned yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {loads.map((load: any) => (
        <Card key={load.id} className="mb-4 border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl font-bold text-blue-700">
                  {load.number109 ? `Load #${load.number109}` : 
                   load.id ? `Load #${load.id.slice(-6)}` : 'Unknown Load'}
                </CardTitle>
                <p className="text-sm text-gray-600">
                  {load.location?.name || load.destination || 'No destination set'} - {' '}
                  {load.location?.city || 'City'}, {load.location?.state || 'State'}
                </p>
              </div>
              <Badge className={getStatusColor(load.status || 'created')}>
                {(load.status || 'UNKNOWN').replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <div className="mb-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Distance</p>
                <p className="text-lg">
                  {load.estimatedMiles ? `${load.estimatedMiles} miles` : 
                   load.distance ? `${load.distance} miles` :
                   'Distance not set'}
                </p>
              </div>
              
              {/* Show more load details if available */}
              {(load.pickupLocation || load.deliveryLocation) && (
                <div className="mt-2 text-sm text-gray-600">
                  {load.pickupLocation && <p>📍 Pickup: {load.pickupLocation}</p>}
                  {load.deliveryLocation && <p>🏁 Delivery: {load.deliveryLocation}</p>}
                </div>
              )}
            </div>
            
            {load.specialInstructions && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-sm font-medium text-yellow-800">Special Instructions:</p>
                <p className="text-sm text-yellow-700">{load.specialInstructions}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={() => {
                  setSelectedLoad(load);
                  setShowLoadDetails(true);
                }}
                variant="outline"
                size="sm"
                data-testid={`button-view-details-${load.id}`}
              >
                View Details
              </Button>
              
              {load.status !== "completed" && (
                <>
                  {/* Main action button - Always Accept Tracking */}
                  <Button 
                    onClick={() => handleAcceptTracking(load.id)}
                    variant="default"
                    size="sm"
                    disabled={statusUpdateMutation.isPending}
                    data-testid={`button-accept-tracking-${load.id}`}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {statusUpdateMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                        Updating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-location-arrow mr-2"></i>
                        Accept Load & Start Tracking
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    onClick={() => {
                      setSelectedLoad(load);
                      setShowSignatureDialog(true);
                    }}
                    variant="outline"
                    size="sm"
                    data-testid={`button-sign-documents-${load.id}`}
                  >
                    Sign Documents
                  </Button>

                  <Button 
                    onClick={() => forceToNextStage(load.id, load.status)}
                    variant="destructive"
                    size="sm"
                    disabled={forceStatusUpdateMutation.isPending || !getNextStatus(load.status)}
                    data-testid={`button-force-next-stage-${load.id}`}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    ⚡ Force Next Stage
                  </Button>
                </>
              )}
              
              <Button 
                onClick={() => {
                  if (confirm(`Are you sure you want to return load ${load.number109} to the office?`)) {
                    returnLoadMutation.mutate(load.id);
                  }
                }}
                variant="destructive"
                size="sm"
                disabled={returnLoadMutation.isPending}
                data-testid={`button-return-load-${load.id}`}
              >
                {returnLoadMutation.isPending ? "Returning..." : "Return Load"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Load Details Dialog */}
      <Dialog open={showLoadDetails} onOpenChange={setShowLoadDetails}>
        <DialogContent className="max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle>Load Details - {selectedLoad?.number109}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="font-medium">Destination:</p>
              <p>{selectedLoad?.location?.name}</p>
              <p>{selectedLoad?.location?.city}, {selectedLoad?.location?.state}</p>
            </div>
            <div>
              <p className="font-medium">Distance: {selectedLoad?.estimatedMiles} miles</p>
              {selectedLoad?.lumperCharge > 0 && (
                <p className="font-medium">Lumper Fee: ${selectedLoad?.lumperCharge}</p>
              )}
            </div>
            <div>
              <p className="font-medium">Status:</p>
              <Badge className={getStatusColor(selectedLoad?.status)}>
                {selectedLoad?.status?.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
            {selectedLoad?.specialInstructions && (
              <div>
                <p className="font-medium">Special Instructions:</p>
                <p className="text-sm bg-yellow-50 p-2 rounded">{selectedLoad?.specialInstructions}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Signature Dialog - Fixed Position */}
      <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <DialogContent className="max-w-md mx-auto max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Sign Documents - {selectedLoad?.number109}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <DigitalSignaturePad 
              loadId={selectedLoad?.id}
              loadNumber={selectedLoad?.number109}
              onSignatureComplete={() => {
                setShowSignatureDialog(false);
                toast({ 
                  title: "Success", 
                  description: "Document signed successfully" 
                });
                queryClient.invalidateQueries({ queryKey: [`/api/drivers/${driverId}/loads`] });
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}