import { useEffect, useState } from "react";
import { useMainAuth } from "@/hooks/useMainAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import StatsCards from "@/components/StatsCards";
import LoadForm from "@/components/LoadForm";
import LoadsTable from "@/components/LoadsTable";
import InvoiceInbox from "@/components/InvoiceInbox";
import { OCRUploader } from "@/components/OCRUploader";
import HereMap from "@/components/HereMap";
import { DriverList } from "@/components/DriverList";
import { OfficeStaffForm } from "@/components/OfficeStaffForm";
import { OfficeStaffList } from "@/components/OfficeStaffList";
import { Header } from "@/components/Header";
import CustomerForm from "@/components/CustomerForm";
import LocationManagement from "@/components/LocationManagement";
import RateManagement from "@/components/RateManagement";
import { CacheDebugger } from "@/components/CacheDebugger";
import { PaidInvoices } from "@/components/PaidInvoices";
import GhostLoadCleanup from "@/components/GhostLoadCleanup";
import ClearAllData from "@/components/ClearAllData";
import TruckForm from "@/components/TruckForm";
import TruckTable from "@/components/TruckTable";
import { TruckServiceManagement } from "@/components/TruckServiceManagement";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Form schemas
const driverSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits"),
  username: z.string().min(1, "Username is required"),
  isCompanyDriver: z.boolean().default(false),
  payType: z.enum(["percentage", "mileage"]).default("percentage"),
  percentageRate: z.string().optional(),
  mileageRate: z.string().optional(),
}).refine(
  (data) => {
    if (data.payType === "percentage") {
      return data.percentageRate && parseFloat(data.percentageRate) > 0;
    }
    return true;
  },
  {
    message: "Percentage rate is required for percentage-based pay",
    path: ["percentageRate"],
  }
).refine(
  (data) => {
    if (data.payType === "mileage") {
      return data.mileageRate && parseFloat(data.mileageRate) > 0;
    }
    return true;
  },
  {
    message: "Mileage rate is required for mileage-based pay",
    path: ["mileageRate"],
  }
);

const locationSchema = z.object({
  name: z.string().min(1, "Location name is required"),
  address: z.string().optional(), // Optional for future geo-fencing
  city: z.string().optional(), // Optional for future geo-fencing  
  state: z.string().optional(), // Optional for future geo-fencing
  flatRate: z.string().min(1, "Rate is required"),
});

