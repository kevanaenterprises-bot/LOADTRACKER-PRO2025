import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Edit, Plus, MapPin, Phone, User, Building } from "lucide-react";

interface Location {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  contactName?: string;
  contactPhone?: string;
  createdAt: string;
}

export default function LocationManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [locationData, setLocationData] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    contactName: "",
    contactPhone: "",
  });

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["/api/locations"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  const createLocationMutation = useMutation({
    mutationFn: (newLocation: any) => apiRequest("/api/locations", "POST", newLocation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setCreateDialogOpen(false);
      resetForm();
      toast({
        title: "✅ Location Created",
        description: "Pickup/delivery location added successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "Failed to create location",
        variant: "destructive",
      });
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      apiRequest(`/api/locations/${id}`, "PATCH", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setEditDialogOpen(false);
      setEditingLocation(null);
      resetForm();
      toast({
        title: "✅ Location Updated",
        description: "Location information updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "Failed to update location",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setLocationData({
      name: "",
      address: "",
      city: "",
      state: "",
      contactName: "",
      contactPhone: "",
    });
  };

  const handleCreate = () => {
    createLocationMutation.mutate(locationData);
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setLocationData({
      name: location.name || "",
      address: location.address || "",
      city: location.city || "",
      state: location.state || "",
      contactName: location.contactName || "",
      contactPhone: location.contactPhone || "",
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (editingLocation) {
      updateLocationMutation.mutate({
        id: editingLocation.id,
        updates: locationData,
      });
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Location Management</h1>
          <p className="text-gray-600 mt-2">Manage pickup and delivery locations with full address details for drivers</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create New Pickup/Delivery Location</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Location Name *</Label>
                  <Input
                    id="name"
                    value={locationData.name}
                    onChange={(e) => setLocationData({ ...locationData, name: e.target.value })}
                    placeholder="HEN HOUSE Distribution"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={locationData.address}
                    onChange={(e) => setLocationData({ ...locationData, address: e.target.value })}
                    placeholder="123 Industrial Blvd"
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={locationData.city}
                    onChange={(e) => setLocationData({ ...locationData, city: e.target.value })}
                    placeholder="Lancaster"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={locationData.state}
                    onChange={(e) => setLocationData({ ...locationData, state: e.target.value })}
                    placeholder="TX"
                  />
                </div>
                <div>
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    value={locationData.contactName}
                    onChange={(e) => setLocationData({ ...locationData, contactName: e.target.value })}
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input
                    id="contactPhone"
                    value={locationData.contactPhone}
                    onChange={(e) => setLocationData({ ...locationData, contactPhone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
            </div>
            <div className="flex space-x-2 pt-4">
              <Button
                onClick={() => {
                  setCreateDialogOpen(false);
                  resetForm();
                }}
                variant="outline"
                disabled={createLocationMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createLocationMutation.isPending || !locationData.name}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createLocationMutation.isPending ? "Creating..." : "Create Location"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Location Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Location Information</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Location Name *</Label>
                <Input
                  id="edit-name"
                  value={locationData.name}
                  onChange={(e) => setLocationData({ ...locationData, name: e.target.value })}
                  placeholder="Location Name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-address">Street Address</Label>
                <Input
                  id="edit-address"
                  value={locationData.address}
                  onChange={(e) => setLocationData({ ...locationData, address: e.target.value })}
                  placeholder="123 Industrial Blvd"
                />
              </div>
              <div>
                <Label htmlFor="edit-city">City</Label>
                <Input
                  id="edit-city"
                  value={locationData.city}
                  onChange={(e) => setLocationData({ ...locationData, city: e.target.value })}
                  placeholder="Lancaster"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-state">State</Label>
                <Input
                  id="edit-state"
                  value={locationData.state}
                  onChange={(e) => setLocationData({ ...locationData, state: e.target.value })}
                  placeholder="TX"
                />
              </div>
              <div>
                <Label htmlFor="edit-contactName">Contact Name</Label>
                <Input
                  id="edit-contactName"
                  value={locationData.contactName}
                  onChange={(e) => setLocationData({ ...locationData, contactName: e.target.value })}
                  placeholder="John Smith"
                />
              </div>
              <div>
                <Label htmlFor="edit-contactPhone">Contact Phone</Label>
                <Input
                  id="edit-contactPhone"
                  value={locationData.contactPhone}
                  onChange={(e) => setLocationData({ ...locationData, contactPhone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
          </div>
          <div className="flex space-x-2 pt-4">
            <Button
              onClick={() => {
                setEditDialogOpen(false);
                setEditingLocation(null);
                resetForm();
              }}
              variant="outline"
              disabled={updateLocationMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateLocationMutation.isPending || !locationData.name}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateLocationMutation.isPending ? "Updating..." : "Update Location"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Location List */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-8">Loading locations...</div>
        ) : locations.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500 font-medium">No locations found</p>
              <p className="text-sm text-gray-400 mt-1">
                Create your first pickup/delivery location to get started
              </p>
              <Button 
                onClick={() => setCreateDialogOpen(true)} 
                className="mt-4 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add First Location
              </Button>
            </CardContent>
          </Card>
        ) : (
          (locations as Location[]).map((location: Location) => (
            <Card key={location.id} className="hover:shadow-md transition-shadow border-l-4 border-l-blue-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building className="h-5 w-5 text-blue-600" />
                    {location.name}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(location)}
                    data-testid={`button-edit-location-${location.id}`}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {(location.address || location.city || location.state) && (
                      <div className="flex items-start space-x-2">
                        <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                        <div className="text-sm">
                          {location.address && <div>{location.address}</div>}
                          {(location.city || location.state) && (
                            <div className="text-gray-600">
                              {location.city}
                              {location.city && location.state && ", "}
                              {location.state}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {location.contactName && (
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{location.contactName}</span>
                      </div>
                    )}
                    {location.contactPhone && (
                      <div className="flex items-center space-x-2">
                        <Phone className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{location.contactPhone}</span>
                      </div>
                    )}
                  </div>
                </div>
                {(!location.address && !location.city && !location.contactName && !location.contactPhone) && (
                  <div className="text-amber-600 text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Missing address details - click edit to add driver information
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}