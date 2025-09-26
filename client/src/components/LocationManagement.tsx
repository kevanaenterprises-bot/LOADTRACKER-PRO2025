import { useState } from "react";
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
import type { Location } from "@shared/schema";

const locationSchema = z.object({
  name: z.string().min(1, "Location name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
});

type LocationFormData = z.infer<typeof locationSchema>;

export default function LocationManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);

  const form = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      state: "",
      contactName: "",
      contactPhone: "",
    },
  });

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    queryFn: () => apiRequest("/api/locations", "GET"),
  });

  const createMutation = useMutation({
    mutationFn: async (data: LocationFormData) => {
      return await apiRequest("/api/locations", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Location created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
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
    mutationFn: async ({ id, data }: { id: string; data: LocationFormData }) => {
      return await apiRequest(`/api/locations/${id}`, "PUT", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Location updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setEditingLocation(null);
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/locations/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Location deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setDeleteDialogOpen(false);
      setLocationToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LocationFormData) => {
    if (editingLocation) {
      updateMutation.mutate({ id: editingLocation.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    form.setValue("name", location.name);
    form.setValue("address", location.address || "");
    form.setValue("city", location.city || "");
    form.setValue("state", location.state || "");
    form.setValue("contactName", location.contactName || "");
    form.setValue("contactPhone", location.contactPhone || "");
  };

  const handleCancelEdit = () => {
    setEditingLocation(null);
    form.reset();
  };

  const handleDeleteClick = (location: Location) => {
    setLocationToDelete(location);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (locationToDelete) {
      deleteMutation.mutate(locationToDelete.id);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingLocation ? "Edit Location" : "Add New Location"}</CardTitle>
          <CardDescription>
            Manage delivery locations for your loads. Set rates separately in the Rates Management section.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Miami Distribution Center" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Industrial Blvd" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Miami" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="FL" maxLength={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Name (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="John Smith" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Phone (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    "Saving..."
                  ) : editingLocation ? (
                    "Update Location"
                  ) : (
                    "Add Location"
                  )}
                </Button>
                {editingLocation && (
                  <Button type="button" variant="outline" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Locations</CardTitle>
          <CardDescription>
            {locations.length} location{locations.length !== 1 ? "s" : ""} registered
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">Loading locations...</div>
          ) : locations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No locations yet. Add your first location above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="font-medium">{location.name}</TableCell>
                    <TableCell>{location.city || "-"}</TableCell>
                    <TableCell>{location.state || "-"}</TableCell>
                    <TableCell>
                      {location.contactName ? (
                        <div className="text-sm">
                          <div>{location.contactName}</div>
                          {location.contactPhone && (
                            <div className="text-gray-500">{location.contactPhone}</div>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(location)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClick(location)}
                          className="text-red-600 hover:text-red-700"
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete location "{locationToDelete?.name}"? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}