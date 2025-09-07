import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import DriverPortal from "@/pages/DriverPortal";
import DriverLogin from "@/pages/DriverLogin";
import AdminLogin from "@/pages/AdminLogin";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      {/* Authentication Pages */}
      <Route path="/admin-login" component={AdminLogin} />
      <Route path="/driver-login" component={DriverLogin} />
      
      {/* Main Application Pages */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/driver-portal" component={DriverPortal} />
      <Route path="/driver" component={DriverPortal} />
      
      {/* Landing page */}
      <Route path="/" component={Landing} />
      
      {/* 404 Not Found */}
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
