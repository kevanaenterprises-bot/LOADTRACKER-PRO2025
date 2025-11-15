import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMainAuth } from "@/hooks/useMainAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertCarrierSchema, type Carrier, type InsertCarrier } from "@shared/schema";
import { CarrierLeaseAgreement } from "@/components/CarrierLeaseAgreement";

export default function Carriers() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useMainAuth();
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);

  // Fetch carriers
  const { data: carriers = [], isLoading: carriersLoading } = useQuery<Carrier[]>({
    queryKey: ["/api/carriers"],
  });

  // Form state
  const [formData, setFormData] = useState<InsertCarrier>({
    name: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    mcNumber: "",
    dotNumber: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    notes: "",
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: InsertCarrier) => {
      if (editingCarrier) {
        return await apiRequest(`/api/carriers/${editingCarrier.id}`, "PUT", data);
      } else {
        return await apiRequest("/api/carriers", "POST", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carriers"] });
      toast({
        title: editingCarrier ? "Carrier Updated" : "Carrier Created",
        description: `Successfully ${editingCarrier ? "updated" : "created"} carrier`,
      });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save carrier",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/carriers/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carriers"] });
      toast({
        title: "Carrier Deleted",
        description: "Successfully deleted carrier",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete carrier",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      mcNumber: "",
      dotNumber: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      notes: "",
    });
    setEditingCarrier(null);
  };

  const handleEdit = (carrier: Carrier) => {
    setEditingCarrier(carrier);
    setFormData({
      name: carrier.name,
      contactName: carrier.contactName || "",
      contactEmail: carrier.contactEmail || "",
      contactPhone: carrier.contactPhone || "",
      mcNumber: carrier.mcNumber || "",
      dotNumber: carrier.dotNumber || "",
      address: carrier.address || "",
      city: carrier.city || "",
      state: carrier.state || "",
      zipCode: carrier.zipCode || "",
      notes: carrier.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this carrier?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    setLocation("/admin-login");
    return null;
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Carrier Management</h1>
          <p className="text-muted-foreground mt-2">Manage trucking carriers for rate confirmations</p>
        </div>
        <div className="flex gap-2">
          <CarrierLeaseAgreement />
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-carrier">
                <Plus className="mr-2 h-4 w-4" />
                Add Carrier
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCarrier ? "Edit Carrier" : "Add New Carrier"}</DialogTitle>
              <DialogDescription>
                {editingCarrier ? "Update carrier information" : "Create a new carrier entry"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Carrier Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    data-testid="input-carrier-name"
                  />
                </div>
                <div>
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    data-testid="input-contact-name"
                  />
                </div>
                <div>
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    data-testid="input-contact-email"
                  />
                </div>
                <div>
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input
                    id="contactPhone"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    data-testid="input-contact-phone"
                  />
                </div>
                <div>
                  <Label htmlFor="mcNumber">MC Number</Label>
                  <Input
                    id="mcNumber"
                    value={formData.mcNumber}
                    onChange={(e) => setFormData({ ...formData, mcNumber: e.target.value })}
                    placeholder="MC-123456"
                    data-testid="input-mc-number"
                  />
                </div>
                <div>
                  <Label htmlFor="dotNumber">DOT Number</Label>
                  <Input
                    id="dotNumber"
                    value={formData.dotNumber}
                    onChange={(e) => setFormData({ ...formData, dotNumber: e.target.value })}
                    placeholder="DOT-123456"
                    data-testid="input-dot-number"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    data-testid="input-address"
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    data-testid="input-city"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="TX"
                    maxLength={2}
                    data-testid="input-state"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="zipCode">ZIP Code</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                    data-testid="input-zip"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    data-testid="input-notes"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-carrier">
                  {saveMutation.isPending ? "Saving..." : editingCarrier ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {carriersLoading ? (
        <div className="text-center py-12">Loading carriers...</div>
      ) : carriers.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground mb-4">No carriers found</p>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Carrier
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carrier Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>MC #</TableHead>
                <TableHead>DOT #</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carriers.map((carrier) => (
                <TableRow key={carrier.id} data-testid={`carrier-row-${carrier.id}`}>
                  <TableCell className="font-medium">{carrier.name}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{carrier.contactName || "-"}</div>
                      <div className="text-muted-foreground">{carrier.contactEmail || carrier.contactPhone || ""}</div>
                    </div>
                  </TableCell>
                  <TableCell>{carrier.mcNumber || "-"}</TableCell>
                  <TableCell>{carrier.dotNumber || "-"}</TableCell>
                  <TableCell>
                    {carrier.city && carrier.state ? `${carrier.city}, ${carrier.state}` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(carrier)}
                        data-testid={`button-edit-${carrier.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(carrier.id)}
                        data-testid={`button-delete-${carrier.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
