import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { PrintButton } from "@/components/PrintButton";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Package, MapPin, X, RefreshCw, Search, Route, Navigation } from "lucide-react";
import { useState, useEffect } from "react";
import { HelpButton, TruckerTip } from "@/components/HelpTooltip";
import { LoadSection } from "@/components/LoadsTableSections";
import { HERERouteOptimizer } from "@/services/HERERouteOptimizer";

const getStatusColor = (status: string) => {
  switch (status) {
    case "pending":
    case "created":
      return "bg-gray-100 text-gray-800";
    case "assigned":
      return "bg-blue-100 text-blue-800";
    case "in_transit":
    case "en_route_pickup":
    case "en_route_receiver":
      return "bg-warning bg-opacity-20 text-warning";
    case "at_shipper":
    case "at_receiver":
      return "bg-blue-100 text-blue-800";
    case "delivered":
      return "bg-success bg-opacity-20 text-success";
    case "awaiting_invoicing":
    case "empty":
      return "bg-purple-100 text-purple-800";
    case "awaiting_payment":
    case "waiting_for_invoice":
    case "invoiced":
      return "bg-orange-100 text-orange-800";
    case "paid":
      return "bg-green-200 text-green-900";
    case "completed":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case "pending":
      return "Pending Assignment";
    case "created":
      return "Created";
    case "assigned":
      return "Driver Assigned";
    case "in_transit":
      return "In Transit";
    case "en_route_pickup":
      return "En Route to Pickup";
    case "at_shipper":
      return "At Shipper";
    case "left_shipper":
      return "Left Shipper";
    case "en_route_receiver":
      return "En Route to Receiver";
    case "at_receiver":
      return "At Receiver";
    case "delivered":
      return "Delivered";
    case "awaiting_invoicing":
    case "empty":
      return "Awaiting Invoicing";
    case "awaiting_payment":
    case "waiting_for_invoice":
      return "Awaiting Payment";
    case "invoiced":
      return "Invoiced";
    case "paid":
      return "Paid";
    case "completed":
      return "Completed";
    default:
      return status;
  }
};

