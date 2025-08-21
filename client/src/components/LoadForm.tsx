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

const formSchema = insertLoadSchema.extend({
  number109: z.string().min(1, "109 Number is required"),
  locationId: z.string().min(1, "Location is required"),
  // Remove driverId requirement - will be assigned after creation
  estimatedMiles: z.coerce.number().min(0, "Miles must be non-negative"),
}).omit({ driverId: true });

type FormData = z.infer<typeof formSchema>;

export default function LoadForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      number109: "109",
      locationId: "",
      estimatedMiles: 0,
      specialInstructions: "",
      status: "created",
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
      await apiRequest("POST", "/api/loads", data);
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

            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receiver Location</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Location" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {locations.map((location: any) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name} - {location.city}, {location.state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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
