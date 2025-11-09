import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const serviceRecordSchema = z.object({
  serviceDate: z.string().min(1, "Service date is required"),
  serviceType: z.string().min(1, "Service type is required"),
  odometerAtService: z.string().min(1, "Odometer reading is required"),
  nextServiceOdometer: z.string().optional(),
  serviceDescription: z.string().optional(),
});

type ServiceRecordFormValues = z.infer<typeof serviceRecordSchema>;

interface Truck {
  id: string;
  truckNumber: string;
  make: string;
  model: string;
  year: number;
  currentOdometer?: number;
}

interface ServiceRecord {
  id: string;
  truckId: string;
  serviceDate: string;
  serviceType: string;
  odometerAtService: number;
  nextServiceOdometer?: number;
  serviceDescription?: string;
}

interface ServiceAlert extends Truck {
  nextServiceDue?: number;
  milesUntilService?: number;
}

export function TruckServiceManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);

  // Fetch all trucks
  const { data: trucks = [] } = useQuery<Truck[]>({
    queryKey: ["/api/trucks"],
  });

  // Fetch service alerts
  const { data: serviceAlerts = [] } = useQuery<ServiceAlert[]>({
    queryKey: ["/api/trucks/service-alerts"],
  });

  // Fetch service records for selected truck
  const { data: serviceRecords = [] } = useQuery<ServiceRecord[]>({
    queryKey: ["/api/trucks", selectedTruck?.id, "service-records"],
    queryFn: () => apiRequest(`/api/trucks/${selectedTruck!.id}/service-records`, "GET"),
    enabled: !!selectedTruck,
  });

  const form = useForm<ServiceRecordFormValues>({
    resolver: zodResolver(serviceRecordSchema),
    defaultValues: {
      serviceDate: new Date().toISOString().split('T')[0],
      serviceType: "",
      odometerAtService: "",
      nextServiceOdometer: "",
      serviceDescription: "",
    },
  });

  const createServiceRecordMutation = useMutation({
    mutationFn: async (data: ServiceRecordFormValues) => {
      if (!selectedTruck) throw new Error("No truck selected");
      
      const serviceData = {
        serviceDate: data.serviceDate,
        serviceType: data.serviceType,
        odometerAtService: parseInt(data.odometerAtService),
        nextServiceOdometer: data.nextServiceOdometer ? parseInt(data.nextServiceOdometer) : undefined,
        serviceDescription: data.serviceDescription,
      };
      
      return await apiRequest(`/api/trucks/${selectedTruck.id}/service-records`, "POST", serviceData);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Service record added successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trucks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trucks/service-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trucks", selectedTruck?.id, "service-records"] });
      setServiceDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add service record",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      {/* Service Alerts */}
      {serviceAlerts.length > 0 && (
        <Alert className="border-orange-500 bg-orange-50">
          <i className="fas fa-exclamation-triangle text-orange-600 mr-2"></i>
          <AlertDescription>
            <div className="font-semibold mb-2">Service Due Soon:</div>
            <div className="space-y-1">
              {serviceAlerts.map((alert) => (
                <div key={alert.id} className="text-sm">
                  <strong>Truck {alert.truckNumber}</strong> - Service due in {alert.milesUntilService} miles 
                  (at {alert.nextServiceDue?.toLocaleString()} miles)
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Truck List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trucks.map((truck) => (
          <Card 
            key={truck.id} 
            className={`cursor-pointer hover:border-primary transition-colors ${
              selectedTruck?.id === truck.id ? 'border-primary bg-primary/5' : ''
            }`}
            onClick={() => setSelectedTruck(truck)}
            data-testid={`truck-card-${truck.id}`}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Truck {truck.truckNumber}</span>
                {serviceAlerts.some(alert => alert.id === truck.id) && (
                  <Badge variant="destructive" className="text-xs">
                    <i className="fas fa-exclamation-triangle mr-1"></i>
                    Service Due
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-1">
                <div>{truck.year} {truck.make} {truck.model}</div>
                <div className="text-gray-600">
                  Odometer: {truck.currentOdometer?.toLocaleString() || 0} miles
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Selected Truck Service History */}
      {selectedTruck && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Service History - Truck {selectedTruck.truckNumber}</span>
              <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-service">
                    <i className="fas fa-plus mr-2"></i>
                    Add Service Record
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Service Record - Truck {selectedTruck.truckNumber}</DialogTitle>
                  </DialogHeader>

                  <Form {...form}>
                    <form onSubmit={form.handleSubmit((data) => createServiceRecordMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="serviceDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Service Date</FormLabel>
                            <FormControl>
                              <Input 
                                type="date" 
                                {...field} 
                                data-testid="input-service-date"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="serviceType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Service Type</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Oil Change, Tire Rotation, Inspection, etc." 
                                {...field} 
                                data-testid="input-service-type"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="odometerAtService"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Odometer at Service</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  placeholder="125000" 
                                  {...field} 
                                  data-testid="input-odometer-at-service"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="nextServiceOdometer"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Next Service Due (Odometer)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  placeholder="130000" 
                                  {...field} 
                                  data-testid="input-next-service-odometer"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="serviceDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Service Description (Optional)</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Details about the service performed..." 
                                {...field} 
                                data-testid="input-service-description"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end gap-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setServiceDialogOpen(false)}
                          data-testid="button-cancel-service"
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createServiceRecordMutation.isPending}
                          data-testid="button-save-service"
                        >
                          {createServiceRecordMutation.isPending ? "Saving..." : "Save Service Record"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {serviceRecords.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No service records yet</p>
            ) : (
              <div className="space-y-3">
                {serviceRecords.map((record) => (
                  <div 
                    key={record.id} 
                    className="border rounded-lg p-3"
                    data-testid={`service-record-${record.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-semibold">{record.serviceType}</div>
                        <div className="text-sm text-gray-600">
                          {new Date(record.serviceDate).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge variant="outline">
                        {record.odometerAtService?.toLocaleString() || 'N/A'} mi
                      </Badge>
                    </div>
                    
                    {record.nextServiceOdometer && (
                      <div className="text-sm text-gray-600 mb-1">
                        Next service due: {record.nextServiceOdometer?.toLocaleString() || 'N/A'} miles
                      </div>
                    )}
                    
                    {record.serviceDescription && (
                      <div className="text-sm text-gray-700 mt-2 pt-2 border-t">
                        {record.serviceDescription}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!selectedTruck && trucks.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          Select a truck to view service history
        </div>
      )}
    </div>
  );
}
