import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const driverRecordSchema = z.object({
  bankAccountNumber: z.string().optional(),
  bankRoutingNumber: z.string().optional(),
  bankName: z.string().optional(),
  hireDate: z.string().optional(),
  fireDate: z.string().optional(),
  medicalCardExpiration: z.string().optional(),
  driverLicenseExpiration: z.string().optional(),
});

type DriverRecordFormValues = z.infer<typeof driverRecordSchema>;

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  username: string;
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
  bankName?: string;
  hireDate?: string;
  fireDate?: string;
  medicalCardExpiration?: string;
  driverLicenseExpiration?: string;
}

interface DriverRecordFormProps {
  driver: Driver;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DriverRecordForm({ driver, open, onOpenChange }: DriverRecordFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<DriverRecordFormValues>({
    resolver: zodResolver(driverRecordSchema),
    defaultValues: {
      bankAccountNumber: driver.bankAccountNumber || "",
      bankRoutingNumber: driver.bankRoutingNumber || "",
      bankName: driver.bankName || "",
      hireDate: driver.hireDate ? new Date(driver.hireDate).toISOString().split('T')[0] : "",
      fireDate: driver.fireDate ? new Date(driver.fireDate).toISOString().split('T')[0] : "",
      medicalCardExpiration: driver.medicalCardExpiration ? new Date(driver.medicalCardExpiration).toISOString().split('T')[0] : "",
      driverLicenseExpiration: driver.driverLicenseExpiration ? new Date(driver.driverLicenseExpiration).toISOString().split('T')[0] : "",
    },
  });

  const updateDriverMutation = useMutation({
    mutationFn: async (data: DriverRecordFormValues) => {
      return await apiRequest(`/api/drivers/${driver.id}`, "PATCH", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Driver record updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/drivers"] });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update driver record",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Driver Record: {driver.firstName} {driver.lastName}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => updateDriverMutation.mutate(data))} className="space-y-4">
            {/* Direct Deposit Banking Information */}
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-3">Direct Deposit Banking</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Wells Fargo" 
                          {...field} 
                          data-testid="input-bank-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bankRoutingNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Routing Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="123456789" 
                          {...field} 
                          data-testid="input-routing-number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bankAccountNumber"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••••" 
                          {...field} 
                          data-testid="input-account-number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Employment Dates */}
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-3">Employment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="hireDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hire Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          data-testid="input-hire-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="fireDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Termination Date (if applicable)</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          data-testid="input-fire-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* License & Certifications */}
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-3">License & Medical</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="driverLicenseExpiration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver License Expiration</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          data-testid="input-license-expiration"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="medicalCardExpiration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Medical Card Expiration</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          data-testid="input-medical-expiration"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-driver-record"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateDriverMutation.isPending}
                data-testid="button-save-driver-record"
              >
                {updateDriverMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
