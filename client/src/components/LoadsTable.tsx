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
import { Plus, Package, MapPin } from "lucide-react";
import { useState, useEffect } from "react";

const getStatusColor = (status: string) => {
  switch (status) {
    case "created":
      return "bg-gray-100 text-gray-800";
    case "en_route_pickup":
    case "en_route_receiver":
      return "bg-warning bg-opacity-20 text-warning";
    case "at_shipper":
    case "at_receiver":
      return "bg-blue-100 text-blue-800";
    case "delivered":
      return "bg-success bg-opacity-20 text-success";
    case "completed":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case "created":
      return "Created";
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

  // Function to update load financial details
  const updateLoadFinancials = async (loadId: string, field: string, value: string) => {
    try {
      const response = await fetch(`/api/loads/${loadId}/financials`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-bypass-token': localStorage.getItem('bypass-token') || '',
        },
        credentials: 'include',
        body: JSON.stringify({ [field]: value })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update load financials');
      }
      
      // Update the selected load state immediately for UI feedback
      if (selectedLoad && selectedLoad.id === loadId) {
        setSelectedLoad({ ...selectedLoad, [field]: value });
      }
      
      // Refresh the loads data
      queryClient.invalidateQueries({ queryKey: ['/api/loads'] });
      
      toast({
        title: "Updated",
        description: `${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to update ${field}`,
        variant: "destructive",
      });
    }
  };

  const { data: loads, isLoading } = useQuery({
    queryKey: ["/api/loads"],
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0, // Always consider data stale to allow quick updates
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["/api/invoices"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: availableDrivers = [] } = useQuery({
    queryKey: ["/api/drivers/available"],
    retry: false,
    refetchOnWindowFocus: false,
  });
  
  // Fetch locations for stop selection
  const { data: locationsData = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
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
        headers: { "Content-Type": "application/json" },
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
    setSelectedLoad(load);
    setDialogOpen(true);
    
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

  // Check if a load already has an invoice
  const hasInvoice = (loadId: string) => {
    return Array.isArray(invoices) && invoices.some((invoice: any) => invoice.loadId === loadId);
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
      const response = await fetch(`/api/loads/${loadId}`, {
        method: 'DELETE',
        headers: {
          'x-bypass-token': localStorage.getItem('bypass-token') || '',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to delete load');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Load Deleted",
        description: `Load ${data.deletedLoad} has been successfully deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDeleteDialogOpen(false);
      setLoadToDelete(null);
    },
    onError: (error: any) => {
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

  // Filter out completed loads for the main table
  const activeLoads = Array.isArray(loads) ? loads.filter((load: any) => load.status !== "completed") : [];

  return (
    <Card className="material-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Active Loads</CardTitle>
          <div className="flex space-x-2">
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
        {activeLoads.length === 0 ? (
          <div className="text-center py-8">
            <i className="fas fa-truck text-4xl text-gray-400 mb-4"></i>
            <p className="text-gray-600">No active loads found</p>
            <p className="text-xs text-gray-400 mt-2">Debug: {Array.isArray(loads) ? loads.length : 'Loading...'} total loads</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>109 Number</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeLoads.map((load: any) => (
                  <TableRow 
                    key={load.id} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleLoadClick(load)}
                  >
                    <TableCell>
                      <div>
                        <div className="text-sm font-medium text-secondary">
                          {load.number109}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(load.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {load.driver ? (
                        <div className="flex items-center">
                          <img 
                            className="h-8 w-8 rounded-full mr-3" 
                            src={load.driver.profileImageUrl || `https://ui-avatars.io/api/?name=${load.driver.firstName}+${load.driver.lastName}&background=1976D2&color=fff`}
                            alt="Driver" 
                          />
                          <div>
                            <div className="text-sm font-medium text-secondary">
                              {load.driver.firstName} {load.driver.lastName}
                            </div>
                            <div className="text-xs text-gray-500">
                              ID: {load.driver.id.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500">No driver assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {load.location ? (
                        <div>
                          <div className="text-sm text-secondary">{load.location.name}</div>
                          <div className="text-xs text-gray-500">
                            {load.estimatedMiles || 0} miles
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500">No location</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(load.status)}>
                        {getStatusText(load.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-1 min-w-[200px]">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLoadClick(load);
                          }}
                          title="View load details"
                        >
                          <i className="fas fa-eye text-primary"></i>
                        </Button>
                        {hasInvoice(load.id) ? (
                          <PrintButton 
                            invoiceId={Array.isArray(invoices) ? invoices.find((inv: any) => inv.loadId === load.id)?.id : undefined}
                            loadId={load.id}
                            load={load}
                            invoice={Array.isArray(invoices) ? invoices.find((inv: any) => inv.loadId === load.id) : undefined}
                            variant="ghost"
                            size="sm"
                          />
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLoadClick(load);
                            }}
                            title="Generate invoice"
                            className="text-green-600 hover:text-green-700"
                          >
                            <i className="fas fa-file-invoice-dollar"></i>
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLoad(load);
                          }}
                          title="Delete load"
                          className="text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                        >
                          <i className="fas fa-trash mr-1"></i>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Load Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Load Details - {selectedLoad?.number109}</DialogTitle>
          </DialogHeader>
          
          {selectedLoad && (
            <div className="space-y-6">
              {/* Load Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Load Information</h4>
                  <div className="space-y-2 text-sm">
                    <div><strong>109 Number:</strong> {selectedLoad.number109}</div>
                    <div><strong>Status:</strong> <Badge className={getStatusColor(selectedLoad.status)}>{getStatusText(selectedLoad.status)}</Badge></div>
                    <div><strong>Created:</strong> {new Date(selectedLoad.createdAt).toLocaleDateString()}</div>
                    {selectedLoad.bolNumber && <div><strong>BOL Number:</strong> {selectedLoad.bolNumber}</div>}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Driver & Destination</h4>
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
                    
                    {selectedLoad.location && (
                      <div><strong>Destination:</strong> {selectedLoad.location.name}</div>
                    )}
                    {selectedLoad.estimatedMiles && (
                      <div><strong>Miles:</strong> {selectedLoad.estimatedMiles}</div>
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

              {/* Invoice Fields - Lumper Fees and Extra Stops */}
              <div>
                <h4 className="font-semibold mb-2">Additional Charges for Invoice</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-xs text-gray-600 block">Lumper Fees ($)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      defaultValue={selectedLoad.lumperCharge || '0.00'}
                      className="w-full px-2 py-1 text-sm border rounded mt-1"
                      onBlur={(e) => updateLoadFinancials(selectedLoad.id, 'lumperCharge', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block">Extra Stops ($)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      defaultValue={selectedLoad.extraStops || '0.00'}
                      className="w-full px-2 py-1 text-sm border rounded mt-1"
                      onBlur={(e) => updateLoadFinancials(selectedLoad.id, 'extraStops', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t space-y-4">
                {/* Print Button - Always prominently available */}
                {hasInvoice(selectedLoad.id) && (
                  <div className="text-center">
                    <PrintButton 
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
                )}
                
                <div className="flex justify-between">
                  <div className="text-sm text-gray-600">
                    {hasInvoice(selectedLoad.id) ? (
                      <span className="text-green-600">✅ Invoice generated for this load</span>
                    ) : (
                      <span>No invoice generated yet</span>
                    )}
                  </div>
                  
                  <div className="space-x-2">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Close
                    </Button>
                  
                    {!hasInvoice(selectedLoad.id) && (
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
            </div>
          )}
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