const rateSchema = z.object({
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required").max(2, "Use 2-letter state code"),
  flatRate: z.string().min(1, "Rate is required"),
});

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading, authType } = useMainAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"loads" | "drivers" | "trucks" | "ocr" | "tracking" | "customers" | "locations" | "rates" | "paid-invoices" | "cleanup" | "clearall">("loads");
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const queryClient = useQueryClient();

  // Setup bypass token automatically when authenticated (just like test pages)
  useEffect(() => {
    const setupBypassToken = async () => {
      if (!localStorage.getItem('bypass-token')) {
        try {
          const response = await fetch("/api/auth/browser-bypass", {
            method: "POST",
            credentials: "include",
          });
          if (response.ok) {
            const data = await response.json();
            localStorage.setItem('bypass-token', data.token);
          }
        } catch (error) {
          // Silent fail - will use normal authentication
        }
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

  // Form handlers
  const driverForm = useForm({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phoneNumber: "",
      username: "",
      isCompanyDriver: false,
      payType: "percentage" as const,
      percentageRate: "",
      mileageRate: "",
    },
  });

  const locationForm = useForm({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      state: "",
      flatRate: "",
    },
  });

  const rateForm = useForm({
    resolver: zodResolver(rateSchema),
    defaultValues: {
      city: "",
      state: "",
      flatRate: "0",
    },
  });

  // Mutations
  const createDriverMutation = useMutation({
    mutationFn: async (data: any) => {
      setDebugLog(prev => [...prev, "🚀 Starting driver creation..."]);
      setDebugLog(prev => [...prev, `📝 Data: ${JSON.stringify(data, null, 2)}`]);
      setDebugLog(prev => [...prev, `🔑 Bypass token: ${!!localStorage.getItem('bypass-token')}`]);
      
      try {
        // Convert rate strings to numbers before submission
        const transformedData = {
          ...data,
          percentageRate: data.percentageRate ? parseFloat(data.percentageRate) : undefined,
          mileageRate: data.mileageRate ? parseFloat(data.mileageRate) : undefined,
        };
        
        const result = await apiRequest("/api/drivers", "POST", transformedData);
        setDebugLog(prev => [...prev, "✅ SUCCESS! Driver created"]);
        return result;
      } catch (error: any) {
        setDebugLog(prev => [...prev, `💥 ERROR: ${error.message}`]);
        throw error;
      }
    },
    onSuccess: (result) => {
      console.log("🎉 Driver mutation onSuccess triggered:", result);
      toast({
        title: "Driver Added",
        description: `New driver ${result.username} has been successfully registered.`,
      });
      driverForm.reset();
      setDriverDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/available"] });
    },
    onError: (error: any) => {
      console.error("💥 Dashboard driver creation error details:");
      console.error("Error object:", error);
      console.error("Error message:", error?.message);
      console.error("Error stack:", error?.stack);
      console.error("Error response:", error?.response);
      
      toast({
        title: "Driver Creation Failed",
        description: `Error: ${error?.message || "Failed to add driver. Please try again."}`,
        variant: "destructive",
      });
    },
  });

  const createLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/locations", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Location Added",
        description: "New location has been successfully created.",
      });
      locationForm.reset();
      setLocationDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
    },
    onError: (error: any) => {
      console.error("Location creation error:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to add location. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createRateMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/rates", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Rate Added",
        description: "New rate has been successfully created.",
      });
      rateForm.reset();
      setRateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/rates"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add rate. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Combined location and rate handler
  const onSubmitLocationAndRate = async (data: any) => {
    try {
      // First create the location
      const locationData = {
        name: data.name,
        city: data.city,
        state: data.state,
      };
      await createLocationMutation.mutateAsync(locationData);

      // Then create the rate for this location
      const rateData = {
        city: data.city,
        state: data.state,
        flatRate: data.flatRate,
      };
      await createRateMutation.mutateAsync(rateData);

      toast({
        title: "Success",
        description: "Location and rate have been added successfully.",
      });
      locationForm.reset();
      setLocationDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add location and rate. Please try again.",
        variant: "destructive",
      });
    }
  };

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
      console.log("Logout attempt - authType:", authType);
      if (authType === 'admin') {
        const response = await fetch("/api/auth/admin-logout", {
          method: "POST",
          credentials: "include"
        });
        console.log("Admin logout response:", response.status);
        // Force hard refresh to clear all state
        window.location.href = "/";
      } else if (authType === 'driver') {
        await fetch("/api/auth/driver-logout", {
          method: "POST", 
          credentials: "include"
        });
        window.location.href = "/";
      } else {
        // Replit logout
        console.log("Using Replit logout");
        window.location.href = "/api/logout";
      }
    } catch (error) {
      console.error("Logout error:", error);
      // Force fallback to Replit logout
      window.location.href = "/api/logout";
    }
  };

  const switchToDriverView = () => {
    window.location.href = "/driver-portal";
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header with Logo */}
      <Header title="LoadTracker Pro" />
      
      {/* Mobile-Optimized Navigation Bar */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <nav className="flex space-x-2 sm:space-x-8">
              <button 
                className="text-blue-600 hover:text-blue-800 px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium border-b-2 border-blue-600"
              >
                <span className="hidden sm:inline">Office Dashboard</span>
                <span className="sm:hidden">Dashboard</span>
              </button>
              {user?.role === "office" && (
                <button 
                  onClick={switchToDriverView}
                  className="text-gray-500 hover:text-blue-600 px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium"
                >
                  <span className="hidden sm:inline">Driver Portal</span>
                  <span className="sm:hidden">Driver</span>
                </button>
              )}
            </nav>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="flex items-center space-x-1 sm:space-x-2">
              <img 
                className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-blue-600" 
                src={user?.profileImageUrl || `https://ui-avatars.io/api/?name=${user?.firstName || 'User'}+${user?.lastName || 'User'}&background=1976D2&color=fff`}
                alt="User avatar" 
              />
              <span className="hidden sm:inline text-sm font-medium text-gray-700">
                {user?.firstName || 'User'} {user?.lastName || ''}
              </span>
              <span className="sm:hidden text-xs font-medium text-gray-700">
                {(user?.firstName || 'User').substring(0, 1)}{(user?.lastName || '').substring(0, 1)}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">Logout</span>
              <span className="sm:hidden">Exit</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto py-3 sm:py-6 px-2 sm:px-4 lg:px-8">
        {/* Dashboard Stats */}
        <StatsCards 
          stats={stats as any} 
          isLoading={statsLoading} 
          onActiveLoadsClick={() => setActiveTab("loads")}
        />
        
        {/* Cache Debugger Component - Hidden on mobile for space */}
        <div className="hidden sm:block">
          <CacheDebugger />
        </div>
        
        {/* Driver Debug Button - Smaller on mobile */}
        <div className="mt-2 sm:mt-4 flex justify-center">
          <Button 
            onClick={() => window.open('/driver-debug-test', '_blank')}
            variant="outline"
            size="sm"
            className="bg-red-50 border-red-200 text-red-800 hover:bg-red-100 text-xs sm:text-sm px-2 sm:px-4"
          >
            🔧 <span className="hidden sm:inline">Debug Driver Creation Issue</span><span className="sm:hidden">Debug</span>
          </Button>
        </div>


        {/* Mobile-Optimized Main Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="mt-4 sm:mt-8">
          {/* Mobile: Show horizontal scrolling tabs, Desktop: Grid layout */}
          <div className="overflow-x-auto scrollbar-hide">
            <TabsList className="hidden md:grid w-full grid-cols-2 md:grid-cols-5 lg:grid-cols-5 h-auto gap-1">
              <TabsTrigger value="loads" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-blue-700 hover:text-blue-900 font-semibold min-h-[60px] touch-target">
                <i className="fas fa-truck text-lg md:text-base text-blue-600"></i>
                <span className="text-center leading-tight">Load Management</span>
              </TabsTrigger>
              <TabsTrigger value="tracking" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-green-700 hover:text-green-900 font-semibold min-h-[60px] touch-target">
                <i className="fas fa-map text-lg md:text-base text-green-600"></i>
                <span className="text-center leading-tight">Real-Time Tracking</span>
              </TabsTrigger>
              <TabsTrigger value="ocr" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-purple-700 hover:text-purple-900 font-semibold min-h-[60px] touch-target">
                <i className="fas fa-camera text-lg md:text-base text-purple-600"></i>
                <span className="text-center leading-tight">Rate Con Scanner</span>
              </TabsTrigger>
              <TabsTrigger value="drivers" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-orange-700 hover:text-orange-900 font-semibold min-h-[60px] touch-target">
                <i className="fas fa-users text-lg md:text-base text-orange-600"></i>
                <span className="text-center leading-tight">Driver Management</span>
              </TabsTrigger>
              <TabsTrigger value="trucks" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-amber-700 hover:text-amber-900 font-semibold min-h-[60px] touch-target">
                <i className="fas fa-truck text-lg md:text-base text-amber-600"></i>
                <span className="text-center leading-tight">Truck Management</span>
              </TabsTrigger>
              <TabsTrigger value="customers" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-indigo-700 hover:text-indigo-900 font-semibold min-h-[60px] touch-target">
                <i className="fas fa-building text-lg md:text-base text-indigo-600"></i>
                <span className="text-center leading-tight">Customers</span>
              </TabsTrigger>
              <TabsTrigger value="locations" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-purple-700 hover:text-purple-900 font-semibold min-h-[60px] touch-target">
                <i className="fas fa-map-marker-alt text-lg md:text-base text-purple-600"></i>
                <span className="text-center leading-tight">Locations</span>
              </TabsTrigger>
              <TabsTrigger value="rates" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-green-700 hover:text-green-900 font-semibold min-h-[60px] touch-target">
                <i className="fas fa-dollar-sign text-lg md:text-base text-green-600"></i>
                <span className="text-center leading-tight">Rates</span>
              </TabsTrigger>
              <TabsTrigger value="paid-invoices" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-emerald-700 hover:text-emerald-900 font-semibold min-h-[60px] touch-target">
                <i className="fas fa-check-circle text-lg md:text-base text-emerald-600"></i>
                <span className="text-center leading-tight">Paid Invoices</span>
              </TabsTrigger>
              <TabsTrigger value="cleanup" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-red-700 hover:text-red-900 font-semibold min-h-[60px] touch-target">
                <i className="fas fa-trash text-lg md:text-base text-red-600"></i>
                <span className="text-center leading-tight">Ghost Load Cleanup</span>
              </TabsTrigger>
              <TabsTrigger value="clearall" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-orange-700 hover:text-orange-900 font-semibold min-h-[60px] touch-target bg-orange-100 border-2 border-orange-300">
                <i className="fas fa-broom text-lg md:text-base text-orange-700"></i>
                <span className="text-center leading-tight">Clear Load Data</span>
              </TabsTrigger>
            </TabsList>
            
            {/* Mobile: Horizontal scrolling tabs */}
            <TabsList className="md:hidden flex w-max min-w-full h-auto gap-2 p-2">
              <TabsTrigger value="loads" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target">
                <i className="fas fa-truck text-xl text-blue-600"></i>
                <span className="text-center leading-tight">Loads</span>
              </TabsTrigger>
              <TabsTrigger value="tracking" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target">
                <i className="fas fa-map text-xl text-green-600"></i>
                <span className="text-center leading-tight">Tracking</span>
              </TabsTrigger>
              <TabsTrigger value="ocr" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target">
                <i className="fas fa-camera text-xl text-purple-600"></i>
                <span className="text-center leading-tight">Scanner</span>
              </TabsTrigger>
              <TabsTrigger value="drivers" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target">
                <i className="fas fa-users text-xl text-orange-600"></i>
                <span className="text-center leading-tight">Drivers</span>
              </TabsTrigger>
              <TabsTrigger value="trucks" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target">
                <i className="fas fa-truck text-xl text-amber-600"></i>
                <span className="text-center leading-tight">Trucks</span>
              </TabsTrigger>
              <TabsTrigger value="customers" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target">
                <i className="fas fa-building text-xl text-indigo-600"></i>
                <span className="text-center leading-tight">Customers</span>
              </TabsTrigger>
              <TabsTrigger value="locations" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target">
                <i className="fas fa-map-marker-alt text-xl text-purple-600"></i>
                <span className="text-center leading-tight">Locations</span>
              </TabsTrigger>
              <TabsTrigger value="rates" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target">
                <i className="fas fa-dollar-sign text-xl text-green-600"></i>
                <span className="text-center leading-tight">Rates</span>
              </TabsTrigger>
              <TabsTrigger value="paid-invoices" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target">
                <i className="fas fa-check-circle text-xl text-emerald-600"></i>
                <span className="text-center leading-tight">Paid</span>
              </TabsTrigger>
              <TabsTrigger value="cleanup" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target">
                <i className="fas fa-trash text-xl text-red-600"></i>
                <span className="text-center leading-tight">Cleanup</span>
              </TabsTrigger>
              <TabsTrigger value="clearall" className="flex flex-col items-center gap-1 p-3 text-xs font-semibold min-h-[70px] min-w-[80px] touch-target bg-orange-100 border-2 border-orange-300">
                <i className="fas fa-broom text-xl text-orange-700"></i>
                <span className="text-center leading-tight">Clear Loads</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Load Management Tab */}
          <TabsContent value="loads" className="mt-4 sm:mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
              {/* Create New Load Form */}
              <div className="lg:col-span-1 order-2 lg:order-1">
                <LoadForm />
              </div>

              {/* Active Loads Table - Show first on mobile */}
              <div className="lg:col-span-2 order-1 lg:order-2">
                <div className="mb-4 flex justify-between items-center">
                  <h2 className="text-xl font-semibold">Active Loads</h2>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => setLocation("/ifta-report")}
                      className="flex items-center gap-2 bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100"
                      data-testid="button-view-ifta-report"
                    >
                      <i className="fas fa-gas-pump text-blue-600"></i>
                      IFTA Report
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setLocation("/paid-loads")}
                      className="flex items-center gap-2 bg-green-50 border-green-200 text-green-800 hover:bg-green-100"
                      data-testid="button-view-paid-loads"
                    >
                      <i className="fas fa-archive text-green-600"></i>
                      View Paid Loads
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setLocation("/tts-generator")}
                      className="flex items-center gap-2 bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100"
                      data-testid="button-tts-generator"
                    >
                      <i className="fas fa-microphone text-purple-600"></i>
                      TTS Audio
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setLocation("/loadright")}
                      className="flex items-center gap-2 bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100"
                      data-testid="button-loadright"
                    >
                      <i className="fas fa-shipping-fast text-orange-600"></i>
                      LoadRight
                    </Button>
                  </div>
                </div>
                <LoadsTable />
              </div>
            </div>
          </TabsContent>

          {/* Real-Time Tracking Tab */}
          <TabsContent value="tracking" className="mt-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Real-Time Fleet Tracking</h2>
              <p className="text-gray-600">
                Live tracking map powered by HERE Maps showing all active loads with GPS-enabled drivers. View real-time positions, 
                delivery destinations, weather conditions, and fuel prices along routes.
              </p>
            </div>
            <HereMap />
          </TabsContent>

          {/* OCR Rate Con Scanner Tab */}
          <TabsContent value="ocr" className="mt-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Rate Con Scanner</h2>
                <p className="text-gray-600">
                  Upload rate confirmation documents (PDF, PNG, JPEG, GIF, WebP) to automatically extract load details and generate new loads.
                  Powered by Google Cloud Document AI, the system will read load numbers, PO numbers, appointment times, company names, and addresses from any document format.
                </p>
              </div>
              <OCRUploader />
            </div>
          </TabsContent>

          {/* Driver Management Tab */}
          <TabsContent value="drivers" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                  <div className="space-y-2">
                    <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
                      <DialogTrigger asChild>
                        <Button className="w-full">
                          <i className="fas fa-plus mr-2"></i>
                          Add Driver
                        </Button>
                      </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Driver</DialogTitle>
                      </DialogHeader>
                      <Form {...driverForm}>
                        <form onSubmit={driverForm.handleSubmit((data) => createDriverMutation.mutate(data))} className="space-y-4">
                          <FormField
                            control={driverForm.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>First Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="John" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={driverForm.control}
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Last Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Smith" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={driverForm.control}
                            name="phoneNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Phone Number</FormLabel>
                                <FormControl>
                                  <Input placeholder="1234567890" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={driverForm.control}
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Username (for driver login)</FormLabel>
                                <FormControl>
                                  <Input placeholder="john_smith" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={driverForm.control}
                            name="payType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Pay Structure</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-pay-type">
                                      <SelectValue placeholder="Select pay type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="percentage">Percentage of Revenue</SelectItem>
                                    <SelectItem value="mileage">Per Mile Rate</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {driverForm.watch("payType") === "percentage" && (
                            <FormField
                              control={driverForm.control}
                              name="percentageRate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Percentage Rate (%)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      placeholder="70" 
                                      {...field} 
                                      data-testid="input-percentage-rate"
                                    />
                                  </FormControl>
                                  <p className="text-sm text-muted-foreground">
                                    Driver earns this percentage of load revenue (e.g., 70%)
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                          {driverForm.watch("payType") === "mileage" && (
                            <FormField
                              control={driverForm.control}
                              name="mileageRate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Per Mile Rate ($)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      step="0.01"
                                      placeholder="1.50" 
                                      {...field} 
                                      data-testid="input-mileage-rate"
                                    />
                                  </FormControl>
                                  <p className="text-sm text-muted-foreground">
                                    Driver earns this amount per mile (e.g., $1.50/mile)
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                          <FormField
                            control={driverForm.control}
                            name="isCompanyDriver"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                  <input
                                    type="checkbox"
                                    checked={field.value}
                                    onChange={field.onChange}
                                    className="h-4 w-4 rounded border-gray-300"
                                    data-testid="checkbox-company-driver"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel className="font-medium">
                                    Company Driver (IFTA Miles Tracking)
                                  </FormLabel>
                                  <p className="text-sm text-muted-foreground">
                                    ✅ Check this box to enable automatic IFTA mileage tracking and fuel receipt collection for this driver
                                  </p>
                                </div>
                              </FormItem>
                            )}
                          />
                          <Button type="submit" disabled={createDriverMutation.isPending} data-testid="button-submit-driver">
                            {createDriverMutation.isPending ? "Adding..." : "Add Driver"}
                          </Button>
                        </form>
                      </Form>
                    </DialogContent>
                    </Dialog>
                    
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => window.open('/driver-debug-test', '_blank')}
                    >
                      🔧 Debug Driver Creation
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Driver List Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <i className="fas fa-users text-primary"></i>
                    Current Drivers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DriverList />
                </CardContent>
              </Card>

              {/* Office Staff Management Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <i className="fas fa-user-tie text-primary"></i>
                    Office Staff
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">
                    Create office staff accounts with username and password for dashboard access.
                  </p>
                  <OfficeStaffForm />
                </CardContent>
              </Card>

              {/* Office Staff List Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <i className="fas fa-users-cog text-primary"></i>
                    Current Office Staff
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <OfficeStaffList />
                </CardContent>
              </Card>

              {/* Location & Rate Management Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <i className="fas fa-map-marker-alt text-primary"></i>
                    Location & Rate Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-600 mb-4">
                    Register delivery locations with flat rates for automatic invoice calculations.
                  </p>
                  
                  <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <i className="fas fa-plus mr-2"></i>
                        Add Location & Rate
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Location & Rate</DialogTitle>
                      </DialogHeader>
                      <Form {...locationForm}>
                        <form onSubmit={locationForm.handleSubmit(onSubmitLocationAndRate)} className="space-y-4">
                          <FormField
                            control={locationForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Location Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Miami Distribution Center" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={locationForm.control}
                            name="address"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Address (Optional - for future geo-fencing)</FormLabel>
                                <FormControl>
                                  <Input placeholder="123 Industrial Blvd" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={locationForm.control}
                            name="city"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>City (Optional - for future geo-fencing)</FormLabel>
                                <FormControl>
                                  <Input placeholder="Miami" {...field} />
                                </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={locationForm.control}
                              name="state"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>State (Optional - for future geo-fencing)</FormLabel>
                                  <FormControl>
                                    <Input placeholder="FL" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={locationForm.control}
                              name="flatRate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Flat Rate ($)</FormLabel>
                                  <FormControl>
                                    <Input placeholder="2500.00" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <Button type="submit" disabled={createLocationMutation.isPending || createRateMutation.isPending}>
                              {(createLocationMutation.isPending || createRateMutation.isPending) ? "Adding..." : "Add Location & Rate"}
                            </Button>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>

                  <div className="mt-4 pt-4 border-t">
                    <Button variant="outline" className="w-full" onClick={switchToDriverView}>
                      <i className="fas fa-eye mr-2"></i>
                      View Driver Portal
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Truck Management Tab */}
          <TabsContent value="trucks" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              {/* Add New Truck Form */}
              <div className="lg:col-span-1">
                <TruckForm />
              </div>

              {/* Truck Fleet Table */}
              <div className="lg:col-span-2">
                <TruckTable />
              </div>
            </div>

            {/* Truck Service Management */}
            <div className="mt-8">
              <h3 className="text-xl font-semibold mb-4">Service Management & Maintenance History</h3>
              <TruckServiceManagement />
            </div>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="mt-6">
            <CustomerForm />
          </TabsContent>

          {/* Locations Tab */}
          <TabsContent value="locations" className="mt-6">
            <LocationManagement />
          </TabsContent>

          {/* Rates Tab */}
          <TabsContent value="rates" className="mt-6">
            <RateManagement />
          </TabsContent>

          {/* Paid Invoices Tab */}
          <TabsContent value="paid-invoices" className="mt-6">
            <PaidInvoices />
          </TabsContent>

          {/* Ghost Load Cleanup Tab */}
          <TabsContent value="cleanup" className="mt-6">
            <GhostLoadCleanup />
          </TabsContent>

          <TabsContent value="clearall" className="mt-6">
            <ClearAllData />
          </TabsContent>

        </Tabs>
        
        </div>
      </div>
    </div>
  );
}
