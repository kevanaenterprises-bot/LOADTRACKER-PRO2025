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
import CustomerManagement from "@/components/CustomerManagement";
import DriverLogin from "@/pages/DriverLogin";
import DebugUpload from "@/pages/DebugUpload";
import ProductionDebug from "@/pages/ProductionDebug";
import QuickDebugAccess from "@/pages/QuickDebugAccess";
import SimpleLoadTest from "@/pages/SimpleLoadTest";
import EmergencyLoadTest from "@/pages/EmergencyLoadTest";
import DriverTestDebug from "@/pages/DriverTestDebug";
import UploadTest from "@/pages/UploadTest";
import QuickUploadPage from "@/pages/QuickUploadPage";
import InvoiceTestPage from "@/pages/InvoiceTestPage";
import TestNavigation from "@/components/TestNavigation";
import SimpleUploadTest from "@/pages/SimpleUploadTest";
import AdminLogin from "@/pages/AdminLogin";
import TestLoadClicks from "@/pages/TestLoadClicks";
import QuickInvoiceTest from "@/pages/QuickInvoiceTest";
import AdminInvoiceTest from "@/pages/AdminInvoiceTest";
import SimpleInvoiceTest from "@/pages/SimpleInvoiceTest";
import QuickDriverAssignTest from "@/pages/QuickDriverAssignTest";
import DriverAssignmentGuide from "@/pages/DriverAssignmentGuide";
import TroubleshootPage from "@/pages/TroubleshootPage";
import DebugInvoice from "@/pages/DebugInvoice";
import AdminTestPage from "@/pages/AdminTestPage";
import SimpleDriverTest from "@/pages/SimpleDriverTest";
import QuickLogin from "@/pages/QuickLogin";
import NotFound from "@/pages/not-found";

function Router() {
  // Remove the authentication loading checks to prevent infinite loops
  // Each protected route will handle its own authentication

  return (
    <Switch>
      {/* Admin login page */}
      <Route path="/admin-login" component={AdminLogin} />
      
      {/* Quick login page */}
      <Route path="/quick-login" component={QuickLogin} />
      
      {/* Driver login page */}
      <Route path="/driver-login" component={DriverLogin} />
      
      {/* Debug upload page */}
      <Route path="/debug-upload" component={DebugUpload} />
      
      {/* Simple upload test */}
      <Route path="/simple-upload-test" component={SimpleUploadTest} />
      
      {/* Upload test page */}
      <Route path="/upload-test" component={UploadTest} />
      
      {/* Quick upload page */}
      <Route path="/quick-upload" component={QuickUploadPage} />
      
      {/* Invoice test page */}
      <Route path="/invoice-test" component={InvoiceTestPage} />
      
      {/* Test navigation */}
      <Route path="/test" component={TestNavigation} />
      
      {/* Test load clicks */}
      <Route path="/test-loads" component={TestLoadClicks} />
      
      {/* Quick invoice test */}
      <Route path="/quick-invoice" component={QuickInvoiceTest} />
      
      {/* Admin invoice test */}
      <Route path="/admin-invoice" component={AdminInvoiceTest} />
      
      {/* Simple invoice test */}
      <Route path="/simple-invoice" component={SimpleInvoiceTest} />
      
      {/* Debug invoice */}
      <Route path="/debug-invoice" component={DebugInvoice} />
      
      {/* Admin test page - always accessible */}
      <Route path="/admin-test" component={AdminTestPage} />
      
      {/* Quick driver assignment test - always accessible */}
      <Route path="/quick-assign" component={QuickDriverAssignTest} />
      
      {/* Driver assignment guide - always accessible */}
      <Route path="/how-to-assign" component={DriverAssignmentGuide} />
      
      {/* Troubleshoot page - always accessible */}
      <Route path="/troubleshoot" component={TroubleshootPage} />
      
      {/* Production debug page - always accessible */}
      <Route path="/production-debug" component={ProductionDebug} />
      
      {/* Quick debug access - always accessible */}
      <Route path="/debug" component={QuickDebugAccess} />
      
      {/* Simple load test - always accessible */}
      <Route path="/simple-load-test" component={SimpleLoadTest} />
      
      {/* Emergency load test - always accessible */}
      <Route path="/emergency-load-test" component={EmergencyLoadTest} />
      
      {/* Driver debug test - always accessible */}
      <Route path="/driver-debug-test" component={DriverTestDebug} />
      
      {/* Simple driver test - always accessible */}
      <Route path="/simple-test" component={SimpleDriverTest} />
      
      {/* Driver portal - always available for production access */}
      <Route path="/driver-portal" component={DriverPortal} />
      <Route path="/driver" component={DriverPortal} />
      
      {/* Customer management - admin access */}
      <Route path="/customers" component={CustomerManagement} />
      
      {/* Landing page by default */}
      <Route path="/" component={Landing} />
      <Route path="/dashboard" component={Dashboard} />
      
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
