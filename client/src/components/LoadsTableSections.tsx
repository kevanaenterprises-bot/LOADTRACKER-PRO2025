import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HelpButton } from "@/components/HelpTooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BatchPODUpload } from "@/components/BatchPODUpload";
import { Upload, Zap, DollarSign, Navigation } from "lucide-react";

interface LoadSectionProps {
  loads: any[];
  title: string;
  color: string;
  helpText: string;
  showDriverAssign?: boolean;
  showInvoiceButton?: boolean;
  showPaymentButton?: boolean;
  showPODUpload?: boolean;
  showTrackingButton?: boolean;
  availableDrivers?: any[];
  onLoadClick?: (load: any) => void;
  onGenerateInvoice?: (load: any) => void;
  onDeleteLoad?: (load: any) => void;
  onTrackLoad?: (load: any) => void;
}

export function LoadSection({
  loads,
  title,
  color,
  helpText,
  showDriverAssign = false,
  showInvoiceButton = false,
  showPaymentButton = false,
  showPODUpload = false,
  showTrackingButton = false,
  availableDrivers = [],
  onLoadClick,
  onGenerateInvoice,
  onDeleteLoad,
  onTrackLoad
}: LoadSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assigningDriverFor, setAssigningDriverFor] = useState<string | null>(null);
  const [podUploadDialogOpen, setPodUploadDialogOpen] = useState(false);
  const [selectedLoadForPOD, setSelectedLoadForPOD] = useState<any>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedLoadForPayment, setSelectedLoadForPayment] = useState<any>(null);
  const [paymentDetails, setPaymentDetails] = useState({
    paymentMethod: "",
    paymentReference: "",
    paymentNotes: ""
  });

  // Updated markAsPaid function to use the new mark-paid endpoint with payment details
  const markAsPaidMutation = useMutation({
    mutationFn: async (payload: { loadId: string; paymentDetails: any }) => {
      return apiRequest(`/api/loads/${payload.loadId}/mark-paid`, "POST", payload.paymentDetails);
    },
    onSuccess: () => {
      toast({
        title: "Load Marked as Paid",
        description: "Load has been marked as paid successfully with payment details",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setPaymentDialogOpen(false);
      setSelectedLoadForPayment(null);
      setPaymentDetails({ paymentMethod: "", paymentReference: "", paymentNotes: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Payment Update Failed",
        description: error.message || "Failed to mark load as paid",
        variant: "destructive",
      });
    },
  });

  // Force status update mutation (bypasses business rules)
  const forceStatusUpdateMutation = useMutation({
    mutationFn: async ({ loadId, status }: { loadId: string; status: string }) => {
      return apiRequest(`/api/loads/${loadId}/force-status`, "PATCH", { status });
    },
    onSuccess: () => {
      toast({ 
        title: "Force Update Successful", 
        description: "Load status forced to next stage (business rules bypassed)",
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: (error: any) => {
      toast({
        title: "Force Update Failed", 
        description: error.message || "Failed to force status update",
        variant: "destructive"
      });
    },
  });

  const assignDriverMutation = useMutation({
    mutationFn: async ({ loadId, driverId }: { loadId: string; driverId: string }) => {
      return apiRequest(`/api/loads/${loadId}/assign`, "PATCH", { driverId });
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Driver Assigned",
        description: "Driver has been assigned to the load successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      setAssigningDriverFor(null);
      // Update load status to assigned
      apiRequest(`/api/loads/${variables.loadId}/status`, "PATCH", { status: "assigned" });
    },
    onError: (error: any) => {
      toast({
        title: "Assignment Failed",
        description: error.message || "Failed to assign driver",
        variant: "destructive",
      });
    },
  });

  const handleAssignDriver = (loadId: string, driverId: string) => {
    if (driverId) {
      assignDriverMutation.mutate({ loadId, driverId });
    }
  };

  const markAsPaid = async (loadId: string) => {
    try {
      await apiRequest(`/api/loads/${loadId}/status`, "PATCH", { status: "paid" });
      toast({ title: "Load marked as paid" });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    } catch (error) {
      toast({ title: "Failed to mark as paid", variant: "destructive" });
    }
  };

  const getNextStatus = (currentStatus: string): string | null => {
    const statusProgression = {
      "created": "assigned",
      "assigned": "in_progress", 
      "in_progress": "at_shipper",
      "at_shipper": "left_shipper",
      "left_shipper": "at_receiver",
      "at_receiver": "delivered",
      "delivered": "awaiting_invoicing",
      "awaiting_invoicing": "awaiting_payment",
      "awaiting_payment": "paid",
      "paid": "completed"
    };
    return statusProgression[currentStatus as keyof typeof statusProgression] || null;
  };

  const forceToNextStage = (loadId: string, currentStatus: string) => {
    const nextStatus = getNextStatus(currentStatus);
    if (nextStatus) {
      if (confirm(`⚠️ Are you sure you want to FORCE this load to "${nextStatus}" status? This will bypass all business rules and validations.`)) {
        forceStatusUpdateMutation.mutate({ loadId, status: nextStatus });
      }
    } else {
      toast({
        title: "Cannot Force", 
        description: "This load is already at the final stage or no next stage available",
        variant: "destructive"
      });
    }
  };

  if (loads.length === 0) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h3 className={`text-lg font-semibold ${color}`}>{title} (0)</h3>
          <HelpButton content={helpText} />
        </div>
        <div className="text-center py-4 bg-gray-50 rounded">
          <p className="text-gray-600">No loads in this stage</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <h3 className={`text-lg font-semibold ${color}`}>{title} ({loads.length})</h3>
        <HelpButton content={helpText} />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>109 Number</TableHead>
              <TableHead data-testid="th-bol-374">BOL (374)</TableHead>
              <TableHead>Invoice #</TableHead>
              {showDriverAssign && <TableHead>Assign Driver</TableHead>}
              {!showDriverAssign && <TableHead>Driver</TableHead>}
              <TableHead>Destinations</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loads.map((load: any) => (
              <TableRow 
                key={load.id} 
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onLoadClick?.(load)}
              >
                <TableCell>
                  <div>
                    <div className="text-sm font-medium">{load.number109}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(load.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium" data-testid={`text-bol-number-${load.id}`}>
                    {load.bolNumber || <span className="text-gray-400 italic">Not set</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium" data-testid={`text-invoice-number-${load.id}`}>
                    {load.invoice?.invoiceNumber || <span className="text-gray-400 italic">Not invoiced</span>}
                  </div>
                </TableCell>
                
                {showDriverAssign ? (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {assigningDriverFor === load.id ? (
                      <div className="flex items-center gap-2">
                        <Select onValueChange={(value) => handleAssignDriver(load.id, value)}>
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Select driver..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableDrivers.map((driver: any) => (
                              <SelectItem key={driver.id} value={driver.id}>
                                {driver.firstName} {driver.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAssigningDriverFor(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAssigningDriverFor(load.id)}
                      >
                        Assign Driver
                      </Button>
                    )}
                  </TableCell>
                ) : (
                  <TableCell>
                    {load.driver ? (
                      <div className="text-sm">
                        {load.driver.firstName} {load.driver.lastName}
                      </div>
                    ) : (
                      <span className="text-gray-500">Unassigned</span>
                    )}
                  </TableCell>
                )}
                
                <TableCell>
                  <div className="text-sm">
                    {load.stops && load.stops.length > 0 ? (
                      // Show delivery destinations from stops
                      load.stops
                        .filter((stop: any) => stop.stopType === 'dropoff')
                        .slice(0, 2)
                        .map((stop: any, index: number, filteredStops: any[]) => (
                          <div key={stop.id} className="mb-1">
                            <div className="font-medium">{stop.companyName}</div>
                            {index === 0 && filteredStops.length > 1 && (
                              <div className="text-xs text-gray-500">
                                +{filteredStops.length - 1} more destination{filteredStops.length > 2 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        ))
                    ) : (
                      // Fallback to primary location if no stops
                      <>
                        {load.location?.name || 'No destinations'}
                        {load.location?.city && (
                          <div className="text-xs text-gray-500">
                            {load.location.city}, {load.location.state}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
                
                <TableCell>
                  <Badge className={getStatusColor(load.status)}>
                    {getStatusText(load.status)}
                  </Badge>
                </TableCell>
                
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-2">
                    {showInvoiceButton && (
                      <Button
                        size="sm"
                        onClick={() => onGenerateInvoice?.(load)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <i className="fas fa-file-invoice mr-1"></i>
                        Generate Invoice
                      </Button>
                    )}
                    
                    {showPaymentButton && (
                      <Dialog open={paymentDialogOpen && selectedLoadForPayment?.id === load.id} onOpenChange={(open) => {
                        if (!open) {
                          setPaymentDialogOpen(false);
                          setSelectedLoadForPayment(null);
                          setPaymentDetails({ paymentMethod: "", paymentReference: "", paymentNotes: "" });
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedLoadForPayment(load);
                              setPaymentDialogOpen(true);
                            }}
                            className="text-green-600 hover:text-green-700"
                            data-testid={`button-mark-paid-${load.id}`}
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            Mark as Paid
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Mark Load as Paid - {load.number109}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="paymentMethod">Payment Method *</Label>
                              <Select 
                                value={paymentDetails.paymentMethod} 
                                onValueChange={(value) => setPaymentDetails(prev => ({ ...prev, paymentMethod: value }))}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select payment method..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="check">Check</SelectItem>
                                  <SelectItem value="wire">Wire Transfer</SelectItem>
                                  <SelectItem value="ach">ACH Transfer</SelectItem>
                                  <SelectItem value="cash">Cash</SelectItem>
                                  <SelectItem value="credit_card">Credit Card</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div>
                              <Label htmlFor="paymentReference">Payment Reference</Label>
                              <Input
                                id="paymentReference"
                                placeholder="Check number, wire confirmation, etc."
                                value={paymentDetails.paymentReference}
                                onChange={(e) => setPaymentDetails(prev => ({ ...prev, paymentReference: e.target.value }))}
                                data-testid="input-payment-reference"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="paymentNotes">Payment Notes</Label>
                              <Textarea
                                id="paymentNotes"
                                placeholder="Additional payment details..."
                                value={paymentDetails.paymentNotes}
                                onChange={(e) => setPaymentDetails(prev => ({ ...prev, paymentNotes: e.target.value }))}
                                data-testid="textarea-payment-notes"
                              />
                            </div>
                            
                            <div className="flex justify-end space-x-3 pt-4">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setPaymentDialogOpen(false);
                                  setSelectedLoadForPayment(null);
                                  setPaymentDetails({ paymentMethod: "", paymentReference: "", paymentNotes: "" });
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => {
                                  if (!paymentDetails.paymentMethod) {
                                    toast({
                                      title: "Payment Method Required",
                                      description: "Please select a payment method before marking as paid",
                                      variant: "destructive"
                                    });
                                    return;
                                  }
                                  markAsPaidMutation.mutate({
                                    loadId: load.id,
                                    paymentDetails: paymentDetails
                                  });
                                }}
                                disabled={markAsPaidMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                                data-testid="button-confirm-payment"
                              >
                                {markAsPaidMutation.isPending ? "Processing..." : "Mark as Paid"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}

                    {showPODUpload && (
                      <Dialog open={podUploadDialogOpen} onOpenChange={setPodUploadDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedLoadForPOD(load)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Upload className="h-4 w-4 mr-1" />
                            {load.podDocumentPath ? 'Add More POD' : 'Upload POD'}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Upload POD Documents - Load {selectedLoadForPOD?.number109}</DialogTitle>
                          </DialogHeader>
                          {selectedLoadForPOD && (
                            <BatchPODUpload
                              loadId={selectedLoadForPOD.id}
                              loadNumber={selectedLoadForPOD.number109}
                              onUploadComplete={() => {
                                setPodUploadDialogOpen(false);
                                setSelectedLoadForPOD(null);
                                queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
                                toast({
                                  title: "POD Uploaded",
                                  description: `POD documents uploaded successfully for load ${selectedLoadForPOD.number109}`,
                                });
                              }}
                            />
                          )}
                        </DialogContent>
                      </Dialog>
                    )}

                    {/* Track Load Button - For loads with tracking enabled */}
                    {showTrackingButton && (load.trackingEnabled || load.driverId) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onTrackLoad?.(load)}
                        className="text-blue-600 hover:text-blue-700 border-blue-200"
                        title={load.driverId ? "Track this load in real-time" : "Track this load (assign driver to start GPS tracking)"}
                        data-testid={`button-track-load-${load.id}`}
                      >
                        <Navigation className="h-4 w-4 mr-1" />
                        Track Load
                        {!load.driverId && (
                          <span className="ml-1 text-xs text-gray-500">(No Driver)</span>
                        )}
                      </Button>
                    )}

                    {/* Force to Next Stage button - Emergency action for stuck loads */}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => forceToNextStage(load.id, load.status)}
                      disabled={forceStatusUpdateMutation.isPending || !getNextStatus(load.status)}
                      className="bg-orange-600 hover:bg-orange-700"
                      title={`Force load to next stage: ${getNextStatus(load.status) || 'none available'}`}
                      data-testid={`button-force-next-stage-${load.id}`}
                    >
                      <Zap className="h-4 w-4 mr-1" />
                      Force Next
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDeleteLoad?.(load)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <i className="fas fa-trash"></i>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case "pending":
    case "created":
      return "bg-gray-100 text-gray-800";
    case "assigned":
      return "bg-blue-100 text-blue-800";
    case "in_transit":
    case "en_route_pickup":
    case "en_route_receiver":
    case "in_progress":
      return "bg-yellow-100 text-yellow-800";
    case "at_shipper":
    case "at_receiver":
      return "bg-blue-100 text-blue-800";
    case "delivered":
      return "bg-green-100 text-green-800";
    case "awaiting_invoicing":
    case "empty":
      return "bg-purple-100 text-purple-800";
    case "awaiting_payment":
    case "waiting_for_invoice":
    case "invoiced":
      return "bg-orange-100 text-orange-800";
    case "paid":
      return "bg-green-200 text-green-900";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getStatusText(status: string) {
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
    case "in_progress":
      return "In Progress";
    default:
      return status;
  }
}