import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TruckForm from "@/components/TruckForm";
import type { Truck } from "@shared/schema";

export default function TruckTable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [truckToDelete, setTruckToDelete] = useState<Truck | null>(null);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);

  const { data: trucks = [], isLoading } = useQuery<Truck[]>({
    queryKey: ["/api/trucks"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/trucks/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Truck deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trucks"] });
      setDeleteDialogOpen(false);
      setTruckToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (truck: Truck) => {
    setTruckToDelete(truck);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (truckToDelete) {
      deleteMutation.mutate(truckToDelete.id);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-truck text-primary"></i>
            Fleet Overview
          </CardTitle>
          <CardDescription>Manage your truck fleet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-500">Loading trucks...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (trucks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-truck text-primary"></i>
            Fleet Overview
          </CardTitle>
          <CardDescription>Manage your truck fleet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <i className="fas fa-truck text-4xl mb-4"></i>
            <p className="text-lg font-medium mb-2">No trucks in your fleet yet</p>
            <p className="text-sm">Add your first truck using the form on the left to get started.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-truck text-primary"></i>
            Fleet Overview ({trucks.length} trucks)
          </CardTitle>
          <CardDescription>
            Manage your truck fleet - edit details, track mileage, and maintain records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="header-truck-number">Truck #</TableHead>
                  <TableHead data-testid="header-truck-make">Make</TableHead>
                  <TableHead data-testid="header-truck-model">Model</TableHead>
                  <TableHead data-testid="header-truck-year">Year</TableHead>
                  <TableHead data-testid="header-truck-mileage">Mileage</TableHead>
                  <TableHead data-testid="header-truck-vin">VIN</TableHead>
                  <TableHead data-testid="header-truck-actions">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trucks.map((truck) => (
                  <TableRow key={truck.id} data-testid={`row-truck-${truck.id}`}>
                    <TableCell className="font-medium" data-testid={`cell-truck-number-${truck.id}`}>
                      {truck.truckNumber}
                    </TableCell>
                    <TableCell data-testid={`cell-truck-make-${truck.id}`}>
                      {truck.make}
                    </TableCell>
                    <TableCell data-testid={`cell-truck-model-${truck.id}`}>
                      {truck.model}
                    </TableCell>
                    <TableCell data-testid={`cell-truck-year-${truck.id}`}>
                      {truck.year}
                    </TableCell>
                    <TableCell data-testid={`cell-truck-mileage-${truck.id}`}>
                      {truck.mileage?.toLocaleString() || 0} miles
                    </TableCell>
                    <TableCell data-testid={`cell-truck-vin-${truck.id}`}>
                      <span className="font-mono text-xs">
                        {truck.vinNumber}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingTruck(truck)}
                          data-testid={`button-edit-truck-${truck.id}`}
                        >
                          <i className="fas fa-edit w-3 h-3 mr-1"></i>
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(truck)}
                          className="text-red-600 hover:text-red-800"
                          data-testid={`button-delete-truck-${truck.id}`}
                        >
                          <i className="fas fa-trash w-3 h-3 mr-1"></i>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingTruck} onOpenChange={(open) => !open && setEditingTruck(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Truck</DialogTitle>
            <DialogDescription>
              Update the truck information below.
            </DialogDescription>
          </DialogHeader>
          {editingTruck && (
            <TruckForm editingTruck={editingTruck} onCancel={() => setEditingTruck(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Truck</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete truck "{truckToDelete?.truckNumber}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteMutation.isPending}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}