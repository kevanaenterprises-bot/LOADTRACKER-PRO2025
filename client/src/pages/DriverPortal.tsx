import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import StandaloneBOLUpload from "@/components/StandaloneBOLUpload";
import { SimpleFileUpload } from "@/components/SimpleFileUpload";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { apiRequest } from "@/lib/queryClient";

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
      return await apiRequest(`/api/loads/${load.id}/status`, "PATCH", { status });
    },
    onSuccess: (data) => {
      // Refresh all driver-related queries
      queryClient.invalidateQueries({ queryKey: ['/api/loads'] });
      queryClient.invalidateQueries({ queryKey: [`/api/loads`] });
      
      // Show clear success message
      toast({ 
        title: "✅ Status Updated!", 
        description: `Load #${load.number109} is now ${data.status}`,
        duration: 5000
      });
    },
    onError: (error) => {
      toast({ 
        title: "❌ Update Failed", 
        description: error.message || "Could not update status",
        variant: "destructive"
      });
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

          {/* Simplified Manual Status Updates */}
          <div className="flex gap-2 flex-wrap">
            {load.status === "created" && (
              <Button
                size="sm"
                onClick={() => updateStatusMutation.mutate("in_progress")}
                disabled={updateStatusMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                🚚 Start Trip
              </Button>
            )}
            {load.status === "in_progress" && (
              <Button
                size="sm"
                onClick={() => updateStatusMutation.mutate("delivered")}
                disabled={updateStatusMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                📦 Mark Delivered
              </Button>
            )}
            {load.status === "delivered" && !load.podDocumentPath && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                📸 POD Document Required
              </Badge>
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
  const { user, logout, isLoading, isAuthenticated, error } = useDriverAuth();
  
  console.log("🔍 PORTAL STATE DEBUG:");
  console.log("- user:", user);
  console.log("- isLoading:", isLoading);
  console.log("- isAuthenticated:", isAuthenticated);
  console.log("- error:", error);
  
  // SIMPLIFIED: Show loading only during initial authentication check
  if (isLoading) {
    console.log("🔄 Still loading authentication...");
    return (
      <div className="max-w-lg mx-auto min-h-screen bg-gray-50">
        <div className="p-4">
          <div className="bg-white rounded-lg shadow-material p-6 mb-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-secondary mb-2">Loading Your Portal...</h3>
              <p className="text-gray-600">Verifying your authentication.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // SIMPLIFIED: If not loading and we have an authenticated user, show portal
  if (isAuthenticated && user) {
    console.log("✅ AUTHENTICATION SUCCESS: User is authenticated", user);
    // Continue to portal rendering below
  } else {
    // SIMPLIFIED: Any other case (error, no user, etc.) redirect to login
    console.log("🚨 Not authenticated, redirecting to login");
    console.log("🚨 Auth state:", { isAuthenticated, user: !!user, error: !!error });
    
    // Only redirect if not already redirecting
    if (!sessionStorage.getItem('driver-redirecting')) {
      sessionStorage.setItem('driver-redirecting', 'true');
      setTimeout(() => {
        window.location.href = "/driver-login";
      }, 100);
    }
    
    return (
      <div className="max-w-lg mx-auto min-h-screen bg-gray-50">
        <div className="p-4">
          <div className="bg-white rounded-lg shadow-material p-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-red-600">Redirecting to Login</h3>
              <p className="text-gray-600">Please wait while we redirect you to the login page.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedLoadForBOL, setSelectedLoadForBOL] = useState<Load | null>(null);

  console.log("🔍 Driver Portal Debug:");
  console.log("Current user:", user);
  console.log("isLoading:", isLoading);
  console.log("isAuthenticated:", isAuthenticated);
  console.log("error:", error);

  // Get driver's loads with bypass token support
  const { data: loads = [], refetch } = useQuery({
    queryKey: [`/api/loads`],
    queryFn: async () => {
      console.log(`🔄 Fetching loads for authenticated driver`);
      
      let bypassToken = localStorage.getItem('bypass-token');
      const headers: any = {};
      if (bypassToken) {
        headers['X-Bypass-Token'] = bypassToken;
      }

      const response = await fetch(`/api/loads`, {
        credentials: "include",
        headers,
      });
      
      console.log(`📡 API Response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ API Error:", errorText);
        throw new Error(`Failed to fetch loads: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log("✅ Received loads data:", data);
      return data;
    },
    enabled: !!user?.id,
    staleTime: 0, // Always allow fresh data for driver loads
    refetchInterval: 5000, // Refetch every 5 seconds (increased from 2)
    refetchOnWindowFocus: true,
  });

  // Force refresh on component mount
  useEffect(() => {
    if (user?.id) {
      refetch();
    }
  }, [user?.id, refetch]);

  console.log("🔍 Driver Portal Debug:", {
    userId: user?.id,
    loadsCount: loads?.length || 0,
    loads: loads,
    hasLoads: Array.isArray(loads) && loads.length > 0
  });

  // Find current load - prioritize by status hierarchy and creation time
  const sortedActiveLoads = (loads as Load[])
    .filter((load: Load) => {
      const isActive = ["in_progress", "created", "assigned", "at-pickup", "in-transit"].includes(load.status);
      console.log(`🔍 Load ${load.number109}: status="${load.status}", isActive=${isActive}`);
      return isActive;
    })
    .sort((a, b) => {
      // Status priority: in_progress = 1, created = 2, assigned = 3, etc.
      const statusPriority = {
        "in_progress": 1,
        "created": 2, 
        "assigned": 3,
        "at-pickup": 4,
        "in-transit": 5
      };
      
      const aPriority = statusPriority[a.status as keyof typeof statusPriority] || 10;
      const bPriority = statusPriority[b.status as keyof typeof statusPriority] || 10;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // If same priority, sort by creation time (oldest first)  
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return aTime - bTime;
    });
    
  const currentLoad = sortedActiveLoads[0] || null;

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
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => {
            localStorage.clear();
            sessionStorage.clear();
            queryClient.clear();
            window.location.reload();
          }}>
            🔄 Force Refresh
          </Button>
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

        {/* Current Load Card */}
        {currentLoad ? (
          <div className="space-y-4">
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
                  // Use correct query key that matches the main query  
                  queryClient.invalidateQueries({ queryKey: [`/api/loads`] });
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