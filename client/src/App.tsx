import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import PaidLoads from "@/pages/PaidLoads";
import DriverPortal from "@/pages/DriverPortal";
import DriverLogin from "@/pages/DriverLogin";
import AdminLogin from "@/pages/AdminLogin";
import Chat from "@/pages/Chat";
import IFTAReport from "@/pages/IFTAReport";
import DemoLanding from "@/pages/DemoLanding";
import AgingReport from "@/pages/AgingReport";
import TTSGenerator from "@/pages/TTSGenerator";
import LoadRightTenders from "@/pages/LoadRightTenders";
import AdminTestDashboard from "@/pages/AdminTestDashboard";
import RateConfirmationGenerator from "@/pages/RateConfirmationGenerator";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      {/* Authentication Pages */}
      <Route path="/admin-login" component={AdminLogin} />
      <Route path="/driver-login" component={DriverLogin} />
      
      {/* Demo System */}
      <Route path="/demo" component={DemoLanding} />
      
      {/* Main Application Pages */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/paid-loads" component={PaidLoads} />
      <Route path="/ifta-report" component={IFTAReport} />
      <Route path="/aging-report" component={AgingReport} />
      <Route path="/tts-generator" component={TTSGenerator} />
      <Route path="/loadright" component={LoadRightTenders} />
      <Route path="/rate-confirmations" component={RateConfirmationGenerator} />
      <Route path="/admin-test-dashboard" component={AdminTestDashboard} />
      <Route path="/driver-portal" component={DriverPortal} />
      <Route path="/driver" component={DriverPortal} />
      <Route path="/chat" component={Chat} />
      
      {/* Landing page */}
      <Route path="/" component={Landing} />
      
      {/* 404 Not Found */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
