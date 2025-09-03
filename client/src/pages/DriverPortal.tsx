import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import StandaloneBOLUpload from "@/components/StandaloneBOLUpload";
import { SimpleFileUpload } from "@/components/SimpleFileUpload";
import DriverLoadCard from "@/components/DriverLoadCard";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { apiRequest } from "@/lib/queryClient";

export default function DriverPortal() {
  console.log("🚨 DEBUG: DriverPortal loading...");
  
  const { user, logout, isLoading, isAuthenticated, error } = useDriverAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  console.log("🚨 Auth state:", { isAuthenticated, isLoading, hasUser: !!user, error });

  // Show loading while authentication is being checked
  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <h2 className="text-lg font-semibold">Loading...</h2>
          <p className="text-gray-600 mt-2">Checking authentication</p>
        </div>
      </div>
    );
  }

  // Show error if authentication failed
  if (error) {
    return (
      <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <h2 className="text-lg font-semibold text-red-600">Authentication Error</h2>
          <p className="text-gray-600 mt-2">{String(error)}</p>
          <Button onClick={() => window.location.href = '/driver-login'} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <h2 className="text-lg font-semibold">Please Log In</h2>
          <p className="text-gray-600 mt-2">You need to log in to access the driver portal</p>
          <Button onClick={() => window.location.href = '/driver-login'} className="mt-4">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  // Get driver's assigned loads
  const { data: loads = [], isLoading: loadsLoading } = useQuery({
    queryKey: ["/api/driver/loads", user.id],
    enabled: !!user.id,
  }) as { data: any[], isLoading: boolean };

  const [selectedLoadForBOL, setSelectedLoadForBOL] = useState<any>(null);

  console.log("🚛 Driver loads:", { loads, loadsLoading, userID: user.id });

  // Get current load (first assigned load)
  const currentLoad = loads.find((load: any) => load.status !== 'delivered') || loads[0];
  const recentLoads = loads.slice(0, 3);

  // SUCCESS: Show authenticated driver portal with full functionality
  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-green-600">Driver Portal</h1>
            <p className="mt-1">Welcome, {user.firstName} {user.lastName}!</p>
            <p className="text-sm text-gray-600">Username: {user.username}</p>
          </div>
          <Button onClick={logout} variant="outline" size="sm">
            Logout
          </Button>
        </div>
      </div>

      {/* Current Load Assignment */}
      {loadsLoading ? (
        <Card className="mb-4">
          <CardContent className="p-6">
            <p className="text-center text-gray-600">Loading your assignments...</p>
          </CardContent>
        </Card>
      ) : currentLoad ? (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Current Assignment</h2>
          <DriverLoadCard key={currentLoad.id} load={currentLoad} />
        </div>
      ) : (
        <Card className="mb-4">
          <CardContent className="p-6 text-center">
            <h3 className="font-semibold text-gray-700">No Active Assignments</h3>
            <p className="text-gray-600 mt-2">You don't have any active load assignments. Check back later or contact dispatch.</p>
          </CardContent>
        </Card>
      )}

      {/* BOL Upload Section */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">BOL Upload</h2>
        <StandaloneBOLUpload />
      </div>

      {/* Recent Loads */}
      {recentLoads.length > 0 && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Recent Loads</h2>
          <div className="space-y-2">
            {recentLoads.map((load: any) => (
              <Card key={load.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{load.number109}</p>
                      <p className="text-sm text-gray-600">{load.pickupLocation} → {load.deliveryLocation}</p>
                    </div>
                    <Badge variant={load.status === 'delivered' ? 'default' : 'secondary'}>
                      {load.status}
                    </Badge>
                  </div>
                  {load.status !== 'delivered' && (
                    <Button 
                      onClick={() => setSelectedLoadForBOL(load)}
                      variant="outline" 
                      size="sm" 
                      className="mt-2 w-full"
                    >
                      Upload BOL
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* BOL Upload Dialog */}
      <Dialog open={!!selectedLoadForBOL} onOpenChange={() => setSelectedLoadForBOL(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload BOL for Load {selectedLoadForBOL?.number109}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <SimpleFileUpload
              onUploadComplete={async (file: any) => {
                try {
                  const result = await apiRequest(`/api/loads/${selectedLoadForBOL.id}/pod`, "POST", {
                    filename: file.name,
                    gcsPath: file.gcsPath
                  });
                  
                  toast({
                    title: "BOL Uploaded Successfully",
                    description: `BOL for load ${selectedLoadForBOL.number109} has been uploaded.`,
                  });
                  
                  queryClient.invalidateQueries({ queryKey: ["/api/driver/loads"] });
                  setSelectedLoadForBOL(null);
                } catch (error) {
                  console.error("BOL upload failed:", error);
                  toast({
                    title: "Upload Failed",
                    description: "Failed to upload BOL. Please try again.",
                    variant: "destructive",
                  });
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}