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
import LoadTrackingMap from "@/components/LoadTrackingMap";
import { Header } from "@/components/Header";
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
});

const locationSchema = z.object({
  name: z.string().min(1, "Location name is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required").max(2, "Use 2-letter state code"),
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
  const [activeTab, setActiveTab] = useState<"loads" | "drivers" | "invoicing" | "ocr" | "tracking">("loads");
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
    },
  });

  const locationForm = useForm({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: "",
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
        const result = await apiRequest("/api/drivers", "POST", data);
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
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      {/* Header with Logo */}
      <Header title="LoadTracker Pro" />
      
      {/* Navigation Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 sticky top-[72px] z-40">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <nav className="flex space-x-8">
              <button 
                className="text-blue-600 hover:text-blue-800 px-3 py-2 rounded-md text-sm font-medium border-b-2 border-blue-600"
              >
                Office Dashboard
              </button>
              {user?.role === "office" && (
                <button 
                  onClick={switchToDriverView}
                  className="text-gray-500 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Driver Portal
                </button>
              )}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <img 
                className="h-8 w-8 rounded-full bg-blue-600" 
                src={user?.profileImageUrl || `https://ui-avatars.io/api/?name=${user?.firstName || 'User'}+${user?.lastName || 'User'}&background=1976D2&color=fff`}
                alt="User avatar" 
              />
              <span className="text-sm font-medium text-gray-700">
                {user?.firstName || 'User'} {user?.lastName || ''}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Dashboard Stats */}
        <StatsCards stats={stats as any} isLoading={statsLoading} />
        
        {/* Debug Log Display - Mobile Friendly */}
        {debugLog.length > 0 && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-yellow-800 mb-2">Debug Log:</h3>
            <div className="text-xs font-mono space-y-1 max-h-32 overflow-y-auto">
              {debugLog.map((log, idx) => (
                <div key={idx} className="text-yellow-700">{log}</div>
              ))}
            </div>
            <button 
              onClick={() => setDebugLog([])}
              className="mt-2 text-xs text-yellow-600 underline"
            >
              Clear Log
            </button>
          </div>
        )}
        
        {/* Driver Debug Button - Always Visible */}
        <div className="mt-4 flex justify-center">
          <Button 
            onClick={() => window.open('/driver-debug-test', '_blank')}
            variant="outline"
            size="lg"
            className="bg-red-50 border-red-200 text-red-800 hover:bg-red-100"
          >
            🔧 Debug Driver Creation Issue
          </Button>
        </div>

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
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5 h-auto gap-1">
            <TabsTrigger value="loads" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-blue-700 hover:text-blue-900 font-semibold">
              <i className="fas fa-truck text-lg md:text-base text-blue-600"></i>
              <span className="text-center leading-tight">Load Management</span>
            </TabsTrigger>
            <TabsTrigger value="tracking" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-green-700 hover:text-green-900 font-semibold">
              <i className="fas fa-map text-lg md:text-base text-green-600"></i>
              <span className="text-center leading-tight">Real-Time Tracking</span>
            </TabsTrigger>
            <TabsTrigger value="ocr" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-purple-700 hover:text-purple-900 font-semibold">
              <i className="fas fa-camera text-lg md:text-base text-purple-600"></i>
              <span className="text-center leading-tight">Wright Con Scanner</span>
            </TabsTrigger>
            <TabsTrigger value="drivers" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-orange-700 hover:text-orange-900 font-semibold">
              <i className="fas fa-users text-lg md:text-base text-orange-600"></i>
              <span className="text-center leading-tight">Driver Management</span>
            </TabsTrigger>
            <TabsTrigger value="invoicing" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 p-2 md:p-3 text-xs md:text-sm h-auto text-red-700 hover:text-red-900 font-semibold">
              <i className="fas fa-file-invoice-dollar text-lg md:text-base text-red-600"></i>
              <span className="text-center leading-tight">Automated Invoicing</span>
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

          {/* Real-Time Tracking Tab */}
          <TabsContent value="tracking" className="mt-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Real-Time Load Tracking</h2>
              <p className="text-gray-600">
                Live tracking map showing all active loads with GPS-enabled drivers. View real-time positions, 
                delivery destinations, and status updates automatically generated by our GPS tracking system.
              </p>
            </div>
            <LoadTrackingMap />
          </TabsContent>

          {/* OCR Wright Con Scanner Tab */}
          <TabsContent value="ocr" className="mt-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Wright Con Scanner</h2>
                <p className="text-gray-600">
                  Upload rate confirmation images to automatically extract load details and generate new loads.
                  The system will read load numbers, PO numbers, appointment times, company names, and addresses.
                </p>
              </div>
              <OCRUploader />
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
                          <Button type="submit" disabled={createDriverMutation.isPending}>
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
                            name="city"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>City</FormLabel>
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
                                  <FormLabel>State</FormLabel>
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

          {/* Invoicing Tab */}
          <TabsContent value="invoicing" className="mt-6">
            <InvoiceInbox />
          </TabsContent>
        </Tabs>
        
        {/* Email Test Section - Remove after testing */}
        <div className="mt-6 p-4 border rounded-lg bg-yellow-50">
          <h3 className="text-lg font-semibold mb-2">🔧 Email System Test</h3>
          <p className="text-sm text-gray-600 mb-3">Test the email system to debug the issue</p>
          <div className="flex flex-col space-y-2">
            <button 
              onClick={async () => {
                try {
                  console.log("Testing email system...");
                  const response = await fetch('/api/test-email', { 
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-bypass-token': 'LOADTRACKER_BYPASS_2025'
                    }
                  });
                  const result = await response.json();
                  console.log("Email test result:", result);
                  
                  if (response.ok) {
                    alert("✅ Email test successful! Check console for details.");
                  } else {
                    alert("❌ Email test failed: " + result.message);
                  }
                } catch (error) {
                  console.error("Email test error:", error);
                  alert("❌ Email test failed: " + error.message);
                }
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Test Email Connection
            </button>
            
            <button 
              onClick={async () => {
                try {
                  console.log("Testing invoice email directly...");
                  const response = await fetch('/api/invoices/INV-1755572280561/email-complete-package', { 
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-bypass-token': 'LOADTRACKER_BYPASS_2025'
                    },
                    body: JSON.stringify({
                      emailAddress: 'test@example.com',
                      loadId: '5fac985a-8dc7-49ee-b207-164e32a08da3'
                    })
                  });
                  const result = await response.json();
                  console.log("Invoice email test result:", result);
                  
                  if (response.ok) {
                    alert("✅ Invoice email test successful!");
                  } else {
                    alert("❌ Invoice email test failed: " + result.message);
                  }
                } catch (error) {
                  console.error("Invoice email test error:", error);
                  alert("❌ Invoice email test failed: " + error.message);
                }
              }}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Test Invoice Email Direct
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
