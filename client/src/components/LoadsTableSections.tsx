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
import { HelpButton } from "@/components/HelpTooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface LoadSectionProps {
  loads: any[];
  title: string;
  color: string;
  helpText: string;
  showDriverAssign?: boolean;
  showInvoiceButton?: boolean;
  showPaymentButton?: boolean;
  availableDrivers?: any[];
  onLoadClick?: (load: any) => void;
  onGenerateInvoice?: (load: any) => void;
  onDeleteLoad?: (load: any) => void;
}

export function LoadSection({
  loads,
  title,
  color,
  helpText,
  showDriverAssign = false,
  showInvoiceButton = false,
  showPaymentButton = false,
  availableDrivers = [],
  onLoadClick,
  onGenerateInvoice,
  onDeleteLoad
}: LoadSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assigningDriverFor, setAssigningDriverFor] = useState<string | null>(null);

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
              {showDriverAssign && <TableHead>Assign Driver</TableHead>}
              {!showDriverAssign && <TableHead>Driver</TableHead>}
              <TableHead>Destination</TableHead>
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
                
                <TableCell>{load.location?.name || 'N/A'}</TableCell>
                
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markAsPaid(load.id)}
                        className="text-green-600 hover:text-green-700"
                      >
                        <i className="fas fa-check-circle mr-1"></i>
                        Mark as Paid
                      </Button>
                    )}
                    
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