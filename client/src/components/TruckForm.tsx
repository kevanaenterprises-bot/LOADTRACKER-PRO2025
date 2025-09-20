import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Truck } from "@shared/schema";

const truckSchema = z.object({
  truckNumber: z.string().min(1, "Truck number is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.coerce.number().min(1900, "Enter a valid year").max(new Date().getFullYear() + 1, "Year cannot be in the future"),
  vinNumber: z.string().min(17, "VIN must be 17 characters").max(17, "VIN must be 17 characters").regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Invalid VIN format"),
  mileage: z.coerce.number().min(0, "Mileage must be non-negative"),
});

type TruckFormData = z.infer<typeof truckSchema>;

interface TruckFormProps {
  editingTruck?: Truck | null;
  onCancel?: () => void;
}

export default function TruckForm({ editingTruck: propEditingTruck, onCancel }: TruckFormProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Use prop if provided, otherwise internal state
  const editingTruck = propEditingTruck ?? null;

  const form = useForm<TruckFormData>({
    resolver: zodResolver(truckSchema),
    defaultValues: {
      truckNumber: "",
      make: "",
      model: "",
      year: new Date().getFullYear(),
      vinNumber: "",
      mileage: 0,
    },
  });

  // Update form when editing truck changes
  useEffect(() => {
    if (editingTruck) {
      form.reset({
        truckNumber: editingTruck.truckNumber,
        make: editingTruck.make,
        model: editingTruck.model,
        year: editingTruck.year,
        vinNumber: editingTruck.vinNumber,
        mileage: editingTruck.mileage || 0,
      });
    } else {
      form.reset({
        truckNumber: "",
        make: "",
        model: "",
        year: new Date().getFullYear(),
        vinNumber: "",
        mileage: 0,
      });
    }
  }, [editingTruck, form]);

  const createMutation = useMutation({
    mutationFn: async (data: TruckFormData) => {
      return await apiRequest("/api/trucks", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Truck created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trucks"] });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: TruckFormData & { id: string }) => {
      return await apiRequest(`/api/trucks/${id}`, "PUT", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Truck updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trucks"] });
      form.reset();
      if (onCancel) {
        onCancel();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: TruckFormData) => {
    if (editingTruck) {
      updateMutation.mutate({ ...data, id: editingTruck.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    form.reset();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <i className="fas fa-truck text-primary"></i>
          {editingTruck ? "Edit Truck" : "Add New Truck"}
        </CardTitle>
        <CardDescription>
          {editingTruck ? "Update truck information" : "Add a new truck to your fleet"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="truckNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Truck Number</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="input-truck-number"
                      placeholder="T001"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="make"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Make</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-truck-make"
                        placeholder="Peterbilt"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-truck-model"
                        placeholder="579"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-truck-year"
                        type="number"
                        placeholder="2022"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="mileage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mileage</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-truck-mileage"
                        type="number"
                        placeholder="150000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="vinNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VIN Number</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="input-truck-vin"
                      placeholder="1XKWD40X0EJ211429"
                      maxLength={17}
                      style={{ textTransform: 'uppercase' }}
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              {editingTruck && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isPending}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-submit-truck"
              >
                {isPending ? "Saving..." : editingTruck ? "Update Truck" : "Add Truck"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// Export the handleEdit function so TruckTable can use it
export { type TruckFormData };