import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { insertLoadSchema } from "@shared/schema";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X, MapPin, Package } from "lucide-react";

const formSchema = insertLoadSchema.extend({
  number109: z.string().min(1, "109 Number is required"),
  locationId: z.string().min(1, "Location is required"),
  estimatedMiles: z.coerce.number().min(0, "Miles must be non-negative"),
}).omit({ driverId: true });

type FormData = z.infer<typeof formSchema>;

type LoadStop = {
  stopType: "pickup" | "dropoff";
  stopSequence: number;
  locationId?: string;
  companyName?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
};

export default function LoadForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stops, setStops] = useState<LoadStop[]>([]);
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [currentStopType, setCurrentStopType] = useState<"pickup" | "dropoff">("pickup");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [stopNotes, setStopNotes] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      number109: "109",
      locationId: "",
      estimatedMiles: 0,
      specialInstructions: "",
      status: "created",
      flatRate: "0.00",
      lumperCharge: "0.00", 
      extraStops: 0,
      driverConfirmed: false,
    },
  });

  const { data: locations = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  const createLoadMutation = useMutation({
    mutationFn: async (data: FormData & { stops?: LoadStop[] }) => {
      console.log("Load creation data being sent:", data);
      if (!data.locationId) {
        throw new Error("Please select a location");
      }
      return await apiRequest("/api/loads", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Success", 
        description: "Load created successfully! You can now assign a driver from the loads table.",
      });
      form.reset({
        number109: "109",
        locationId: "",
        estimatedMiles: 0,
        specialInstructions: "",
        status: "created",
      });
      setStops([]);
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to create load",
        variant: "destructive",
      });
    },
  });

  const handleAddStop = () => {
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
    
    const newStop: LoadStop = {
      stopType: currentStopType,
      stopSequence: stops.length + 1,
      locationId: selectedLocationId,
      companyName: selectedLocation?.name || "",
      address: selectedLocation?.address || "",
      contactName: selectedLocation?.contactName || "",
      contactPhone: selectedLocation?.contactPhone || "",
      notes: stopNotes,
    };

    setStops([...stops, newStop]);
    setShowStopDialog(false);
    
    // Update extraStops count in form
    form.setValue("extraStops", stops.length + 1);
  };

  const removeStop = (index: number) => {
    const newStops = stops.filter((_, i) => i !== index);
    // Update sequence numbers
    const resequencedStops = newStops.map((stop, i) => ({
      ...stop,
      stopSequence: i + 1,
    }));
    setStops(resequencedStops);
    form.setValue("extraStops", resequencedStops.length);
  };

  const onSubmit = (data: FormData) => {
    const submitData = {
      ...data,
      stops,
    };
    createLoadMutation.mutate(submitData);
  };

  return (
    <>
      <Card className="material-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Create New Load</span>
            <i className="fas fa-plus-circle text-primary text-xl"></i>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="number109"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>109 Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="109-2024-001" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="locationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Delivery Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locations.length > 0 ? (
                          locations.map((location: any) => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name} - {location.city}, {location.state}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-locations" disabled>
                            No locations available - Add locations first
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Extra Stops Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Additional Stops</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddStop}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Stop
                  </Button>
                </div>

                {stops.length > 0 && (
                  <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
                    {stops.map((stop, index) => (
                      <div 
                        key={index}
                        className="flex items-center justify-between p-3 bg-white rounded-md border"
                      >
                        <div className="flex items-center gap-3">
                          {stop.stopType === "pickup" ? (
                            <Package className="h-5 w-5 text-blue-500" />
                          ) : (
                            <MapPin className="h-5 w-5 text-green-500" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant={stop.stopType === "pickup" ? "secondary" : "default"}>
                                Stop {stop.stopSequence}: {stop.stopType === "pickup" ? "Pickup" : "Drop-off"}
                              </Badge>
                              <span className="font-medium">{stop.companyName}</span>
                            </div>
                            {stop.notes && (
                              <p className="text-sm text-gray-600 mt-1">{stop.notes}</p>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStop(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Driver assignment note */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> Driver assignment has been moved to after load creation.
                  Once you create this load, you can assign a driver from the loads table.
                </p>
              </div>

              <FormField
                control={form.control}
                name="estimatedMiles"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Miles</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} placeholder="0" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="specialInstructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Special Instructions</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        value={field.value || ""}
                        rows={3}
                        placeholder="Any special delivery instructions..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full" 
                disabled={createLoadMutation.isPending}
              >
                {createLoadMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus mr-2"></i>
                    Create Load
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Add Stop Dialog */}
      <Dialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Additional Stop</DialogTitle>
            <DialogDescription>
              Configure the details for this extra stop in your load route.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Stop Type</Label>
              <RadioGroup value={currentStopType} onValueChange={(value) => setCurrentStopType(value as "pickup" | "dropoff")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pickup" id="pickup" />
                  <Label htmlFor="pickup" className="cursor-pointer flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" />
                    Pickup
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dropoff" id="dropoff" />
                  <Label htmlFor="dropoff" className="cursor-pointer flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-green-500" />
                    Drop-off
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Company/Location</Label>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company for this stop" />
                </SelectTrigger>
                <SelectContent>
                  {locations.length > 0 ? (
                    locations.map((location: any) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name} - {location.city}, {location.state}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-locations" disabled>
                      No locations available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stop-notes">Special Instructions (Optional)</Label>
              <Textarea 
                id="stop-notes"
                value={stopNotes}
                onChange={(e) => setStopNotes(e.target.value)}
                placeholder="Any special instructions for this stop..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowStopDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAddStop}>
              Add Stop
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}