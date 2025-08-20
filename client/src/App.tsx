import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import DriverPortal from "@/pages/DriverPortal";
import DriverLogin from "@/pages/DriverLogin";
import NotFound from "@/pages/not-found";

function Router() {
  const officeAuth = useAuth();
  const driverAuth = useDriverAuth();

  const isLoading = officeAuth.isLoading || driverAuth.isLoading;

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
      {/* Driver login page */}
      <Route path="/driver-login" component={DriverLogin} />
      
      {/* Driver portal - for authenticated drivers */}
      {driverAuth.isAuthenticated && (
        <Route path="/driver-portal" component={DriverPortal} />
      )}
      
      {/* Office routes - for authenticated office users */}
      {officeAuth.isAuthenticated && officeAuth.user?.role !== "driver" ? (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
        </>
      ) : (
        <>
          <Route path="/" component={Landing} />
          <Route path="/dashboard" component={Landing} />
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
