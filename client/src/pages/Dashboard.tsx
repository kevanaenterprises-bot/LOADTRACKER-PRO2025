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
  zipCode: z.string().min(5, "ZIP code is required"),
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
  const [activeTab, setActiveTab] = useState<"loads" | "drivers" | "invoicing">("loads");
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const queryClient = useQueryClient();

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
      zipCode: "",
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
      return await apiRequest("POST", "/api/drivers", data);
    },
    onSuccess: () => {
      toast({
        title: "Driver Added",
        description: "New driver has been successfully registered.",
      });
      driverForm.reset();
      setDriverDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/available"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add driver. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/locations", data);
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
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add location. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createRateMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/rates", data);
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
                    Register delivery locations and set flat rates for automatic invoice calculations.
                  </p>
                  
                  <div className="flex space-x-2">
                    <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
                      <DialogTrigger asChild>
                        <Button className="flex-1">
                          <i className="fas fa-plus mr-2"></i>
                          Add Location
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add New Location</DialogTitle>
                        </DialogHeader>
                        <Form {...locationForm}>
                          <form onSubmit={locationForm.handleSubmit((data) => createLocationMutation.mutate(data))} className="space-y-4">
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
                              name="zipCode"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>ZIP Code</FormLabel>
                                  <FormControl>
                                    <Input placeholder="33101" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <Button type="submit" disabled={createLocationMutation.isPending}>
                              {createLocationMutation.isPending ? "Adding..." : "Add Location"}
                            </Button>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={rateDialogOpen} onOpenChange={setRateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button className="flex-1" variant="outline">
                          <i className="fas fa-dollar-sign mr-2"></i>
                          Set Rate
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Set Rate for City/State</DialogTitle>
                        </DialogHeader>
                        <Form {...rateForm}>
                          <form onSubmit={rateForm.handleSubmit((data) => createRateMutation.mutate(data))} className="space-y-4">
                            <FormField
                              control={rateForm.control}
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
                              control={rateForm.control}
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
                              control={rateForm.control}
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
                            <Button type="submit" disabled={createRateMutation.isPending}>
                              {createRateMutation.isPending ? "Adding..." : "Set Rate"}
                            </Button>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  </div>

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
      </div>
    </div>
  );
}
