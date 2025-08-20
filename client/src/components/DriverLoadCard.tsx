import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DriverLoadCardProps {
  load: any;
}

const getStatusText = (status: string) => {
  switch (status) {
    case "created":
      return "Load Assigned";
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
    default:
      return status;
  }
};

const getNextAction = (status: string) => {
  switch (status) {
    case "created":
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
    default:
      return null;
  }
};

const getProgressSteps = (currentStatus: string) => {
  const steps = [
    { key: "created", label: "Load Created", time: "" },
    { key: "en_route_pickup", label: "En Route to Pickup", time: "" },
    { key: "at_shipper", label: "At Shipper", time: "" },
    { key: "left_shipper", label: "Left Shipper", time: "" },
    { key: "en_route_receiver", label: "En Route to Receiver", time: "" },
    { key: "at_receiver", label: "At Receiver", time: "" },
    { key: "delivered", label: "Delivered", time: "" },
  ];

  const statusOrder = ["created", "en_route_pickup", "at_shipper", "left_shipper", "en_route_receiver", "at_receiver", "delivered"];
  const currentIndex = statusOrder.indexOf(currentStatus);

  return steps.map((step, index) => ({
    ...step,
    completed: index <= currentIndex,
    active: index === currentIndex,
  }));
};

export default function DriverLoadCard({ load }: DriverLoadCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest("PATCH", `/api/loads/${load.id}/status`, { status });
    },
    onSuccess: () => {
      toast({
        title: "Status Updated",
        description: "Load status has been updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    },
    onError: (error: Error) => {
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
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    },
  });

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

        {nextAction && (
          <Button 
            className="w-full mt-6"
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
                <i className={`fas ${nextAction.icon} mr-2`}></i>
                Update Status: {nextAction.text}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
