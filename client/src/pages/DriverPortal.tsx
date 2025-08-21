import { useEffect } from "react";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import DriverLoadCard from "@/components/DriverLoadCard";
import BOLEntryForm from "@/components/BOLEntryForm";
import { Button } from "@/components/ui/button";

export default function DriverPortal() {
  const { toast } = useToast();
  const driverAuth = useDriverAuth();
  const officeAuth = useAuth();
  const adminAuth = useAdminAuth();
  
  // Determine which auth to use - prioritize driver auth, then allow office/admin access
  const isAuthenticated = driverAuth.isAuthenticated || 
    (officeAuth.isAuthenticated && officeAuth.user?.role === "office") ||
    adminAuth.isAuthenticated;
  const isLoading = driverAuth.isLoading && officeAuth.isLoading && adminAuth.isLoading;
  const user = driverAuth.user || officeAuth.user || adminAuth.user;

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
    queryKey: ["/api/loads"],
    enabled: isAuthenticated,
  });

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
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

  const switchToDashboard = () => {
    window.location.href = "/dashboard";
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
        <div className="flex justify-between mt-3">
          {user?.role === "office" && (
            <Button variant="secondary" size="sm" onClick={switchToDashboard}>
              <i className="fas fa-tachometer-alt mr-1"></i>
              Dashboard
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleLogout} className="ml-auto">
            <i className="fas fa-sign-out-alt mr-1"></i>
            Logout
          </Button>
        </div>
      </div>

      <div className="p-4">
        {/* Current Load Card */}
        {currentLoad ? (
          <DriverLoadCard load={currentLoad} />
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
