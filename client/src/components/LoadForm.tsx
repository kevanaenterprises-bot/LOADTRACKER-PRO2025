import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { insertLoadSchema, InsertLoadStop } from "@shared/schema";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, MapPin } from "lucide-react";

const formSchema = insertLoadSchema.extend({
  number109: z.string().min(1, "109 Number is required"),
  // Remove locationId requirement - will use stops instead
  estimatedMiles: z.coerce.number().min(0, "Miles must be non-negative"),
}).omit({ driverId: true, locationId: true });

type FormData = z.infer<typeof formSchema>;

// Stop interface for managing stops
interface LoadStop {
  id: string;
  type: "pickup" | "delivery";
  locationId?: string;
  customAddress?: string;
  customName?: string;
  notes?: string;
  sequence: number;
}

export default function LoadForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stops, setStops] = useState<LoadStop[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      number109: "109",
      estimatedMiles: 0,
      specialInstructions: "",
      status: "created",
      // Financial fields with defaults
      flatRate: "0.00",
      lumperCharge: "0.00", 
      extraStops: 0,
      // Driver confirmation fields
      driverConfirmed: false,
    },
  });

  const { data: locations = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Removed drivers query - no longer needed for load creation

  const createLoadMutation = useMutation({
    mutationFn: async (data: FormData) => {
      console.log("Load creation data being sent:", data);
      console.log("Stops being sent:", stops);
      if (stops.length === 0) {
        throw new Error("Please add at least one stop");
      }
      
      // Convert stops to the format expected by the API
      const stopsData = stops.map(stop => ({
        type: stop.type,
        sequence: stop.sequence,
        locationId: stop.locationId || null,
        customAddress: stop.customAddress || null,
        customName: stop.customName || null,
        notes: stop.notes || null,
      }));
      
      return await apiRequest("/api/loads", "POST", {
        ...data,
        stops: stopsData
      });
    },
    onSuccess: () => {
      toast({
        title: "Success", 
        description: "Load created successfully! You can now assign a driver from the loads table.",
      });
      form.reset({
        number109: "109",
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

  const onSubmit = (data: FormData) => {
    createLoadMutation.mutate(data);
  };

  const addStop = () => {
    const newStop: LoadStop = {
      id: Date.now().toString(),
      type: "pickup",
      sequence: stops.length + 1,
    };
    setStops([...stops, newStop]);
  };

  const removeStop = (stopId: string) => {
    const newStops = stops.filter(stop => stop.id !== stopId);
    // Resequence remaining stops
    const resequencedStops = newStops.map((stop, index) => ({
      ...stop,
      sequence: index + 1
    }));
    setStops(resequencedStops);
  };

  const updateStop = (stopId: string, field: keyof LoadStop, value: any) => {
    setStops(stops.map(stop => 
      stop.id === stopId 
        ? { ...stop, [field]: value }
        : stop
    ));
  };

  return (
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

            {/* Stops Management Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base font-medium">Load Stops</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStop}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Stop
                </Button>
              </div>
              
              {stops.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
                  <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 font-medium">No stops added yet</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Add pickup and delivery stops for this load
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addStop}
                    className="mt-4"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Stop
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {stops.map((stop, index) => (
                    <Card key={stop.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={stop.type === 'pickup' ? 'default' : 'secondary'}>
                              Stop {stop.sequence} - {stop.type.toUpperCase()}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeStop(stop.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Stop Type */}
                          <div>
                            <FormLabel className="text-sm">Type</FormLabel>
                            <Select 
                              value={stop.type} 
                              onValueChange={(value) => updateStop(stop.id, 'type', value as 'pickup' | 'delivery')}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pickup">Pickup</SelectItem>
                                <SelectItem value="delivery">Delivery</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Single Location Field */}
                          <div>
                            <FormLabel className="text-sm">Location</FormLabel>
                            {stop.locationId && stop.locationId !== "custom" ? (
                              <div className="flex items-center gap-2 mt-1">
                                <Select 
                                  value={stop.locationId} 
                                  onValueChange={(value) => {
                                    if (value === "custom") {
                                      updateStop(stop.id, 'locationId', undefined);
                                      updateStop(stop.id, 'customName', '');
                                      updateStop(stop.id, 'customAddress', '');
                                    } else {
                                      console.log('🔍 Looking for location ID:', value, 'in locations:', locations);
                                      const selectedLocation = Array.isArray(locations) ? locations.find((loc: any) => loc.id === value) : null;
                                      console.log('🎯 Found location:', selectedLocation);
                                      
                                      updateStop(stop.id, 'locationId', value);
                                      
                                      if (selectedLocation) {
                                        console.log('🔄 Auto-populating location:', selectedLocation);
                                        
                                        // Force update the company name
                                        const companyName = selectedLocation.name || '';
                                        updateStop(stop.id, 'customName', companyName);
                                        console.log('📝 Set company name to:', companyName);
                                        
                                        // Build comprehensive address
                                        const addressParts = [
                                          selectedLocation.address,
                                          selectedLocation.city,
                                          selectedLocation.state
                                        ].filter(part => part && part.trim() !== '');
                                        
                                        const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : (selectedLocation.name || '');
                                        updateStop(stop.id, 'customAddress', fullAddress);
                                        console.log('📍 Set address to:', fullAddress);
                                        
                                        console.log('✅ DONE - Populated:', { 
                                          name: companyName, 
                                          address: fullAddress,
                                          originalLocation: selectedLocation 
                                        });
                                      } else {
                                        console.log('❌ Location not found:', value, 'Available locations:', locations);
                                      }
                                    }
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select location" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="custom">Enter Custom Address</SelectItem>
                                    {Array.isArray(locations) ? locations.map((location: any) => (
                                      <SelectItem key={location.id} value={location.id}>
                                        {location.name} - {location.city}, {location.state}
                                      </SelectItem>
                                    )) : null}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <div className="space-y-2 mt-1">
                                <Select 
                                  value="custom"
                                  onValueChange={(value) => {
                                    if (value !== "custom") {
                                      console.log('🔍 (Custom mode) Looking for location ID:', value, 'in locations:', locations);
                                      const selectedLocation = Array.isArray(locations) ? locations.find((loc: any) => loc.id === value) : null;
                                      console.log('🎯 (Custom mode) Found location:', selectedLocation);
                                      
                                      updateStop(stop.id, 'locationId', value);
                                      
                                      if (selectedLocation) {
                                        console.log('🔄 Auto-populating location (custom mode):', selectedLocation);
                                        
                                        // Force update the company name
                                        const companyName = selectedLocation.name || '';
                                        updateStop(stop.id, 'customName', companyName);
                                        console.log('📝 (Custom mode) Set company name to:', companyName);
                                        
                                        // Build comprehensive address
                                        const addressParts = [
                                          selectedLocation.address,
                                          selectedLocation.city,
                                          selectedLocation.state
                                        ].filter(part => part && part.trim() !== '');
                                        
                                        const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : (selectedLocation.name || '');
                                        updateStop(stop.id, 'customAddress', fullAddress);
                                        console.log('📍 (Custom mode) Set address to:', fullAddress);
                                        
                                        console.log('✅ DONE (Custom mode) - Populated:', { 
                                          name: companyName, 
                                          address: fullAddress,
                                          originalLocation: selectedLocation 
                                        });
                                      } else {
                                        console.log('❌ Location not found (custom mode):', value, 'Available locations:', locations);
                                      }
                                    }
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select existing location or enter custom" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="custom">Enter Custom Address</SelectItem>
                                    {Array.isArray(locations) ? locations.map((location: any) => (
                                      <SelectItem key={location.id} value={location.id}>
                                        {location.name} - {location.city}, {location.state}
                                      </SelectItem>
                                    )) : null}
                                  </SelectContent>
                                </Select>
                                <Input
                                  placeholder="Company/Location Name"
                                  value={stop.customName || ""}
                                  onChange={(e) => updateStop(stop.id, 'customName', e.target.value)}
                                />
                                <Input
                                  placeholder="Full Address"
                                  value={stop.customAddress || ""}
                                  onChange={(e) => updateStop(stop.id, 'customAddress', e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Show selected location info when existing location is chosen */}
                        {stop.locationId && stop.locationId !== "custom" && (
                          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                            <strong>{stop.customName}</strong>
                            {stop.customAddress && <div className="text-gray-600">{stop.customAddress}</div>}
                          </div>
                        )}
                        
                        {/* Notes */}
                        <div className="mt-4">
                          <FormLabel className="text-sm">Notes (Optional)</FormLabel>
                          <Textarea
                            className="mt-1"
                            placeholder="Special instructions for this stop..."
                            rows={2}
                            value={stop.notes || ""}
                            onChange={(e) => updateStop(stop.id, 'notes', e.target.value)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              
              {stops.length > 0 && (
                <div className="text-sm text-gray-600">
                  Total stops: {stops.length} ({stops.filter(s => s.type === 'pickup').length} pickup, {stops.filter(s => s.type === 'delivery').length} delivery)
                </div>
              )}
            </div>

            {/* Driver assignment removed - will be done after load creation */}
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
  );
}
