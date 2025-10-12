import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DriverRecordForm } from "@/components/DriverRecordForm";

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  username: string;
  role: string;
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
  bankName?: string;
  hireDate?: string;
  fireDate?: string;
  medicalCardExpiration?: string;
  driverLicenseExpiration?: string;
}

export function DriverList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [recordFormOpen, setRecordFormOpen] = useState(false);

  // Fetch all drivers
  const { data: drivers = [], isLoading } = useQuery<Driver[]>({
    queryKey: ["/api/drivers/available"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Driver deletion mutation
  const deleteDriverMutation = useMutation({
    mutationFn: async (driverId: string) => {
      return await apiRequest(`/api/drivers/${driverId}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Driver deleted successfully! Any assigned loads have been unassigned.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete driver",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <div className="text-center py-4">Loading drivers...</div>;
  }

  if (drivers.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-500">No drivers registered yet.</p>
        <p className="text-sm text-gray-400 mt-1">Add a driver to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-gray-600 text-sm mb-4">
        Manage your drivers. When you delete a driver, they will be automatically unassigned from any loads.
      </p>
      {drivers.map((driver) => (
        <div
          key={driver.id}
          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
          data-testid={`driver-card-${driver.id}`}
        >
          <div className="flex-1">
            <div className="font-medium">
              {driver.firstName} {driver.lastName}
            </div>
            <div className="text-sm text-gray-500">
              {driver.phoneNumber} • @{driver.username}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedDriver(driver);
                setRecordFormOpen(true);
              }}
              data-testid={`button-edit-driver-${driver.id}`}
            >
              <i className="fas fa-edit mr-1"></i>
              Edit Record
            </Button>
            
            <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                data-testid={`button-delete-driver-${driver.id}`}
              >
                <i className="fas fa-trash mr-1"></i>
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Driver</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete <strong>{driver.firstName} {driver.lastName}</strong>? 
                  <br />
                  <br />
                  This will permanently remove them from the system and unassign them from any loads. 
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteDriverMutation.mutate(driver.id)}
                  disabled={deleteDriverMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleteDriverMutation.isPending ? "Deleting..." : "Delete Driver"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </div>
        </div>
      ))}
      
      {selectedDriver && (
        <DriverRecordForm
          driver={selectedDriver}
          open={recordFormOpen}
          onOpenChange={setRecordFormOpen}
        />
      )}
    </div>
  );
}