export default function LoadsTable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLoad, setSelectedLoad] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assigningDriver, setAssigningDriver] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [loadStops, setLoadStops] = useState<any[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loadToDelete, setLoadToDelete] = useState<any>(null);
  const [addingStops, setAddingStops] = useState(false);
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [currentStopType, setCurrentStopType] = useState<"pickup" | "dropoff">("pickup");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [stopNotes, setStopNotes] = useState("");
  const [pendingStops, setPendingStops] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [existingStops, setExistingStops] = useState<any[]>([]);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // HERE Maps route calculation state
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [routeCalculated, setRouteCalculated] = useState<{[key: string]: boolean}>({});

  // Function to fetch load stops for editing
  const fetchLoadStops = async (loadId: string) => {
    try {
      const response = await fetch(`/api/loads/${loadId}/stops`, {
        credentials: 'include',
        headers: {
          'x-bypass-token': 'LOADTRACKER_BYPASS_2025',
        }
      });
      if (response.ok) {
        const stops = await response.json();
        setLoadStops(stops);
      }
    } catch (error) {
      console.error("Error fetching load stops:", error);
    }
  };

  // Function to update load details
  const updateLoadMutation = useMutation({
    mutationFn: async (updates: any) => {
      return apiRequest(`/api/loads/${selectedLoad?.id}`, "PUT", updates);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Load updated successfully!"
      });
      setEditMode(false);
      setEditFormData({});
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      // Refresh the selected load data
      if (selectedLoad) {
        queryClient.invalidateQueries({ queryKey: [`/api/loads/${selectedLoad.id}`] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update load",
        variant: "destructive"
      });
    }
  });

  // Function to remove a stop
  const removeStopMutation = useMutation({
    mutationFn: async (stopId: string) => {
      return apiRequest(`/api/loads/${selectedLoad?.id}/stops/${stopId}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Stop removed successfully!"
      });
      if (selectedLoad) {
        fetchLoadStops(selectedLoad.id);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove stop",
        variant: "destructive"
      });
    }
  });

  // Function to update load financial details
  const updateLoadFinancials = async (loadId: string, field: string, value: string) => {
    try {
      // Allow empty values to be set as 0
      const cleanValue = value.trim();
      const numericValue = cleanValue === "" ? 0 : parseFloat(cleanValue);
      
      if (isNaN(numericValue) || numericValue < 0) {
        throw new Error('Please enter a valid positive number');
      }
      
      // Format to 2 decimal places
      const formattedValue = numericValue.toFixed(2);
      
      const response = await fetch(`/api/loads/${loadId}/financials`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-bypass-token': 'LOADTRACKER_BYPASS_2025',
        },
        credentials: 'include',
        body: JSON.stringify({ [field]: formattedValue })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Update failed: ${errorText}`);
      }
      
      await response.json(); // Parse response to ensure it's valid
      
      // Update the selected load state immediately for UI feedback
      if (selectedLoad && selectedLoad.id === loadId) {
        setSelectedLoad({ ...selectedLoad, [field]: formattedValue });
      }
      
      // Mark that financials have been modified for this load
      setFinancialsModified(loadId);
      
      // Refresh the loads data
      queryClient.invalidateQueries({ queryKey: ['/api/loads'] });
      
      toast({
        title: "Updated",
        description: `${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully`,
      });
    } catch (error) {
      console.error("Error updating load financials:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to update ${field}`,
        variant: "destructive",
      });
      
      // Reset the input field to the previous value if update failed
      const inputElement = document.querySelector(`[data-testid="input-${field}-${loadId}"]`) as HTMLInputElement;
      if (inputElement && selectedLoad) {
        inputElement.value = selectedLoad[field as keyof typeof selectedLoad] || '0.00';
      }
    }
  };

  // HERE Maps route calculation function
  const calculateRouteDistance = async (loadId: string, load: any) => {
    // Extract addresses from stops array (preferred) or fallback to other fields
    const pickupStop = load.stops?.find((stop: any) => stop.stopType === 'pickup');
    const deliveryStop = load.stops?.find((stop: any) => stop.stopType === 'dropoff');
    
    const pickupAddr = load.pickupAddress || 
      pickupStop?.address ||
      (pickupStop?.location?.address) ||
      (load.pickupLocation ? `${load.pickupLocation.address || load.pickupLocation.name}, ${load.pickupLocation.city || ''}, ${load.pickupLocation.state || ''}`.replace(/,\s*,/g, ',').replace(/,\s*$/, '') : null) ||
      "1800 E PLANO PKWY, Plano, TX"; // Default pickup from your loads
    
    const deliveryAddr = load.deliveryAddress || 
      deliveryStop?.address ||
      (deliveryStop?.location?.address) ||
      (load.location ? `${load.location.address || load.location.name}, ${load.location.city || ''}, ${load.location.state || ''}`.replace(/,\s*,/g, ',').replace(/,\s*$/, '') : null);
      
    if (!pickupAddr || !deliveryAddr) {
      toast({
        title: "Cannot Calculate Route",
        description: "Both pickup and delivery addresses are required for route calculation",
        variant: "destructive"
      });
      return;
    }

    console.log('🚛 Route calculation starting via backend API...');
    
    setCalculatingRoute(true);
    try {
      // Call our backend API endpoint instead of HERE Maps directly (fixes CORS)
      const response = await fetch(`/api/loads/${loadId}/calculate-route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bypass-token': 'LOADTRACKER_BYPASS_2025',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          pickupAddress: pickupAddr, 
          deliveryAddress: deliveryAddr,
          truckSpecs: {
            maxWeight: 80000,
            maxHeight: 13.6,
            axleCount: 5
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Route calculation failed: ${response.status}`);
      }
      
      const distance = await response.json();
      console.log('✅ Route calculation successful:', distance);

      // Update the load's estimated miles in the database
      const updateResponse = await fetch(`/api/loads/${loadId}/financials`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-bypass-token': 'LOADTRACKER_BYPASS_2025',
        },
        credentials: 'include',
        body: JSON.stringify({ estimatedMiles: distance.miles.toString() })
      });
      
      if (!updateResponse.ok) {
        throw new Error(`Failed to update mileage: ${updateResponse.status}`);
      }
      
      // Update the selected load state for immediate UI feedback
      if (selectedLoad && selectedLoad.id === loadId) {
        setSelectedLoad({ ...selectedLoad, estimatedMiles: distance.miles });
      }
      
      // Mark route as calculated
      setRouteCalculated(prev => ({ ...prev, [loadId]: true }));
      
      // Refresh loads data
      queryClient.invalidateQueries({ queryKey: ['/api/loads'] });
      
      toast({
        title: "Route Calculated! 🚛",
        description: `Total distance: ${distance.miles} miles • Est. time: ${Math.floor(distance.duration / 60)}h ${distance.duration % 60}m`,
      });
      
      if (distance.warnings && distance.warnings.length > 0) {
        toast({
          title: "Truck Route Warnings",
          description: distance.warnings.join(", "),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Route calculation failed:", error);
      toast({
        title: "Route Calculation Failed",
        description: error instanceof Error ? error.message : "Unable to calculate route using HERE Maps",
        variant: "destructive"
      });
    } finally {
      setCalculatingRoute(false);
    }
  };

  const { data: loads, isLoading, refetch } = useQuery({
    queryKey: ["/api/loads", { excludePaid: false }],
    queryFn: () => apiRequest("/api/loads?excludePaid=false", "GET"),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0, // Always consider data stale to allow quick updates
  });

  // Force clear cache and refresh loads  
  const clearCacheAndRefresh = async () => {
    console.log("🔄 CACHE CLEAR: Comprehensive cache invalidation starting");
    
    // Clear all load-related cache entries
    await queryClient.resetQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && (
        key.includes('/api/loads') || 
        key.includes('/api/drivers') ||
        key.includes('/api/invoices') ||
        key.includes('/api/dashboard')
      );
    }});
    
    // Force fresh fetch of loads
    await queryClient.refetchQueries({ queryKey: ["/api/loads"] });
    
    console.log("✅ CACHE CLEAR: All related cache cleared and data refreshed from database");
    toast({
      title: "🔄 Cache Completely Cleared",
      description: "All load data refreshed from database - ghost loads should now be gone!",
      variant: "default",
    });
  };

  const { data: invoices = [] } = useQuery({
    queryKey: ["/api/invoices"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: availableDrivers = [] } = useQuery<any[]>({
    queryKey: ["/api/drivers/available"],
    queryFn: () => apiRequest("/api/drivers/available", "GET"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  
  // Fetch locations for stop selection
  const { data: locationsData = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    queryFn: () => apiRequest("/api/locations", "GET"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
    retry: false,
    refetchOnWindowFocus: false,
  });
  
  useEffect(() => {
    setLocations(locationsData);
  }, [locationsData]);

  // Manual invoice generation mutation
  const generateInvoiceMutation = useMutation({
    mutationFn: async ({ loadId, customerId }: { loadId: string; customerId?: string }) => {
      const response = await fetch("/api/loads/" + loadId + "/generate-invoice", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-bypass-token": "LOADTRACKER_BYPASS_2025"
        },
        body: JSON.stringify({ customerId }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status}: ${errorText}`);
      }
      
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Invoice Generated",
        description: `Invoice ${data.invoiceNumber || 'N/A'} has been created successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      setDialogOpen(false);
    },
    onError: (error: any) => {
      console.error("Invoice generation error:", error);
      if (isUnauthorizedError(error)) {
        toast({
          title: "Authentication Required",
          description: "Please log in as admin or driver to generate invoices.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Invoice Generation Failed",
        description: error.message || "Unable to generate invoice. Check if load has destination and rates are configured.",
        variant: "destructive",
      });
    },
  });

  const handleLoadClick = async (load: any) => {
    console.log("Load clicked:", load);
    
    // 🔥 CRITICAL FIX: Fetch complete load details including pickupLocation
    try {
      const response = await fetch(`/api/loads/${load.id}`, {
        headers: {
          'x-bypass-token': 'LOADTRACKER_BYPASS_2025',
        },
        credentials: 'include',
      });
      
      if (response.ok) {
        const completeLoadData = await response.json();
        console.log("Complete load data with pickupLocation:", completeLoadData);
        setSelectedLoad(completeLoadData); // ✅ Now includes pickupLocation!
      } else {
        // Fallback to list data if individual fetch fails
        setSelectedLoad(load);
      }
    } catch (error) {
      console.error("Failed to fetch complete load details:", error);
      // Fallback to list data if individual fetch fails
      setSelectedLoad(load);
    }
    
    setDialogOpen(true);
    // Always reset edit mode when opening a new load dialog
    setEditMode(false);
    setEditFormData({});
    
    // Fetch existing stops for this load
    try {
      const response = await fetch(`/api/loads/${load.id}/stops`);
      if (response.ok) {
        const stops = await response.json();
        setExistingStops(stops);
      }
    } catch (error) {
      console.error("Failed to fetch load stops:", error);
    }
  };

  const handleGenerateInvoice = () => {
    if (selectedLoad) {
      if (customers.length > 0) {
        setInvoiceDialogOpen(true);
      } else {
        generateInvoiceMutation.mutate({ loadId: selectedLoad.id });
      }
    }
  };
  
  const handleGenerateInvoiceWithCustomer = () => {
    if (selectedLoad) {
      generateInvoiceMutation.mutate({ 
        loadId: selectedLoad.id, 
        customerId: selectedCustomer || undefined 
      });
      setInvoiceDialogOpen(false);
      setSelectedCustomer("");
    }
  };

  // Update existing invoice with new lumper/stop charges
  const updateInvoiceMutation = useMutation({
    mutationFn: async (loadId: string) => {
      const response = await fetch(`/api/loads/${loadId}/update-invoice`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "x-bypass-token": "LOADTRACKER_BYPASS_2025",
        },
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update invoice: ${errorText}`);
      }
      
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Invoice Updated",
        description: `Invoice ${data.invoiceNumber || 'N/A'} updated with new charges.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update invoice",
        variant: "destructive",
      });
    }
  });

  const updateInvoiceWithNewCharges = (loadId: string) => {
    updateInvoiceMutation.mutate(loadId);
    // Clear the modified state after updating
    setFinancialsModified(null);
  };

  // Track when financial values have been modified
  const [financialsModified, setFinancialsModified] = useState<string | null>(null);

  // Handle dialog close and clear modified state
  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setFinancialsModified(null); // Clear modified state when dialog closes
    }
  };

  // Check if a load already has an invoice
  const hasInvoice = (load: any) => {
    // Check if load has an invoice based on status - include awaiting_invoicing for updates
    return load && ['awaiting_invoicing', 'invoiced', 'awaiting_payment', 'paid'].includes(load.status);
  };

  // Handle edit load - properly manage dialog state
  const handleEditLoad = async (load: any) => {
    // Set selected load and open dialog
    setSelectedLoad(load);
    setDialogOpen(true);
    
    // Initialize edit form data with normalized values
    setEditFormData({
      number109: load?.number109 || '',
      locationId: load?.locationId || '',
      pickupLocationId: load?.pickupLocationId || '',
      estimatedMiles: load?.estimatedMiles || 0,
      specialInstructions: load?.specialInstructions || ''
    });
    
    // Enable edit mode
    setEditMode(true);
    
    // Fetch load stops for editing
    if (load?.id) {
      await fetchLoadStops(load.id);
    }
  };

  // Driver assignment mutation
  const assignDriverMutation = useMutation({
    mutationFn: async ({ loadId, driverId }: { loadId: string; driverId: string }) => {
      console.log("🚀 Starting driver assignment:", { loadId, driverId });
      try {
        const result = await apiRequest(`/api/loads/${loadId}/assign`, "PATCH", { driverId });
        console.log("✅ Driver assignment API success:", result);
        return result;
      } catch (error) {
        console.error("❌ Driver assignment API error:", error);
        throw error;
      }
    },
    onSuccess: (data: any) => {
      console.log("🎉 Driver assignment mutation success:", data);
      toast({
        title: "Driver Assigned Successfully",
        description: `Driver assigned to load ${data.number109}`,
      });
      
      // Force complete cache reset and refetch
      queryClient.resetQueries({ queryKey: ["/api/loads"] });
      queryClient.resetQueries({ queryKey: [`/api/loads`] });
      queryClient.resetQueries({ queryKey: ["/api/drivers/available"] });
      queryClient.resetQueries({ queryKey: ["/api/dashboard/stats"] });
      
      // Also invalidate for good measure
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: [`/api/loads`] });
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      
      setSelectedLoad(data); // Update the dialog with new data
      setAssigningDriver(false);
    },
    onError: (error: any) => {
      console.error("💥 Driver assignment mutation error:", error);
      if (isUnauthorizedError(error)) {
        toast({
          title: "Authentication Required",
          description: "Please activate bypass token or log in to assign drivers.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Driver Assignment Failed",
        description: error.message || "Unable to assign driver to this load.",
        variant: "destructive",
      });
      setAssigningDriver(false);
    },
  });

  const handleAssignDriver = (driverId: string) => {
    if (selectedLoad && driverId) {
      assignDriverMutation.mutate({ loadId: selectedLoad.id, driverId });
    }
  };

  // Delete load mutation
  const deleteLoadMutation = useMutation({
    mutationFn: async (loadId: string) => {
      console.log(`🗑️ FRONTEND DELETE: Attempting to delete load with ID: ${loadId}`);
      
      const response = await fetch(`/api/loads/${loadId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-bypass-token': 'LOADTRACKER_BYPASS_2025',
        },
        credentials: 'include',
      });
      
      console.log(`🗑️ FRONTEND DELETE: Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`🗑️ FRONTEND DELETE ERROR: Status ${response.status}, Response: ${errorText}`);
        
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          // If response isn't JSON, use the text as error message
          errorData = { message: errorText };
        }
        
        throw new Error(errorData.message || `Delete failed: ${response.status} - ${errorText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Load Deleted",
        description: `Load ${data.deletedLoad} has been successfully deleted.`,
      });
      // Force immediate refresh of all data
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.refetchQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDeleteDialogOpen(false);
      setLoadToDelete(null);
      
      // Force page refresh as backup
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    },
    onError: (error: any) => {
      console.error("❌ DELETE ERROR DETAILS:", error);
      
      // If load doesn't exist, it might already be deleted - refresh the UI
      if (error.message?.includes("Load not found") || error.message?.includes("404")) {
        toast({
          title: "Load Already Deleted",
          description: "This load was already removed. Refreshing the page...",
          variant: "default",
        });
        // Force refresh to sync UI with database
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        return;
      }
      
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete load. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteLoad = (load: any) => {
    setLoadToDelete(load);
    setDeleteDialogOpen(true);
  };
  
  // Add stops mutation
  const addStopsMutation = useMutation({
    mutationFn: async ({ loadId, stops }: { loadId: string; stops: any[] }) => {
      const response = await fetch(`/api/loads/${loadId}/stops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stops }),
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to add stops");
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Stops Added",
        description: "Additional stops have been added to the load successfully.",
      });
      setPendingStops([]);
      setAddingStops(false);
      
      // Refetch existing stops
      if (selectedLoad) {
        fetch(`/api/loads/${selectedLoad.id}/stops`)
          .then(res => res.json())
          .then(stops => setExistingStops(stops))
          .catch(err => console.error("Failed to refetch stops:", err));
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add stops",
        variant: "destructive",
      });
    },
  });
  
  const handleAddStopClick = () => {
    setShowStopDialog(true);
    setCurrentStopType("pickup");
    setSelectedLocationId("");
    setStopNotes("");
  };
  
  const confirmAddStop = () => {
    if (!selectedLocationId) {
      toast({
        title: "Error",
        description: "Please select a company/location for this stop",
        variant: "destructive",
      });
      return;
    }
    
    const selectedLocation = locations.find((loc: any) => loc.id === selectedLocationId);
    
    const newStop = {
      stopType: currentStopType,
      locationId: selectedLocationId,
      companyName: selectedLocation?.name || "",
      address: selectedLocation?.address || "",
      contactName: selectedLocation?.contactName || "",
      contactPhone: selectedLocation?.contactPhone || "",
      notes: stopNotes,
    };
    
    setPendingStops([...pendingStops, newStop]);
    setShowStopDialog(false);
  };
  
  const submitStops = () => {
    if (selectedLoad && pendingStops.length > 0) {
      addStopsMutation.mutate({ loadId: selectedLoad.id, stops: pendingStops });
    }
  };

  const confirmDeleteLoad = () => {
    if (loadToDelete) {
      console.log(`🗑️ FRONTEND DELETE: Confirming deletion of load:`, {
        id: loadToDelete.id,
        number109: loadToDelete.number109,
        fullLoadObject: loadToDelete
      });
      deleteLoadMutation.mutate(loadToDelete.id);
    }
  };

  if (isLoading) {
    return (
      <Card className="material-card">
        <CardHeader>
          <CardTitle>Active Loads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter loads based on search term (Load #, Invoice #, or BOL #)
  const filteredLoads = Array.isArray(loads) ? loads.filter((load: any) => {
    if (!searchTerm.trim()) return true; // No search term, show all loads
    
    const search = searchTerm.toLowerCase().trim();
    const loadNumber = load.number109?.toLowerCase() || '';
    const bolNumber = load.bolNumber?.toLowerCase() || '';
    const invoiceNumber = load.invoice?.invoiceNumber?.toLowerCase() || '';
    
    return loadNumber.includes(search) || 
           bolNumber.includes(search) || 
           invoiceNumber.includes(search);
  }) : [];

  // Categorize filtered loads by new workflow stages
  const pendingLoads = filteredLoads.filter((load: any) => load.status === "pending" || load.status === "created");
  const assignedLoads = filteredLoads.filter((load: any) => load.status === "assigned" && load.driverId);
  const inTransitLoads = filteredLoads.filter((load: any) => 
    ["in_transit", "en_route_pickup", "at_shipper", "left_shipper", "en_route_receiver", "at_receiver", "delivered", "in_progress"].includes(load.status)
  );
  const awaitingInvoicingLoads = filteredLoads.filter((load: any) => 
    load.status === "awaiting_invoicing" || load.status === "empty"
  );
  const awaitingPaymentLoads = filteredLoads.filter((load: any) => 
    load.status === "awaiting_payment" || load.status === "invoiced" || load.status === "waiting_for_invoice"
  );
  const paidLoads = filteredLoads.filter((load: any) => load.status === "paid");

  return (
    <Card className="material-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Load Management</CardTitle>
            <HelpButton 
              title="Load Management Overview"
              content="Track your loads through their complete journey: In Progress → Empty (POD uploaded) → Invoiced → Paid. Each section helps you see what needs attention!"
            />
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={clearCacheAndRefresh}
              variant="outline" 
              size="sm"
              className="bg-orange-500 text-white hover:bg-orange-600"
              data-testid="button-clear-cache"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Clear Cache
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                toast({
                  title: "Filter Feature",
                  description: "Filter options will be implemented to sort loads by status, driver, or date.",
                });
              }}
            >
              <i className="fas fa-filter mr-2"></i>Filter
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                toast({
                  title: "Export Feature",
                  description: "Load data will be exported to CSV/Excel format for reporting.",
                });
              }}
            >
              <i className="fas fa-download mr-2"></i>Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search Field */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by Load #, Invoice #, or BOL #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-loads"
            />
          </div>
          {searchTerm.trim() && (
            <div className="mt-2 text-sm text-gray-600">
              Showing {filteredLoads.length} load{filteredLoads.length !== 1 ? 's' : ''} matching "{searchTerm}"
            </div>
          )}
        </div>

        {/* Trucker Tip for first-time users */}
        {pendingLoads.length === 0 && assignedLoads.length === 0 && inTransitLoads.length === 0 && (
          <TruckerTip 
            message="Hey there! Looks like you're just getting started. Create your first load using the 'Create Load' tab above. I'll help guide you through each step!"
            mood="helpful"
          />
        )}
        
        {/* Pending/Waiting Assignment Section */}
        <LoadSection
          loads={pendingLoads}
          title="Pending - Waiting Assignment"
          color="text-gray-700"
          helpText="Newly created loads waiting for a driver to be assigned."
          showDriverAssign={true}
          availableDrivers={availableDrivers}
          onLoadClick={handleLoadClick}
          onDeleteLoad={handleDeleteLoad}
        />
        
        {/* Driver Assigned Section */}
        <LoadSection
          loads={assignedLoads}
          title="Driver Assigned"
          color="text-blue-700"
          helpText="Loads with assigned drivers waiting to start transit."
          onLoadClick={handleLoadClick}
          onDeleteLoad={handleDeleteLoad}
        />
        
        {/* In Transit Section */}
        <LoadSection
          loads={inTransitLoads}
          title="In Transit"
          color="text-yellow-700"
          helpText="Loads currently being transported. Upload POD documents if available."
          showPODUpload={true}
          onLoadClick={handleLoadClick}
          onDeleteLoad={handleDeleteLoad}
        />
        
        {/* Awaiting Invoicing Section */}
        <LoadSection
          loads={awaitingInvoicingLoads}
          title="Awaiting Invoicing"
          color="text-purple-700"
          helpText="Load has been delivered. Upload POD documents if driver missed uploading them, then generate invoice."
          showInvoiceButton={true}
          showPODUpload={true}
          onLoadClick={handleLoadClick}
          onGenerateInvoice={() => {
            if (awaitingInvoicingLoads.length > 0) {
              setSelectedLoad(awaitingInvoicingLoads[0]);
              handleGenerateInvoice();
            }
          }}
          onDeleteLoad={handleDeleteLoad}
        />
        
        {/* Awaiting Payment Section */}
        <LoadSection
          loads={awaitingPaymentLoads}
          title="Awaiting Payment"
          color="text-orange-700"
          helpText="Invoiced loads waiting for payment. Upload additional POD documents if needed."
          showPaymentButton={true}
          showPODUpload={true}
          onLoadClick={handleLoadClick}
          onDeleteLoad={handleDeleteLoad}
        />
        
        {/* Paid Loads Section - Brief Summary */}
        {paidLoads.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold text-green-700">Recently Paid ({paidLoads.length})</h3>
              <HelpButton 
                content="Loads that have been paid. View all paid invoices in the 'Paid Invoices' tab."
              />
            </div>
            <div className="text-center py-4 bg-green-50 rounded">
              <p className="text-green-700">
                {paidLoads.length} loads have been paid. 
                <Button 
                  variant="link" 
                  className="text-green-700 underline"
                  onClick={() => {
                    toast({ 
                      title: "Coming Soon", 
                      description: "Paid Invoices tab will be available soon!" 
                    });
                  }}
                >
                  View Paid Invoices →
                </Button>
              </p>
            </div>
          </div>
        )}
      </CardContent>

      {/* Load Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm sm:text-base">Load Details - {selectedLoad?.number109}</DialogTitle>
              <div className="flex items-center gap-2 shrink-0">
                {/* Print Button - Visible on All Devices */}
                <div className="shrink-0">
                  <PrintButton 
                    invoiceId={Array.isArray(invoices) ? invoices.find((inv: any) => inv.loadId === selectedLoad?.id)?.id : undefined}
                    loadId={selectedLoad?.id}
                    load={selectedLoad}
                    invoice={Array.isArray(invoices) ? invoices.find((inv: any) => inv.loadId === selectedLoad?.id) : undefined}
                    variant="outline"
                    size="sm"
                  />
                </div>
                <Button 
                  variant={editMode ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (editMode) {
                      setEditMode(false);
                      setEditFormData({});
                    } else {
                      // Initialize form data with current load
                      setEditFormData({
                        number109: selectedLoad?.number109 || '',
                        locationId: selectedLoad?.locationId || '',
                        pickupLocationId: selectedLoad?.pickupLocationId || '',
                        estimatedMiles: selectedLoad?.estimatedMiles || 0,
                        specialInstructions: selectedLoad?.specialInstructions || ''
                      });
                      setEditMode(true);
                      // Fetch load stops for editing
                      if (selectedLoad?.id) {
                        fetchLoadStops(selectedLoad.id);
                      }
                    }
                  }}
                >
                  {editMode ? 'Cancel Edit' : 'Edit Load'}
                </Button>
              </div>
            </div>
            
            {/* Mobile Print Button Alert */}
            {hasInvoice(selectedLoad) && (
              <div className="md:hidden mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-blue-800">
                  <i className="fas fa-info-circle"></i>
                  <span className="font-medium">Print invoice & rate confirmation available above</span>
                </div>
              </div>
            )}
          </DialogHeader>
          
          <div className="space-y-6">
            
            {selectedLoad && (
              <div className="space-y-6">
                {editMode ? (
                  // Edit Mode
                  <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="text-lg font-semibold text-blue-800">Edit Load Details</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">109 Load Number</label>
                        <input
                          type="text"
                          className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editFormData.number109 || ''}
                          onChange={(e) => setEditFormData({...editFormData, number109: e.target.value})}
                          placeholder="Enter load number"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Estimated Miles</label>
                        <input
                          type="number"
                          className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editFormData.estimatedMiles || ''}
                          onChange={(e) => setEditFormData({...editFormData, estimatedMiles: parseInt(e.target.value) || 0})}
                          placeholder="0"
                          min="0"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Pickup Location</label>
                        <select
                          className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editFormData.pickupLocationId || ''}
                          onChange={(e) => setEditFormData({...editFormData, pickupLocationId: e.target.value})}
                        >
                          <option value="">Select pickup location</option>
                          {Array.isArray(locations) && locations.map((location: any) => (
                            <option key={location.id} value={location.id}>
                              {location.name} - {location.city}, {location.state}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Delivery Location</label>
                        <select
                          className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editFormData.locationId || ''}
                          onChange={(e) => setEditFormData({...editFormData, locationId: e.target.value})}
                        >
                          <option value="">Select delivery location</option>
                          {Array.isArray(locations) && locations.map((location: any) => (
                            <option key={location.id} value={location.id}>
                              {location.name} - {location.city}, {location.state}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Special Instructions</label>
                      <textarea
                        className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                        value={editFormData.specialInstructions || ''}
                        onChange={(e) => setEditFormData({...editFormData, specialInstructions: e.target.value})}
                        placeholder="Enter any special delivery instructions..."
                      />
                    </div>
                    
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button 
                        className="px-4 py-2 border rounded bg-white hover:bg-gray-50 transition-colors"
                        onClick={() => {
                          setEditMode(false);
                          setEditFormData({});
                        }}
                      >
                        Cancel
                      </button>
                      <button 
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                        onClick={() => updateLoadMutation.mutate(editFormData)}
                        disabled={updateLoadMutation.isPending}
                      >
                        {updateLoadMutation.isPending ? (
                          <>
                            <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                            Saving...
                          </>
                        ) : (
                          'Save Changes'
                        )}
                      </button>
                    </div>
                  </div>
              ) : (
                // View Mode
                <>
                  {/* Load Information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Load Information</h4>
                      <div className="space-y-2 text-sm">
                        <div><strong>109 Number:</strong> {selectedLoad.number109}</div>
                        <div><strong>Status:</strong> <Badge className={getStatusColor(selectedLoad.status)}>{getStatusText(selectedLoad.status)}</Badge></div>
                        <div><strong>Created:</strong> {new Date(selectedLoad.createdAt).toLocaleDateString()}</div>
                        {selectedLoad.bolNumber && <div><strong>BOL Number:</strong> {selectedLoad.bolNumber}</div>}
                        {selectedLoad.specialInstructions && (
                          <div><strong>Instructions:</strong> {selectedLoad.specialInstructions}</div>
                        )}
                      </div>
                    </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Driver Assignment</h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <strong>Driver:</strong> 
                      {selectedLoad.driver ? (
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-blue-600">{selectedLoad.driver.firstName} {selectedLoad.driver.lastName}</span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setAssigningDriver(true)}
                            className="ml-2"
                          >
                            Change Driver
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-1">
                          <span className="text-gray-500">Not assigned</span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setAssigningDriver(true)}
                            className="ml-2"
                          >
                            Assign Driver
                          </Button>
                        </div>
                      )}
                      
                      {assigningDriver && (
                        <div className="mt-2 p-3 border rounded bg-gray-50">
                          <div className="flex items-center space-x-2">
                            <Select onValueChange={handleAssignDriver}>
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select a driver..." />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.isArray(availableDrivers) && availableDrivers.map((driver: any) => (
                                  <SelectItem key={driver.id} value={driver.id}>
                                    {driver.firstName} {driver.lastName} - {driver.phoneNumber}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setAssigningDriver(false)}
                            >
                              Cancel
                            </Button>
                          </div>
                          {assignDriverMutation.isPending && (
                            <div className="mt-2 text-sm text-blue-600">
                              Assigning driver...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pickup & Delivery Locations - New comprehensive section */}
                <div>
                  <h4 className="font-semibold mb-3">Pickup & Delivery Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {/* Pickup Location */}
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center mb-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                        <h5 className="font-semibold text-blue-800">Pickup Location</h5>
                      </div>
                      {(() => {
                        // Find first pickup stop
                        const pickupStop = selectedLoad.stops?.find((stop: any) => stop.stopType === 'pickup');
                        
                        if (pickupStop) {
                          return (
                            <div className="space-y-1">
                              <div><strong>Company:</strong> {pickupStop.location?.name || pickupStop.companyName || 'Custom Location'}</div>
                              {(pickupStop.location?.address || pickupStop.address) && (
                                <div><strong>Address:</strong> {pickupStop.location?.address || pickupStop.address}</div>
                              )}
                              {(pickupStop.location?.city || pickupStop.location?.state) && (
                                <div><strong>Location:</strong> {pickupStop.location?.city}, {pickupStop.location?.state}</div>
                              )}
                              {(pickupStop.location?.contactName || pickupStop.contactName) && (
                                <div><strong>Contact:</strong> {pickupStop.location?.contactName || pickupStop.contactName}</div>
                              )}
                              {(pickupStop.location?.contactPhone || pickupStop.contactPhone) && (
                                <div><strong>Phone:</strong> {pickupStop.location?.contactPhone || pickupStop.contactPhone}</div>
                              )}
                              {pickupStop.notes && (
                                <div><strong>Notes:</strong> {pickupStop.notes}</div>
                              )}
                            </div>
                          );
                        } else if (selectedLoad.pickupLocation) {
                          return (
                            <div className="space-y-1">
                              <div><strong>Company:</strong> {selectedLoad.pickupLocation.name}</div>
                              {selectedLoad.pickupLocation.address && (
                                <div><strong>Address:</strong> {selectedLoad.pickupLocation.address}</div>
                              )}
                              {(selectedLoad.pickupLocation.city || selectedLoad.pickupLocation.state) && (
                                <div><strong>Location:</strong> {selectedLoad.pickupLocation.city}, {selectedLoad.pickupLocation.state}</div>
                              )}
                              {selectedLoad.pickupLocation.contactName && (
                                <div><strong>Contact:</strong> {selectedLoad.pickupLocation.contactName}</div>
                              )}
                              {selectedLoad.pickupLocation.contactPhone && (
                                <div><strong>Phone:</strong> {selectedLoad.pickupLocation.contactPhone}</div>
                              )}
                            </div>
                          );
                        } else if (selectedLoad.pickupAddress) {
                          return (
                            <div className="space-y-1">
                              <div><strong>Address:</strong> {selectedLoad.pickupAddress}</div>
                              {selectedLoad.companyName && (
                                <div><strong>Company:</strong> {selectedLoad.companyName}</div>
                              )}
                            </div>
                          );
                        } else {
                          return (
                            <div className="space-y-2">
                              <div className="text-gray-500 italic">No pickup location specified</div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditLoad(selectedLoad)}
                                className="text-xs"
                              >
                                Add Pickup Location
                              </Button>
                            </div>
                          );
                        }
                      })()}
                    </div>

                    {/* Delivery Location */}
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center mb-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                        <h5 className="font-semibold text-green-800">Delivery Location</h5>
                      </div>
                      {selectedLoad.location ? (
                        <div className="space-y-1">
                          <div><strong>Company:</strong> {selectedLoad.location.name}</div>
                          {selectedLoad.location.address && (
                            <div><strong>Address:</strong> {selectedLoad.location.address}</div>
                          )}
                          {(selectedLoad.location.city || selectedLoad.location.state) && (
                            <div><strong>Location:</strong> {selectedLoad.location.city}, {selectedLoad.location.state}</div>
                          )}
                          {selectedLoad.location.contactName && (
                            <div><strong>Contact:</strong> {selectedLoad.location.contactName}</div>
                          )}
                          {selectedLoad.location.contactPhone && (
                            <div><strong>Phone:</strong> {selectedLoad.location.contactPhone}</div>
                          )}
                        </div>
                      ) : selectedLoad.deliveryAddress ? (
                        <div className="space-y-1">
                          <div><strong>Address:</strong> {selectedLoad.deliveryAddress}</div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-gray-500 italic">No delivery location specified</div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditLoad(selectedLoad)}
                            className="text-xs"
                          >
                            Add Delivery Location
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Miles Information with HERE Maps Route Calculation */}
                  <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <span className="font-semibold text-yellow-800">Total Distance:</span>
                          <span className={`ml-2 text-lg ${(selectedLoad.estimatedMiles || 0) === 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {selectedLoad.estimatedMiles || 0} miles
                          </span>
                        </div>
                        {((selectedLoad.estimatedMiles || 0) === 0 || !routeCalculated[selectedLoad.id]) && 
                         (selectedLoad.pickupAddress || 
                          selectedLoad.stops?.find((stop: any) => stop.stopType === 'pickup')?.address ||
                          selectedLoad.stops?.find((stop: any) => stop.stopType === 'pickup')?.location?.address ||
                          selectedLoad.pickupLocation || true) && 
                         (selectedLoad.deliveryAddress || 
                          selectedLoad.stops?.find((stop: any) => stop.stopType === 'dropoff')?.address ||
                          selectedLoad.stops?.find((stop: any) => stop.stopType === 'dropoff')?.location?.address ||
                          selectedLoad.location) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => calculateRouteDistance(selectedLoad.id, selectedLoad)}
                            disabled={calculatingRoute}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Navigation className="h-3 w-3" />
                            {calculatingRoute ? "Calculating..." : "Calculate Route"}
                          </Button>
                        )}
                        {routeCalculated[selectedLoad.id] && (selectedLoad.estimatedMiles || 0) > 0 && (
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <Route className="h-3 w-3" />
                            <span>✅ Truck Route</span>
                          </div>
                        )}
                      </div>
                      {selectedLoad.appointmentTime && (
                        <div className="text-sm text-yellow-700">
                          <strong>Appointment:</strong> {selectedLoad.appointmentTime}
                        </div>
                      )}
                    </div>
                    {((selectedLoad.estimatedMiles || 0) === 0) && (
                      <div className="mt-2 text-xs text-yellow-700">
                        <strong>💡 Tip:</strong> Click "Calculate Route" to get accurate truck mileage using HERE Maps commercial routing
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Documents Status */}
              <div>
                <h4 className="font-semibold mb-2">Documents</h4>
                <div className="text-sm">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${selectedLoad.podDocumentPath ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <span>POD Document {selectedLoad.podDocumentPath ? '✅' : '❌'}</span>
                  </div>
                </div>
              </div>

              {/* Invoice Fields - Trip Rate, Lumper Fees and Extra Stops */}
              <div>
                <h4 className="font-semibold mb-2">Invoice Amounts</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <label className="text-xs text-gray-600 block">Trip Rate ($)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      min="0"
                      defaultValue={selectedLoad.tripRate || '0.00'}
                      className="w-full px-2 py-1 text-sm border rounded mt-1"
                      onChange={(e) => {
                        // Immediately mark financials as modified when user types
                        setFinancialsModified(selectedLoad.id);
                      }}
                      onBlur={(e) => updateLoadFinancials(selectedLoad.id, 'tripRate', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          e.currentTarget.blur();
                        }
                      }}
                      data-testid={`input-trip-rate-${selectedLoad.id}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block">Lumper Fees ($)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      min="0"
                      defaultValue={selectedLoad.lumperCharge || '0.00'}
                      className="w-full px-2 py-1 text-sm border rounded mt-1"
                      onChange={(e) => {
                        // Immediately mark financials as modified when user types
                        setFinancialsModified(selectedLoad.id);
                      }}
                      onBlur={(e) => updateLoadFinancials(selectedLoad.id, 'lumperCharge', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          e.currentTarget.blur();
                        }
                      }}
                      data-testid={`input-lumper-charge-${selectedLoad.id}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block">Extra Stops ($)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      min="0"
                      defaultValue={selectedLoad.extraStops || '0.00'}
                      className="w-full px-2 py-1 text-sm border rounded mt-1"
                      onChange={(e) => {
                        // Immediately mark financials as modified when user types
                        setFinancialsModified(selectedLoad.id);
                      }}
                      onBlur={(e) => updateLoadFinancials(selectedLoad.id, 'extraStops', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          e.currentTarget.blur();
                        }
                      }}
                      data-testid={`input-extra-stops-${selectedLoad.id}`}
                    />
                  </div>
                </div>
                
                {/* Update Invoice Button - Show if invoice exists AND financials have been modified */}
                {hasInvoice(selectedLoad) && (
                  <div className="mt-3 text-center">
                    <Button 
                      onClick={() => updateInvoiceWithNewCharges(selectedLoad.id)}
                      disabled={updateInvoiceMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      size="sm"
                    >
                      {updateInvoiceMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Updating...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-sync mr-2"></i>
                          Update Invoice
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-gray-600 mt-1">
                      Recalculate invoice with current lumper/stop fees
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t space-y-4">
                {/* Print Button - Always prominently available */}
                <div className="text-center">
                  <PrintButton 
                    invoiceId={Array.isArray(invoices) ? invoices.find((inv: any) => inv.loadId === selectedLoad.id)?.id : undefined}
                    loadId={selectedLoad.id}
                    load={selectedLoad}
                    invoice={Array.isArray(invoices) ? invoices.find((inv: any) => inv.loadId === selectedLoad.id) : undefined}
                    variant="default"
                    size="lg"
                  />
                  <p className="text-xs text-gray-600 mt-2">
                    Print rate confirmation & invoice together • Can be printed multiple times
                  </p>
                </div>
                
                <div className="flex justify-between">
                  <div className="text-sm text-gray-600">
                    {hasInvoice(selectedLoad) ? (
                      <span className="text-green-600">✅ Invoice generated for this load</span>
                    ) : (
                      <span>No invoice generated yet</span>
                    )}
                  </div>
                  
                  <div className="space-x-2">
                    <Button variant="outline" onClick={() => handleDialogClose(false)}>
                      Close
                    </Button>
                  
                    {!hasInvoice(selectedLoad) && (
                      <Button 
                        onClick={handleGenerateInvoice}
                        disabled={generateInvoiceMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {generateInvoiceMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Generating...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-file-invoice-dollar mr-2"></i>
                            Generate Invoice
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
                </>
              )}
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Load Deletion</DialogTitle>
            <div className="text-red-600 font-medium">⚠️ This action cannot be undone</div>
          </DialogHeader>
          {loadToDelete && (
            <div className="py-4">
              <p className="text-gray-700">
                Are you sure you want to delete load <strong>{loadToDelete.number109}</strong>?
              </p>
              <p className="text-sm text-gray-500 mt-2">
                This will permanently remove the load and all associated data from the system.
              </p>
            </div>
          )}
          <div className="flex justify-end space-x-3">
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteLoadMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteLoad}
              disabled={deleteLoadMutation.isPending}
            >
              {deleteLoadMutation.isPending ? "Deleting..." : "Delete Load"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice Customer Selection Dialog */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Select a customer for this invoice (optional). Customers with email addresses will receive invoices automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer</Label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Customer Selected</SelectItem>
                  {customers.map((customer: any) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.email && ` (${customer.email})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end space-x-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setInvoiceDialogOpen(false);
                setSelectedCustomer("");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleGenerateInvoiceWithCustomer}
              disabled={generateInvoiceMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {generateInvoiceMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating...
                </>
              ) : (
                <>Generate Invoice</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
