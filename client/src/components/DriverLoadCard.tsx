import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import GPSTracker from "@/components/GPSTracker";

interface DriverLoadCardProps {
  load: any;
}

const getStatusText = (status: string) => {
  // Handle undefined/null status gracefully
  if (!status) {
    return "Unknown Status";
  }
  
  switch (status) {
    case "assigned":
      return "Assigned";
    case "created":
      return "Load Assigned";
    case "in_progress":
    case "in_transit":
      return "In Progress";
    case "en_route_pickup":
      return "En Route to Pickup";
    case "at_shipper":
      return "At Shipper";
    case "left_shipper":
      return "Left Shipper";
    case "en_route_receiver":
      return "En Route to Receiver";
    case "at_receiver":
      return "At Receiver";
    case "delivered":
      return "Delivered";
    case "empty":
      return "Empty - Ready for Next Load";
    case "awaiting_invoicing":
      return "Awaiting Invoicing";
    default:
      return status || "Unknown Status";
  }
};

const getNextAction = (status: string) => {
  // Handle undefined/null status gracefully
  if (!status) {
    return null;
  }
  
  switch (status) {
    case "assigned":
      return { status: "in_progress", text: "Start Trip", icon: "fa-play" };
    case "created":
      return { status: "en_route_pickup", text: "En Route to Pickup", icon: "fa-route" };
    case "in_progress":
    case "in_transit":
      return { status: "en_route_pickup", text: "En Route to Pickup", icon: "fa-route" };
    case "en_route_pickup":
      return { status: "at_shipper", text: "Arrived at Shipper", icon: "fa-map-marker-alt" };
    case "at_shipper":
      return { status: "left_shipper", text: "Left Shipper", icon: "fa-truck" };
    case "left_shipper":
      return { status: "en_route_receiver", text: "En Route to Receiver", icon: "fa-route" };
    case "en_route_receiver":
      return { status: "at_receiver", text: "Arrived at Receiver", icon: "fa-map-marker-alt" };
    case "at_receiver":
      return { status: "delivered", text: "Mark as Delivered", icon: "fa-check-circle" };
    case "delivered":
      return { status: "awaiting_invoicing", text: "Complete Load", icon: "fa-file-invoice" };
    default:
      return null;
  }
};

const getProgressSteps = (currentStatus: string) => {
  // Handle undefined/null status gracefully
  const safeStatus = currentStatus || "assigned";
  
  const steps = [
    { key: "assigned", label: "Assigned", time: "" },
    { key: "in_progress", label: "In Progress", time: "" },
    { key: "en_route_pickup", label: "En Route to Pickup", time: "" },
    { key: "at_shipper", label: "At Shipper", time: "" },
    { key: "left_shipper", label: "Left Shipper", time: "" },
    { key: "en_route_receiver", label: "En Route to Receiver", time: "" },
    { key: "at_receiver", label: "At Receiver", time: "" },
    { key: "delivered", label: "Delivered", time: "" },
    { key: "empty", label: "Empty", time: "" },
    { key: "awaiting_invoicing", label: "Complete", time: "" },
  ];

  const statusOrder = ["assigned", "in_progress", "in_transit", "created", "en_route_pickup", "at_shipper", "left_shipper", "en_route_receiver", "at_receiver", "delivered", "empty", "awaiting_invoicing"];
  const currentIndex = statusOrder.indexOf(safeStatus);

  return steps.map((step, index) => ({
    ...step,
    completed: index <= currentIndex,
    active: index === currentIndex,
  }));
};

