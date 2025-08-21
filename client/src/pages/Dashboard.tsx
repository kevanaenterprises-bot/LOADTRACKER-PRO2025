import { useEffect, useState } from "react";
import { useMainAuth } from "@/hooks/useMainAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import StatsCards from "@/components/StatsCards";
import LoadForm from "@/components/LoadForm";
import LoadsTable from "@/components/LoadsTable";
import InvoiceInbox from "@/components/InvoiceInbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading, authType } = useMainAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"loads" | "drivers" | "invoicing">("loads");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Please log in...",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/");
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast, setLocation]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    enabled: isAuthenticated && !isLoading,
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

  const handleLogout = async () => {
    try {
      if (authType === 'admin') {
        await fetch("/api/auth/admin-logout", {
          method: "POST",
          credentials: "include"
        });
        setLocation("/");
      } else if (authType === 'driver') {
        await fetch("/api/auth/driver-logout", {
          method: "POST",
          credentials: "include"
        });
        setLocation("/");
      } else {
        // Replit logout
        window.location.href = "/api/logout";
      }
    } catch (error) {
      // Fallback to Replit logout
      window.location.href = "/api/logout";
    }
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
                  src={user?.profileImageUrl || `https://ui-avatars.io/api/?name=${user?.firstName || 'User'}+${user?.lastName || 'User'}&background=1976D2&color=fff`}
                  alt="User avatar" 
                />
                <span className="text-sm font-medium text-secondary">
                  {user?.firstName || 'User'} {user?.lastName || ''}
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
        <StatsCards stats={stats as any} isLoading={statsLoading} />

        {/* Test Data Button (Development) */}
        {process.env.NODE_ENV === "development" && (
          <div className="mt-4 flex justify-center">
            <Button 
              onClick={async () => {
                try {
                  const response = await fetch("/api/test/create-sample-loads", {
                    method: "POST",
                    credentials: "include"
                  });
                  const result = await response.json();
                  
                  if (response.ok) {
                    toast({
                      title: "Test Data Created",
                      description: result.message,
                    });
                    // Refresh the loads data
                    window.location.reload();
                  } else {
                    toast({
                      title: "Error",
                      description: result.message,
                      variant: "destructive",
                    });
                  }
                } catch (error) {
                  toast({
                    title: "Error",
                    description: "Failed to create test data",
                    variant: "destructive",
                  });
                }
              }}
              variant="outline"
              className="bg-yellow-50 border-yellow-200 text-yellow-800 hover:bg-yellow-100"
            >
              🧪 Create Test Loads for Demo
            </Button>
          </div>
        )}

        {/* Main Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="mt-8">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="loads" className="flex items-center gap-2">
              <i className="fas fa-truck"></i>
              Load Management
            </TabsTrigger>
            <TabsTrigger value="drivers" className="flex items-center gap-2">
              <i className="fas fa-users"></i>
              Driver Management
            </TabsTrigger>
            <TabsTrigger value="invoicing" className="flex items-center gap-2">
              <i className="fas fa-file-invoice-dollar"></i>
              Automated Invoicing
            </TabsTrigger>
          </TabsList>

          {/* Load Management Tab */}
          <TabsContent value="loads" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Create New Load Form */}
              <div className="lg:col-span-1">
                <LoadForm />
              </div>

              {/* Active Loads Table */}
              <div className="lg:col-span-2">
                <LoadsTable />
              </div>
            </div>
          </TabsContent>

          {/* Driver Management Tab */}
          <TabsContent value="drivers" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <i className="fas fa-user-plus text-primary"></i>
                    Add New Driver
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">
                    Register new drivers to assign loads and enable mobile access to the driver portal.
                  </p>
                  <Button className="w-full">
                    <i className="fas fa-plus mr-2"></i>
                    Add Driver
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <i className="fas fa-mobile-alt text-primary"></i>
                    Driver Portal Access
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">
                    Switch to driver view to see the mobile interface for BOL entry and status updates.
                  </p>
                  <Button variant="outline" className="w-full" onClick={switchToDriverView}>
                    <i className="fas fa-eye mr-2"></i>
                    View Driver Portal
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Invoicing Tab */}
          <TabsContent value="invoicing" className="mt-6">
            <InvoiceInbox />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
