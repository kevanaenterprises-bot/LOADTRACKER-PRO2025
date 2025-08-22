import { useEffect } from "react";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import DriverLoadCard from "@/components/DriverLoadCard";
import BOLEntryForm from "@/components/BOLEntryForm";
import QuickBOLUpload from "@/components/QuickBOLUpload";
import GPSTracker from "@/components/GPSTracker";
import { Button } from "@/components/ui/button";

export default function DriverPortal() {
  const { toast } = useToast();
  const driverAuth = useDriverAuth();
  
  // Simple authentication check - just like admin portal
  const isAuthenticated = driverAuth.isAuthenticated;
  const isLoading = driverAuth.isLoading;
  const user = driverAuth.user;

  // Enhanced bypass token setup with force refresh capability
  useEffect(() => {
    const setupBypassToken = async () => {
      try {
        console.log("🚀 PRODUCTION: Setting up bypass token for driver portal");
        const response = await fetch("/api/auth/browser-bypass", {
          method: "POST",
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          localStorage.setItem('bypass-token', data.token);
          console.log("✅ PRODUCTION: Driver portal bypass token setup successful");
          console.log("🔑 PRODUCTION: Token stored:", !!localStorage.getItem('bypass-token'));
        } else {
          console.error("❌ PRODUCTION: Bypass token request failed:", response.status);
        }
      } catch (error) {
        console.error("❌ PRODUCTION: Bypass token setup error:", error);
      }
    };

    if (isAuthenticated && !isLoading) {
      setupBypassToken();
    }
  }, [isAuthenticated, isLoading]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/driver-login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: loads = [], isLoading: loadsLoading } = useQuery({
    queryKey: ["/api/driver/loads"],
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Don't show anything, redirect will happen
    return null;
  }

  const currentLoad = Array.isArray(loads) ? loads.find((load: any) => 
    !["completed", "delivered"].includes(load.status)
  ) : null;

  const recentLoads = Array.isArray(loads) ? loads.filter((load: any) => 
    ["completed", "delivered"].includes(load.status)
  ).slice(0, 5) : [];

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/driver-logout", {
        method: "POST",
        credentials: "include"
      });
      window.location.href = "/";
    } catch (error) {
      window.location.href = "/";
    }
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
        {/* Quick BOL Upload - Always at the top */}
        <div className="mb-6">
          <QuickBOLUpload currentLoad={currentLoad} allLoads={loads as any[]} />
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

        {/* BOL Entry Section (only show if there's a current load) */}
        {currentLoad && <BOLEntryForm load={currentLoad} />}

        {/* Recent Loads */}
        {recentLoads.length > 0 && (
          <div className="bg-white rounded-lg shadow-material p-6">
            <h3 className="text-lg font-semibold text-secondary mb-4">Recent Loads</h3>
            <div className="space-y-3">
              {recentLoads.map((load: any) => (
                <div key={load.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
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
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
