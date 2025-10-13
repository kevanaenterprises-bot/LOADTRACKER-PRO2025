import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Fuel, Plus, Trash2 } from "lucide-react";

interface FuelReceiptTrackerProps {
  loadId: string;
  driverId: string;
  isCompanyDriver: boolean;
}

interface FuelReceipt {
  id: string;
  gallons: string;
  totalCost: string;
  receiptDate: string;
  location?: string;
  notes?: string;
}

export function FuelReceiptTracker({ loadId, driverId, isCompanyDriver }: FuelReceiptTrackerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [gallons, setGallons] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  // Only company drivers can track fuel
  if (!isCompanyDriver) {
    return null;
  }

  // Fetch fuel receipts for this load
  const { data: receipts = [] } = useQuery<FuelReceipt[]>({
    queryKey: [`/api/loads/${loadId}/fuel-receipts`],
    enabled: !!loadId,
  });

  // Add fuel receipt mutation
  const addReceiptMutation = useMutation({
    mutationFn: async (receiptData: any) => {
      return apiRequest(`/api/loads/${loadId}/fuel-receipts`, "POST", {
        ...receiptData,
        driverId,
      });
    },
    onSuccess: () => {
      toast({
        title: "Fuel Receipt Added",
        description: "Your fuel purchase has been recorded.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/loads/${loadId}/fuel-receipts`] });
      setDialogOpen(false);
      setGallons("");
      setTotalCost("");
      setLocation("");
      setNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add fuel receipt",
        variant: "destructive",
      });
    },
  });

  // Delete fuel receipt mutation
  const deleteReceiptMutation = useMutation({
    mutationFn: async (receiptId: string) => {
      return apiRequest(`/api/fuel-receipts/${receiptId}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Receipt Deleted",
        description: "Fuel receipt has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/loads/${loadId}/fuel-receipts`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete receipt",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!gallons || !totalCost) {
      toast({
        title: "Missing Information",
        description: "Please enter gallons and total cost",
        variant: "destructive",
      });
      return;
    }

    addReceiptMutation.mutate({
      gallons: parseFloat(gallons),
      totalCost: parseFloat(totalCost),
      location: location || null,
      notes: notes || null,
    });
  };

  const calculateTotals = () => {
    const totalGallons = receipts.reduce((sum, r) => sum + parseFloat(r.gallons || "0"), 0);
    const totalSpent = receipts.reduce((sum, r) => sum + parseFloat(r.totalCost || "0"), 0);
    const avgPricePerGallon = totalGallons > 0 ? totalSpent / totalGallons : 0;

    return { totalGallons, totalSpent, avgPricePerGallon };
  };

  const totals = calculateTotals();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fuel className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Fuel Receipts</CardTitle>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
              Company Driver
            </span>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-fuel-receipt">
                <Plus className="h-4 w-4 mr-1" />
                Add Fuel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Fuel Receipt</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gallons">Gallons Purchased *</Label>
                  <Input
                    id="gallons"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 150.5"
                    value={gallons}
                    onChange={(e) => setGallons(e.target.value)}
                    required
                    data-testid="input-gallons"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalCost">Total Cost ($) *</Label>
                  <Input
                    id="totalCost"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 525.00"
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    required
                    data-testid="input-total-cost"
                  />
                  {gallons && totalCost && (
                    <p className="text-sm text-gray-600">
                      Price per gallon: ${(parseFloat(totalCost) / parseFloat(gallons)).toFixed(3)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location (Optional)</Label>
                  <Input
                    id="location"
                    placeholder="e.g. Flying J, Exit 42"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    data-testid="input-location"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Input
                    id="notes"
                    placeholder="Any additional notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    data-testid="input-notes"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={addReceiptMutation.isPending}
                    data-testid="button-submit-fuel"
                  >
                    {addReceiptMutation.isPending ? "Adding..." : "Add Receipt"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {receipts.length > 0 ? (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-blue-50 rounded-lg">
              <div className="text-center">
                <div className="text-xs text-gray-600">Total Gallons</div>
                <div className="font-semibold text-blue-700">{totals.totalGallons.toFixed(1)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600">Total Cost</div>
                <div className="font-semibold text-blue-700">${totals.totalSpent.toFixed(2)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-600">Avg $/Gal</div>
                <div className="font-semibold text-blue-700">${totals.avgPricePerGallon.toFixed(3)}</div>
              </div>
            </div>

            {/* Receipt List */}
            <div className="space-y-2">
              {receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  data-testid={`receipt-${receipt.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Fuel className="h-4 w-4 text-gray-400" />
                      <div>
                        <div className="font-medium">
                          {parseFloat(receipt.gallons).toFixed(1)} gal @ $
                          {(parseFloat(receipt.totalCost) / parseFloat(receipt.gallons)).toFixed(3)}
                          /gal
                        </div>
                        <div className="text-sm text-gray-600">
                          Total: ${parseFloat(receipt.totalCost).toFixed(2)}
                          {receipt.location && ` • ${receipt.location}`}
                        </div>
                        {receipt.notes && (
                          <div className="text-xs text-gray-500 mt-1">{receipt.notes}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteReceiptMutation.mutate(receipt.id)}
                    disabled={deleteReceiptMutation.isPending}
                    data-testid={`button-delete-receipt-${receipt.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-gray-500">
            <Fuel className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No fuel receipts yet</p>
            <p className="text-xs">Add receipts as you fuel up during this trip</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
