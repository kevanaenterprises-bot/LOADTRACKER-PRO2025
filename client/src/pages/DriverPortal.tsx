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
      console.error("Status update error:", error);
      toast({ 
        title: "❌ Update Failed", 
        description: "Could not update load status. Please try again.",
        variant: "destructive"
      });
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "created": return "bg-blue-100 text-blue-800";
      case "assigned": return "bg-yellow-100 text-yellow-800";
      case "at_shipper": return "bg-orange-100 text-orange-800";
      case "left_shipper": return "bg-purple-100 text-purple-800";
      case "at_receiver": return "bg-indigo-100 text-indigo-800";
      case "delivered": return "bg-green-100 text-green-800";
      case "completed": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getAvailableStatuses = (currentStatus: string) => {
    const statusFlow = ["created", "assigned", "at_shipper", "left_shipper", "at_receiver", "delivered"];
    const currentIndex = statusFlow.indexOf(currentStatus);
    
    if (currentIndex === -1) return [];
    
    // Allow moving to next status or staying in current
    const nextStatus = statusFlow[currentIndex + 1];
    return nextStatus ? [nextStatus] : [];
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <Card className="mb-4 border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg font-semibold">
              Load #{load.number109}
            </CardTitle>
            {load.location && (
              <p className="text-sm text-gray-600 mt-1">
                📍 {load.location.name}, {load.location.city}, {load.location.state}
              </p>
            )}
          </div>
          <Badge className={getStatusColor(load.status)}>
            {formatStatus(load.status)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {load.estimatedMiles && (
          <p className="text-sm text-gray-600 mb-2">
            🚛 {load.estimatedMiles} miles
          </p>
        )}
        
        {load.specialInstructions && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-3">
            <p className="text-sm text-yellow-800">
              <strong>Special Instructions:</strong> {load.specialInstructions}
            </p>
          </div>
        )}

        {load.bolNumber && (
          <p className="text-sm text-gray-600 mb-2">
            📋 BOL: {load.bolNumber}
          </p>
        )}

        <div className="mt-4 space-y-2">
          {getAvailableStatuses(load.status).map(status => (
            <Button
              key={status}
              onClick={() => updateStatusMutation.mutate(status)}
              disabled={updateStatusMutation.isPending}
              className="w-full"
              variant="outline"
            >
              {updateStatusMutation.isPending ? "Updating..." : `Mark as ${formatStatus(status)}`}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default function DriverPortal() {
  console.log("🚨 EMERGENCY DEBUG: DriverPortal function called!");
  console.log("🚨 typeof window:", typeof window);
  console.log("🚨 window.location:", window?.location?.href);
  
  const { user, logout, isLoading, isAuthenticated, error } = useDriverAuth();
  console.log("🚨 useDriverAuth hook called successfully");
  console.log("🚨 Auth result:", { user: !!user, isLoading, isAuthenticated, error: !!error });

  console.log("🔍 DETAILED PORTAL STATE DEBUG:");
  console.log("- user:", JSON.stringify(user, null, 2));
  console.log("- isLoading:", isLoading);
  console.log("- isAuthenticated:", isAuthenticated);
  console.log("- error:", JSON.stringify(error, null, 2));
  console.log("- Current path:", window.location.pathname);
  console.log("- Session storage driver-redirecting:", sessionStorage.getItem('driver-redirecting'));

  // SIMPLIFIED: Show loading only during initial authentication check
  if (isLoading) {
    console.log("🔄 SHOWING LOADING STATE - Still loading authentication...");
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

  // CRITICAL FIX: Only redirect if explicitly not authenticated
  if (!isLoading && !isAuthenticated) {
    console.log("🚨 SHOWING REDIRECT STATE - Not authenticated, redirecting to login");
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

  // SIMPLIFIED: If we get here, show the portal (authenticated or loading state handled above)
  console.log("✅ REACHED PORTAL RENDER SECTION!");
  console.log("✅ Final auth check before render:", { isLoading, isAuthenticated, hasUser: !!user });
  console.log("✅ User data:", user);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedLoadForBOL, setSelectedLoadForBOL] = useState<Load | null>(null);

  console.log("🔍 Driver Portal Debug:");
  console.log("Current user:", user);
  console.log("isLoading:", isLoading);
  console.log("isAuthenticated:", isAuthenticated);
  console.log("error:", error);

  // Get driver's loads using the correct driver-specific endpoint
  const { data: loads = [], refetch } = useQuery({
    queryKey: [`/api/drivers/${user?.id}/loads`],
    queryFn: async () => {
      if (!user?.id) {
        console.log("❌ No user ID available for loads fetch");
        return [];
      }
      
      console.log(`🔄 Fetching loads for driver: ${user.id}`);
      
      const response = await fetch(`/api/drivers/${user.id}/loads`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
      });
      
      console.log(`📡 API Response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ API Error:", errorText);
        throw new Error(`Failed to fetch driver loads`);
      }
      
      const data = await response.json();
      console.log("✅ Received loads data:", data);
      return data;
    },
    enabled: !!user?.id,
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 5000, // Refetch every 5 seconds
    refetchOnWindowFocus: true,
  });

  // Force refresh on component mount
  useEffect(() => {
    if (user?.id) {
      refetch();
    }
  }, [user?.id, refetch]);

  const currentLoad = loads.find((load: Load) => 
    load.status !== 'completed' && load.status !== 'delivered'
  );
  
  const recentLoads = loads.filter((load: Load) => 
    load.status === 'completed' || load.status === 'delivered'
  ).slice(0, 5);

  const handleLogout = () => {
    logout();
  };

  console.log("🎯 PORTAL RENDER: About to render portal with loads:", loads);
  console.log("🎯 PORTAL RENDER: Current load:", currentLoad);
  console.log("🎯 PORTAL RENDER: Recent loads:", recentLoads);

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50">
      {/* Driver Header */}
      <div className="bg-primary text-white p-4 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Driver Portal</h2>
            <p className="text-sm opacity-90">
              Welcome, {user?.firstName} {user?.lastName}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleLogout}
            className="text-white hover:bg-white/20"
          >
            Logout
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Current Active Load */}
        {currentLoad ? (
          <div>
            <h3 className="text-lg font-semibold mb-3 text-secondary">Current Load</h3>
            <DriverLoadCard load={currentLoad} />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-material p-6 text-center">
            <div className="text-gray-500">
              <h3 className="text-lg font-semibold mb-2">No Active Loads</h3>
              <p className="text-sm">Check back later for new assignments.</p>
            </div>
          </div>
        )}

        {/* Standalone BOL Upload */}
        <div className="bg-white rounded-lg shadow-material p-4">
          <h3 className="text-lg font-semibold mb-3 text-secondary">Upload BOL</h3>
          <StandaloneBOLUpload />
        </div>

        {/* Recent Loads */}
        {recentLoads.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 text-secondary">Recent Loads</h3>
            <div className="space-y-3">
              {recentLoads.map((load: Load) => (
                <div key={load.id} className="bg-white rounded-lg shadow-material p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">Load #{load.number109}</span>
                    <Badge className="bg-green-100 text-green-800">
                      {load.status === 'completed' ? 'Completed' : 'Delivered'}
                    </Badge>
                  </div>
                  {load.location && (
                    <p className="text-sm text-gray-600 mb-2">
                      📍 {load.location.name}, {load.location.city}
                    </p>
                  )}
                  {load.status === 'delivered' && !load.podDocumentPath && (
                    <Button
                      onClick={() => setSelectedLoadForBOL(load)}
                      className="w-full mt-2"
                      variant="outline"
                    >
                      Upload POD Photo
                    </Button>
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