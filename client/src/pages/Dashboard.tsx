import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import StatsCards from "@/components/StatsCards";
import LoadForm from "@/components/LoadForm";
import LoadsTable from "@/components/LoadsTable";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [activeView, setActiveView] = useState<"office" | "driver">("office");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
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
  }, [isAuthenticated, isLoading, toast]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    enabled: isAuthenticated,
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
      }
    },
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

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const switchToDriverView = () => {
    window.location.href = "/driver";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-primary">LoadTracker Pro</h1>
              <nav className="hidden md:ml-8 md:flex md:space-x-8">
                <button 
                  className="nav-btn text-secondary hover:text-primary px-3 py-2 rounded-md text-sm font-medium border-b-2 border-primary"
                >
                  Office Dashboard
                </button>
                {user?.role === "office" && (
                  <button 
                    onClick={switchToDriverView}
                    className="nav-btn text-gray-500 hover:text-primary px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Driver Portal
                  </button>
                )}
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <i className="fas fa-bell text-gray-400 hover:text-primary cursor-pointer text-xl"></i>
                <span className="absolute -top-1 -right-1 bg-error text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  0
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <img 
                  className="h-8 w-8 rounded-full bg-primary" 
                  src={user?.profileImageUrl || `https://ui-avatars.io/api/?name=${user?.firstName}+${user?.lastName}&background=1976D2&color=fff`}
                  alt="User avatar" 
                />
                <span className="text-sm font-medium text-secondary">
                  {user?.firstName} {user?.lastName}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <i className="fas fa-sign-out-alt mr-2"></i>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Dashboard Stats */}
        <StatsCards stats={stats} isLoading={statsLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Create New Load Form */}
          <div className="lg:col-span-1">
            <LoadForm />
          </div>

          {/* Active Loads Table */}
          <div className="lg:col-span-2">
            <LoadsTable />
          </div>
        </div>
      </div>
    </div>
  );
}