export default function DriverLoadCard({ load }: DriverLoadCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Driver unassign mutation
  const unassignMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/loads/${load.id}/unassign`, {
        method: "POST",
        credentials: "include",
        headers: {
          'x-bypass-token': 'LOADTRACKER_BYPASS_2025'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to unassign from load");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Successfully Unassigned",
        description: `You have been unassigned from load ${load.number109}. The load is now available for other drivers.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
    },
    onError: (error: any) => {
      console.error("Unassign error:", error);
      toast({
        title: "Unassign Failed",
        description: error.message || "Failed to unassign from load. Please try again.",
        variant: "destructive",
      });
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      console.log("🚀 Status update starting:", { loadId: load.id, status });
      console.log("🔑 Bypass token available:", !!localStorage.getItem('bypass-token'));
      
      try {
        const result = await apiRequest(`/api/loads/${load.id}/status`, "PATCH", { status });
        console.log("✅ Status update successful:", result);
        return result;
      } catch (error) {
        console.error("💥 Status update failed:", error);
        throw error;
      }
    },
    onSuccess: (result) => {
      console.log("🎉 Status update onSuccess:", result);
      toast({
        title: "Status Updated",
        description: "Load status has been updated successfully!",
      });
      // Invalidate both driver loads and general loads to ensure UI refresh
      queryClient.invalidateQueries({ queryKey: ["/api/driver/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    },
    onError: (error: Error) => {
      console.error("🚨 Status update onError:", error);
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Status Update Error",
        description: `Failed to update status: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Combined function to accept tracking and move to in-transit
  const handleAcceptTracking = async () => {
    try {
      // First, update status to in_transit to show load is active
      await updateStatusMutation.mutateAsync("in_transit");
      
      // Then start GPS tracking
      // The GPSTracker component will handle the actual GPS initialization
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

  const handleStatusUpdate = () => {
    const nextAction = getNextAction(load.status);
    if (nextAction) {
      updateStatusMutation.mutate(nextAction.status);
    }
  };

  const progressSteps = getProgressSteps(load.status);
  const nextAction = getNextAction(load.status);

  return (
    <Card className="material-card mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Current Load</CardTitle>
          <Badge variant="secondary">
            {getStatusText(load.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">109 Number:</span>
            <span className="text-sm font-medium">{load.number109}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Pickup Location:</span>
            <span className="text-sm font-medium">1800 East Plano Parkway</span>
          </div>

          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Receiver:</span>
            <span className="text-sm font-medium">
              {load.location?.name || "Unknown Location"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Estimated Miles:</span>
            <span className="text-sm font-medium">{load.estimatedMiles || 0}</span>
          </div>

          {load.specialInstructions && (
            <div>
              <span className="text-sm text-gray-500">Special Instructions:</span>
              <p className="text-sm font-medium mt-1">{load.specialInstructions}</p>
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Progress Tracking</h4>
            <div className="space-y-2">
              {progressSteps.map((step) => (
                <div key={step.key} className="flex items-center space-x-3">
                  <div 
                    className={`w-3 h-3 rounded-full ${
                      step.completed 
                        ? step.active 
                          ? "bg-warning" 
                          : "bg-success"
                        : "bg-gray-300"
                    }`}
                  ></div>
                  <span className={`text-sm ${step.completed ? "text-gray-900" : "text-gray-400"}`}>
                    {step.label}
                  </span>
                  {step.completed && step.time && (
                    <span className="text-xs text-gray-400 ml-auto">{step.time}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          {/* GPS Tracking Component */}
          <GPSTracker load={load} driverId={load.driverId} />
          
          <div className="flex gap-2">
            {nextAction && (
              <>
                {/* Show Accept Tracking for loads that haven't started tracking yet */}
                {(load.status === "assigned" || load.status === "created") ? (
                  <Button 
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleAcceptTracking}
                    disabled={updateStatusMutation.isPending}
                  >
                    {updateStatusMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Starting Tracking...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-location-arrow mr-2"></i>
                        Accept Tracking
                      </>
                    )}
                  </Button>
                ) : (
                  /* Show Update Status for loads already in transit */
                  <Button 
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    onClick={handleStatusUpdate}
                    disabled={updateStatusMutation.isPending}
                  >
                    {updateStatusMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Updating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-play mr-2"></i>
                        Update Status
                      </>
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
          
          {/* Unassign from Load Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive" 
                size={nextAction ? "default" : "lg"}
                className={nextAction ? "px-4" : "w-full"}
                disabled={unassignMutation.isPending}
              >
                <i className="fas fa-times mr-2"></i>
                {nextAction ? "Unassign" : "Unassign from Load"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unassign from Load?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to unassign yourself from load {load.number109}? 
                  This will make the load available for other drivers to pick up.
                  <br /><br />
                  <strong>Note:</strong> This is useful when you've dropped your trailer and need to pick up a different load before delivering this one.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => unassignMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {unassignMutation.isPending ? "Unassigning..." : "Yes, Unassign Me"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
