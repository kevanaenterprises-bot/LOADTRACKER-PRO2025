import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface LoadSummary {
  id: string;
  number109: string;
  bolNumber?: string;
  status: string;
  createdAt: string;
  hasStops: boolean;
  hasInvoice: boolean;
  hasPOD: boolean;
  hasBOL: boolean;
}

export default function GhostLoadCleanup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLoads, setSelectedLoads] = useState<Set<string>>(new Set());
  const [confirmationText, setConfirmationText] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [bulkDeleteResults, setBulkDeleteResults] = useState<any>(null);

  // Get all loads for cleanup selection
  const { data: loads = [], isLoading } = useQuery({
    queryKey: ["/api/loads"],
  });

  // Type assertion for loads array
  const typedLoads = loads as any[];

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (data: { loadIds: string[]; confirmationText: string }) => {
      return apiRequest("/api/loads/bulk-delete", "POST", data);
    },
    onSuccess: (data) => {
      setBulkDeleteResults(data.results);
      setSelectedLoads(new Set());
      setConfirmationText("");
      setShowConfirmDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      toast({
        title: "Bulk Deletion Complete",
        description: `${data.results.successful.length} loads deleted successfully, ${data.results.failed.length} failed`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Deletion Failed",
        description: error.message || "Failed to complete bulk deletion",
        variant: "destructive",
      });
    },
  });

  const handleLoadToggle = (loadId: string, checked: boolean) => {
    const newSelected = new Set(selectedLoads);
    if (checked) {
      newSelected.add(loadId);
    } else {
      newSelected.delete(loadId);
    }
    setSelectedLoads(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLoads(new Set(typedLoads.map((load: any) => load.id)));
    } else {
      setSelectedLoads(new Set());
    }
  };

  const handleBulkDelete = () => {
    if (selectedLoads.size === 0) {
      toast({
        title: "No loads selected",
        description: "Please select at least one load to delete",
        variant: "destructive",
      });
      return;
    }
    setShowConfirmDialog(true);
  };

  const executeDelete = () => {
    if (confirmationText !== "DELETE ALL SELECTED LOADS") {
      toast({
        title: "Invalid confirmation",
        description: "Please type exactly: DELETE ALL SELECTED LOADS",
        variant: "destructive",
      });
      return;
    }

    bulkDeleteMutation.mutate({
      loadIds: Array.from(selectedLoads),
      confirmationText,
    });
  };

  const selectedLoadDetails = typedLoads.filter((load: any) => selectedLoads.has(load.id));
  const totalStops = selectedLoadDetails.reduce((sum: number, load: any) => sum + (load.stops?.length || 0), 0);
  const totalWithInvoices = selectedLoadDetails.filter((load: any) => load.invoice).length;
  const totalWithPODs = selectedLoadDetails.filter((load: any) => load.podDocumentPath).length;
  const totalWithBOLs = selectedLoadDetails.filter((load: any) => load.bolDocumentPath).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Ghost Load Cleanup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loading loads...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Ghost Load Cleanup Tool
        </CardTitle>
        <p className="text-sm text-gray-600">
          Select loads to delete permanently. This will remove all related data including stops, invoices, and documents.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selection Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={selectedLoads.size === typedLoads.length && typedLoads.length > 0}
                onCheckedChange={handleSelectAll}
                data-testid="checkbox-select-all"
              />
              Select All ({typedLoads.length} loads)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" data-testid="badge-selected-count">
              {selectedLoads.size} selected
            </Badge>
            {selectedLoads.size > 0 && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleBulkDelete}
                data-testid="button-bulk-delete"
              >
                Delete Selected
              </Button>
            )}
          </div>
        </div>

        {/* Selection Preview */}
        {selectedLoads.size > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Will delete:</strong> {selectedLoads.size} loads, {totalStops} stops, {totalWithInvoices} invoices, {totalWithPODs} POD files, {totalWithBOLs} BOL files
            </AlertDescription>
          </Alert>
        )}

        {/* Loads List */}
        <div className="max-h-96 overflow-y-auto border rounded-md">
          <div className="space-y-2 p-4">
            {typedLoads.map((load: any) => (
              <div 
                key={load.id} 
                className={`flex items-center justify-between p-3 rounded border ${
                  selectedLoads.has(load.id) ? 'bg-red-50 border-red-200' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedLoads.has(load.id)}
                    onCheckedChange={(checked) => handleLoadToggle(load.id, !!checked)}
                    data-testid={`checkbox-load-${load.id}`}
                  />
                  <div>
                    <div className="font-medium" data-testid={`text-load-number-${load.id}`}>
                      {load.number109}
                    </div>
                    <div className="text-xs text-gray-500">
                      BOL: {load.bolNumber || "Not set"} • {load.status} • {new Date(load.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {load.stops && load.stops.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {load.stops.length} stops
                    </Badge>
                  )}
                  {load.invoice && (
                    <Badge variant="secondary" className="text-xs">
                      invoice
                    </Badge>
                  )}
                  {load.podDocumentPath && (
                    <Badge variant="secondary" className="text-xs">
                      POD
                    </Badge>
                  )}
                  {load.bolDocumentPath && (
                    <Badge variant="secondary" className="text-xs">
                      BOL file
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bulk Delete Results */}
        {bulkDeleteResults && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div><strong>Bulk deletion completed:</strong></div>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600">✓ {bulkDeleteResults.successful.length} successful</span>
                  <span className="text-red-600">✗ {bulkDeleteResults.failed.length} failed</span>
                </div>
                {bulkDeleteResults.failed.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium">View failures</summary>
                    <div className="mt-2 space-y-1 text-xs">
                      {bulkDeleteResults.failed.map((failure: any, index: number) => (
                        <div key={index} className="text-red-600">
                          {failure.loadNumber}: {failure.error}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Confirmation Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Confirm Bulk Deletion
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>WARNING:</strong> This will permanently delete {selectedLoads.size} loads and all related data:
                  <ul className="mt-2 list-disc list-inside text-sm space-y-1">
                    <li>{selectedLoads.size} load records</li>
                    <li>{totalStops} load stops</li>
                    <li>{totalWithInvoices} invoices</li>
                    <li>{totalWithPODs} POD files</li>
                    <li>{totalWithBOLs} BOL files</li>
                  </ul>
                  <p className="mt-2 font-medium text-red-600">This action cannot be undone!</p>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="confirmation">
                  Type exactly: <code className="bg-gray-100 px-1">DELETE ALL SELECTED LOADS</code>
                </Label>
                <Input
                  id="confirmation"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Type confirmation text here..."
                  data-testid="input-confirmation"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowConfirmDialog(false)}
                  data-testid="button-cancel-delete"
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  onClick={executeDelete}
                  disabled={confirmationText !== "DELETE ALL SELECTED LOADS" || bulkDeleteMutation.isPending}
                  data-testid="button-confirm-delete"
                >
                  {bulkDeleteMutation.isPending ? "Deleting..." : "Delete All Selected"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}