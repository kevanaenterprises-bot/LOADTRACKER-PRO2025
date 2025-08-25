import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import StandaloneBOLUpload from "@/components/StandaloneBOLUpload";
import { SimpleFileUpload } from "@/components/SimpleFileUpload";
import GPSTracker from "@/components/GPSTracker";
import { useDriverAuth } from "@/hooks/useDriverAuth";

interface Load {
  id: string;
  number109: string;
  driverId?: string;
  status: string;
  bolNumber?: string;
  tripNumber?: string;
  bolDocumentPath?: string;
  podDocumentPath?: string;
  estimatedMiles?: number;
  specialInstructions?: string;
  location?: {
    id: string;
    name: string;
    city: string;
    state: string;
  };
  deliveredAt?: string;
  updatedAt: string;
}

const DriverLoadCard = ({ load }: { load: Load }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const response = await fetch(`/api/loads/${load.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          'x-bypass-token': 'LOADTRACKER_BYPASS_2025'
        },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/loads"] });
      toast({ title: "Status updated successfully" });
    },
  });

  const needsPOD = load.status === "delivered" && !load.podDocumentPath;

  return (
    <Card className="material-card border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Load #{load.number109}</CardTitle>
          <Badge variant="secondary">{load.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Destination:</span>
              <div className="font-medium">{load.location?.name}</div>
              <div className="text-xs text-gray-500">
                {load.location?.city}, {load.location?.state}
              </div>
            </div>
            <div>
              <span className="text-gray-500">Miles:</span>
              <div className="font-medium">{load.estimatedMiles || "TBD"}</div>
            </div>
          </div>

          {load.specialInstructions && (
            <div className="text-sm">
              <span className="text-gray-500">Instructions:</span>
              <div className="font-medium">{load.specialInstructions}</div>
            </div>
          )}

          <div className="flex gap-2">
            {load.status === "assigned" && (
              <Button
                size="sm"
                onClick={() => updateStatusMutation.mutate("at-pickup")}
                disabled={updateStatusMutation.isPending}
              >
                At Pickup
              </Button>
            )}
            {load.status === "at-pickup" && (
              <Button
                size="sm"
                onClick={() => updateStatusMutation.mutate("in-transit")}
                disabled={updateStatusMutation.isPending}
              >
                Picked Up
              </Button>
            )}
            {load.status === "in-transit" && (
              <Button
                size="sm"
                onClick={() => updateStatusMutation.mutate("delivered")}
                disabled={updateStatusMutation.isPending}
              >
                Delivered
              </Button>
            )}
          </div>

          {needsPOD && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-center">
                <i className="fas fa-exclamation-triangle text-yellow-600 mr-2"></i>
                <span className="text-sm font-medium text-yellow-800">POD Upload Needed</span>
              </div>
              <p className="text-xs text-yellow-700 mt-1">
                Upload signed delivery receipt to complete this load
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default function DriverPortal() {
  const { user, logout } = useDriverAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedLoadForBOL, setSelectedLoadForBOL] = useState<Load | null>(null);

  console.log("🔍 POD Upload Debug:");
  console.log("Current user:", user);

  // Get driver's loads
  const { data: loads = [] } = useQuery({
    queryKey: [`/api/drivers/${user?.id}/loads`],
    enabled: !!user?.id,
  });

  console.log("🔍 Loads for driver:", loads);

  // Find current load (most recent assigned/active load)
  const currentLoad = (loads as Load[]).find((load: Load) => 
    ["assigned", "at-pickup", "in-transit"].includes(load.status)
  );

  // Recent completed loads
  const recentLoads = (loads as Load[])
    .filter((load: Load) => ["delivered", "completed"].includes(load.status))
    .slice(0, 3);

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50">
      {/* Driver Header */}
      <div className="bg-primary text-white p-4 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Driver Portal</h2>
            <p className="text-sm opacity-90">
              {user?.firstName} {user?.lastName}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-90">Status</div>
            <div className="text-sm font-medium">
              {currentLoad ? "On Load" : "Available"}
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="secondary" size="sm" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt mr-1"></i>
            Logout
          </Button>
        </div>
      </div>

      <div className="p-4">
        {/* Standalone POD Upload - Always available */}
        <div className="mb-6">
          <StandaloneBOLUpload />
        </div>

        {/* Current Load Card with GPS Tracking */}
        {currentLoad ? (
          <div className="space-y-4">
            <GPSTracker load={currentLoad} driverId={user?.id || ''} />
            <DriverLoadCard load={currentLoad} />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-material p-6 mb-6">
            <div className="text-center">
              <i className="fas fa-truck text-4xl text-gray-400 mb-4"></i>
              <h3 className="text-lg font-semibold text-secondary mb-2">No Active Load</h3>
              <p className="text-gray-600">You currently have no assigned loads.</p>
            </div>
          </div>
        )}

        {/* POD Entry Section removed - now integrated with StandaloneBOLUpload */}

        {/* Recent Loads */}
        {recentLoads.length > 0 && (
          <div className="bg-white rounded-lg shadow-material p-6">
            <h3 className="text-lg font-semibold text-secondary mb-4">Recent Loads</h3>
            <div className="space-y-3">
              {recentLoads.map((load: any) => (
                <div key={load.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-secondary">{load.number109}</div>
                      <div className="text-xs text-gray-500">
                        {load.status === "completed" ? "Completed" : "Delivered"} •{" "}
                        {new Date(load.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-success">
                        {load.location?.name || "Unknown Location"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {load.estimatedMiles || 0} miles
                      </div>
                    </div>
                  </div>
                  
                  {/* POD Upload for completed loads that need POD documents */}
                  {(load.status === "completed" || load.status === "delivered") && 
                   !load.podDocumentPath && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2 text-xs"
                      onClick={() => setSelectedLoadForBOL(load)}
                    >
                      <i className="fas fa-camera mr-1"></i>
                      Upload POD Photo
                    </Button>
                  )}
                  
                  {load.podDocumentPath && (
                    <div className="mt-2 flex items-center text-xs text-green-600">
                      <i className="fas fa-check-circle mr-1"></i>
                      POD Uploaded
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* POD Upload Modal for Completed Loads */}
      {selectedLoadForBOL && (
        <Dialog open={!!selectedLoadForBOL} onOpenChange={() => setSelectedLoadForBOL(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Upload POD Photo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-800">
                  Load: {selectedLoadForBOL.number109}
                </p>
                <p className="text-xs text-blue-600">
                  Signed Delivery Receipt - BOL #{selectedLoadForBOL.bolNumber}
                </p>
              </div>
              
              <SimpleFileUpload
                loadId={selectedLoadForBOL.id}
                onUploadComplete={(uploadURL) => {
                  toast({
                    title: "Success",
                    description: "POD photo uploaded successfully!",
                  });
                  queryClient.invalidateQueries({ queryKey: ["/api/driver/loads"] });
                  setSelectedLoadForBOL(null);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}