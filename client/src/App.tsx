import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import AdminTestDashboard from "@/pages/AdminTestDashboard";
import DriverPortal from "@/pages/DriverPortal";
import DriverLogin from "@/pages/DriverLogin";
import DebugUpload from "@/pages/DebugUpload";
import UploadTest from "@/pages/UploadTest";
import SimpleUploadTest from "@/pages/SimpleUploadTest";
import AdminLogin from "@/pages/AdminLogin";
import NotFound from "@/pages/not-found";

function Router() {
  const officeAuth = useAuth();
  const driverAuth = useDriverAuth();
  const adminAuth = useAdminAuth();

  const isLoading = officeAuth.isLoading || driverAuth.isLoading || adminAuth.isLoading;

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

  return (
    <Switch>
      {/* Admin login page */}
      <Route path="/admin-login" component={AdminLogin} />
      
      {/* Driver login page */}
      <Route path="/driver-login" component={DriverLogin} />
      
      {/* Debug upload page */}
      <Route path="/debug-upload" component={DebugUpload} />
      
      {/* Simple upload test */}
      <Route path="/simple-upload-test" component={SimpleUploadTest} />
      
      {/* Upload test page */}
      <Route path="/upload-test" component={UploadTest} />
      
      {/* Driver portal - for authenticated drivers OR office users accessing it */}
      {(driverAuth.isAuthenticated || (officeAuth.isAuthenticated && officeAuth.user?.role === "office") || adminAuth.isAuthenticated) && (
        <>
          <Route path="/driver-portal" component={DriverPortal} />
          <Route path="/driver" component={DriverPortal} />
        </>
      )}
      
      {/* Admin/Office routes - Check admin auth OR Replit auth (but not drivers) */}
      {adminAuth.isAuthenticated || (officeAuth.isAuthenticated && officeAuth.user?.role !== "driver") ? (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/admin-test" component={AdminTestDashboard} />
        </>
      ) : (
        <>
          {/* Landing page with options for both admin and Replit login */}
          <Route path="/" component={Landing} />
          <Route path="/dashboard" component={Landing} />
          <Route path="/admin-test" component={AdminTestDashboard} />
        </>
      )}
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
