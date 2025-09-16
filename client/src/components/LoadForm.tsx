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
import { Plus, X, MapPin, Package, ArrowUp, ArrowDown } from "lucide-react";
import { HelpButton } from "@/components/HelpTooltip";

const formSchema = insertLoadSchema.extend({
  number109: z.string().min(1, "109 Number is required"),
  locationId: z.string().min(1, "Delivery location is required"),
  estimatedMiles: z.coerce.number().min(0, "Miles must be non-negative"),
  truckNumber: z.string().optional(), // Optional truck number for load
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
  
  // Simplified state for the new workflow
  const [loadNumber, setLoadNumber] = useState("109-");
  const [truckNumber, setTruckNumber] = useState("");
  const [currentLocationId, setCurrentLocationId] = useState("");
  const [currentStopType, setCurrentStopType] = useState<"pickup" | "dropoff">("pickup");
  const [stops, setStops] = useState<LoadStop[]>([]);
  const [showOverride, setShowOverride] = useState(false);
  const [overridePassword, setOverridePassword] = useState("");

  const { data: locations = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  const createLoadMutation = useMutation({
    mutationFn: async (data: { number109: string; truckNumber?: string; stops: LoadStop[]; overridePassword?: string }) => {
      console.log("Load creation data being sent:", data);
      if (data.stops.length === 0) {
        throw new Error("Please add at least one stop");
      }
      return await apiRequest("/api/loads", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Success", 
        description: "Load created successfully! You can now assign a driver from the loads table.",
      });
      setLoadNumber("109-");
      setTruckNumber("");
      setCurrentLocationId("");
      setCurrentStopType("pickup");
      setStops([]);
      setShowOverride(false);
      setOverridePassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error: any) => {
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
      
      // Check if this is a duplicate error that needs override
      const errorResponse = error?.response || error;
      if (errorResponse?.requiresOverride || error.message?.includes("109 number already exists")) {
        setShowOverride(true);
        toast({
          title: "Duplicate 109 Number",
          description: "This 109 number already exists. Enter override password to recreate it.",
          variant: "destructive",
        });
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
    if (!currentLocationId) {
      toast({
        title: "Error",
        description: "Please select a location first",
        variant: "destructive",
      });
      return;
    }

    const selectedLocation = locations.find((loc: any) => loc.id === currentLocationId);
    
    const newStop: LoadStop = {
      stopType: currentStopType,
      stopSequence: stops.length + 1,
      locationId: currentLocationId,
      companyName: selectedLocation?.name || "",
      address: selectedLocation?.address || "",
      contactName: selectedLocation?.contactName || "",
      contactPhone: selectedLocation?.contactPhone || "",
      notes: "",
    };

    setStops([...stops, newStop]);
    
    // Reset for next stop
    setCurrentLocationId("");
    setCurrentStopType("pickup"); // Start with pickup for next stop
    
    toast({
      title: "Stop Added",
      description: `${currentStopType === "pickup" ? "Pickup" : "Delivery"} stop added successfully`,
    });
  };

  const handleCreateLoad = () => {
    if (!loadNumber.trim()) {
      toast({
        title: "Error",
        description: "Please enter a load number",
        variant: "destructive",
      });
      return;
    }

    if (stops.length === 0) {
      toast({
        title: "Error", 
        description: "Please add at least one stop before creating the load",
        variant: "destructive",
      });
      return;
    }

    const submitData = {
      number109: loadNumber,
      truckNumber: truckNumber || undefined, // Include truck number if provided
      stops,
      ...(showOverride && overridePassword ? { overridePassword } : {}),
    };
    createLoadMutation.mutate(submitData);
  };

  const removeStop = (index: number) => {
    const newStops = stops.filter((_, i) => i !== index);
    // Update sequence numbers
    const resequencedStops = newStops.map((stop, i) => ({
      ...stop,
      stopSequence: i + 1,
    }));
    setStops(resequencedStops);
  };

  return (
    <Card className="material-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Create New Load</span>
            <HelpButton 
              title="Simple Load Creation"
              content="1. Enter load number 2. Select location 3. Choose pickup or delivery 4. Click Add Stop 5. Repeat for more stops 6. Click Create Load"
            />
          </div>
          <i className="fas fa-plus-circle text-primary text-xl"></i>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Step 1: Load Number */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Step 1: Load Number</Label>
          <Input
            value={loadNumber}
            onChange={(e) => setLoadNumber(e.target.value)}
            placeholder="109-2024-001"
            className="text-lg"
          />
        </div>

        {/* Truck Number Field */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Truck Number (Optional)</Label>
          <Input
            value={truckNumber}
            onChange={(e) => setTruckNumber(e.target.value)}
            placeholder="TR-101, 1234, etc."
            className="text-lg"
            data-testid="input-truck-number"
          />
        </div>

        {/* Override Password Field - shown when duplicate detected */}
        {showOverride && (
          <div className="space-y-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <Label className="text-yellow-800">Override Password Required</Label>
            <Input
              type="password"
              value={overridePassword}
              onChange={(e) => setOverridePassword(e.target.value)}
              placeholder="Enter override password"
              className="bg-white"
            />
            <p className="text-sm text-yellow-700">
              This load number already exists. Enter the override password to recreate it.
            </p>
          </div>
        )}

        {/* Step 2: Add Stops */}
        <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
          <Label className="text-sm font-medium">Step 2: Add Stops</Label>
          
          {/* Location Selection */}
          <div className="space-y-2">
            <Label className="text-xs text-gray-600">Location</Label>
            <Select value={currentLocationId} onValueChange={setCurrentLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select Location" />
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

          {/* Pickup or Delivery */}
          <div className="space-y-2">
            <Label className="text-xs text-gray-600">Type</Label>
            <RadioGroup
              value={currentStopType}
              onValueChange={(value: "pickup" | "dropoff") => setCurrentStopType(value)}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pickup" id="current-pickup" />
                <Label htmlFor="current-pickup" className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-500" />
                  Pickup
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dropoff" id="current-dropoff" />
                <Label htmlFor="current-dropoff" className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-green-500" />
                  Delivery
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Add Stop Button */}
          <Button
            type="button"
            onClick={handleAddStop}
            disabled={!currentLocationId}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Stop
          </Button>
        </div>

        {/* Step 3: Added Stops */}
        {stops.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Added Stops ({stops.length})</Label>
            <div className="space-y-2">
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
                          {stop.stopSequence}. {stop.stopType === "pickup" ? "Pickup" : "Delivery"}
                        </Badge>
                        <span className="font-medium">{stop.companyName}</span>
                      </div>
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
          </div>
        )}

        {/* Step 4: Create Load */}
        <Button 
          onClick={handleCreateLoad}
          disabled={createLoadMutation.isPending || stops.length === 0}
          className="w-full text-lg py-6"
          size="lg"
        >
          {createLoadMutation.isPending ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Creating Load...
            </>
          ) : (
            <>
              <i className="fas fa-plus mr-2"></i>
              Create Load ({stops.length} stops)
            </>
          )}
        </Button>

        {stops.length === 0 && (
          <p className="text-sm text-gray-500 text-center">
            Add at least one stop to create the load
          </p>
        )}

      </CardContent>
    </Card>
  );
}