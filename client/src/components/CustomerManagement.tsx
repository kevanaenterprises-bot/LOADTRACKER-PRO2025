import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Edit, Plus, User, Mail, Phone, MapPin } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  email?: string;
  contactName?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  createdAt: string;
  updatedAt: string;
}

export default function CustomerManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [customerData, setCustomerData] = useState({
    name: "",
    email: "",
    contactName: "",
    contactPhone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["/api/customers"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  const createCustomerMutation = useMutation({
    mutationFn: (newCustomer: any) => apiRequest("/api/customers", "POST", newCustomer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setCreateDialogOpen(false);
      resetForm();
      toast({
        title: "✅ Customer Created",
        description: "Customer added successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "Failed to create customer",
        variant: "destructive",
      });
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      apiRequest(`/api/customers/${id}`, "PATCH", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setEditDialogOpen(false);
      setEditingCustomer(null);
      resetForm();
      toast({
        title: "✅ Customer Updated",
        description: "Customer information updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setCustomerData({
      name: "",
      email: "",
      contactName: "",
      contactPhone: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
    });
  };

  const handleCreate = () => {
    createCustomerMutation.mutate(customerData);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerData({
      name: customer.name || "",
      email: customer.email || "",
      contactName: customer.contactName || "",
      contactPhone: customer.contactPhone || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      zipCode: customer.zipCode || "",
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (editingCustomer) {
      updateCustomerMutation.mutate({
        id: editingCustomer.id,
        updates: customerData,
      });
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Customer Management</h1>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create New Customer</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    value={customerData.name}
                    onChange={(e) => setCustomerData({ ...customerData, name: e.target.value })}
                    placeholder="Company Name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={customerData.email}
                    onChange={(e) => setCustomerData({ ...customerData, email: e.target.value })}
                    placeholder="company@example.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    value={customerData.contactName}
                    onChange={(e) => setCustomerData({ ...customerData, contactName: e.target.value })}
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <Label htmlFor="contactPhone">Phone Number</Label>
                  <Input
                    id="contactPhone"
                    value={customerData.contactPhone}
                    onChange={(e) => setCustomerData({ ...customerData, contactPhone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={customerData.address}
                    onChange={(e) => setCustomerData({ ...customerData, address: e.target.value })}
                    placeholder="123 Main Street"
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={customerData.city}
                    onChange={(e) => setCustomerData({ ...customerData, city: e.target.value })}
                    placeholder="Dallas"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={customerData.state}
                    onChange={(e) => setCustomerData({ ...customerData, state: e.target.value })}
                    placeholder="TX"
                  />
                </div>
                <div>
                  <Label htmlFor="zipCode">ZIP Code</Label>
                  <Input
                    id="zipCode"
                    value={customerData.zipCode}
                    onChange={(e) => setCustomerData({ ...customerData, zipCode: e.target.value })}
                    placeholder="75001"
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
                disabled={createCustomerMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createCustomerMutation.isPending || !customerData.name || !customerData.email}
              >
                {createCustomerMutation.isPending ? "Creating..." : "Create Customer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Customer Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Customer Information</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Company Name *</Label>
                <Input
                  id="edit-name"
                  value={customerData.name}
                  onChange={(e) => setCustomerData({ ...customerData, name: e.target.value })}
                  placeholder="Company Name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-email">Email Address *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={customerData.email}
                  onChange={(e) => setCustomerData({ ...customerData, email: e.target.value })}
                  placeholder="company@example.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-contactName">Contact Name</Label>
                <Input
                  id="edit-contactName"
                  value={customerData.contactName}
                  onChange={(e) => setCustomerData({ ...customerData, contactName: e.target.value })}
                  placeholder="John Smith"
                />
              </div>
              <div>
                <Label htmlFor="edit-contactPhone">Phone Number</Label>
                <Input
                  id="edit-contactPhone"
                  value={customerData.contactPhone}
                  onChange={(e) => setCustomerData({ ...customerData, contactPhone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-address">Street Address</Label>
                <Input
                  id="edit-address"
                  value={customerData.address}
                  onChange={(e) => setCustomerData({ ...customerData, address: e.target.value })}
                  placeholder="123 Main Street"
                />
              </div>
              <div>
                <Label htmlFor="edit-city">City</Label>
                <Input
                  id="edit-city"
                  value={customerData.city}
                  onChange={(e) => setCustomerData({ ...customerData, city: e.target.value })}
                  placeholder="Dallas"
                />
              </div>
              <div>
                <Label htmlFor="edit-state">State</Label>
                <Input
                  id="edit-state"
                  value={customerData.state}
                  onChange={(e) => setCustomerData({ ...customerData, state: e.target.value })}
                  placeholder="TX"
                />
              </div>
              <div>
                <Label htmlFor="edit-zipCode">ZIP Code</Label>
                <Input
                  id="edit-zipCode"
                  value={customerData.zipCode}
                  onChange={(e) => setCustomerData({ ...customerData, zipCode: e.target.value })}
                  placeholder="75001"
                />
              </div>
            </div>
          </div>
          <div className="flex space-x-2 pt-4">
            <Button
              onClick={() => {
                setEditDialogOpen(false);
                setEditingCustomer(null);
                resetForm();
              }}
              variant="outline"
              disabled={updateCustomerMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateCustomerMutation.isPending || !customerData.name || !customerData.email}
            >
              {updateCustomerMutation.isPending ? "Updating..." : "Update Customer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer List */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-8">Loading customers...</div>
        ) : customers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-gray-500">No customers found. Create your first customer to get started.</p>
            </CardContent>
          </Card>
        ) : (
          (customers as Customer[]).map((customer: Customer) => (
            <Card key={customer.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{customer.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(customer)}
                    data-testid={`button-edit-customer-${customer.id}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {customer.email && (
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{customer.email}</span>
                      </div>
                    )}
                    {customer.contactPhone && (
                      <div className="flex items-center space-x-2">
                        <Phone className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{customer.contactPhone}</span>
                      </div>
                    )}
                    {customer.contactName && (
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{customer.contactName}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    {(customer.address || customer.city || customer.state) && (
                      <div className="flex items-start space-x-2">
                        <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                        <div className="text-sm">
                          {customer.address && <div>{customer.address}</div>}
                          {(customer.city || customer.state || customer.zipCode) && (
                            <div>
                              {customer.city}
                              {customer.city && customer.state && ", "}
                              {customer.state} {customer.zipCode}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}