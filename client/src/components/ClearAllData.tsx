import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Database, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function ClearAllData() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmationText, setConfirmationText] = useState("");
  const [results, setResults] = useState<any>(null);

  const clearAllMutation = useMutation({
    mutationFn: async (confirmText: string) => {
      return apiRequest("/api/system/clear-all-data", "POST", { confirmationText: confirmText });
    },
    onSuccess: (data) => {
      setResults(data);
      setConfirmationText("");
      queryClient.invalidateQueries();
      toast({
        title: "Load Data Cleared",
        description: "All loads and related data deleted. Master data preserved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Clear Failed",
        description: error.message || "Failed to clear load data",
        variant: "destructive",
      });
    },
  });

  const handleClearAll = () => {
    if (confirmationText !== "DELETE LOAD DATA") {
      toast({
        title: "Invalid confirmation",
        description: "Please type exactly: DELETE LOAD DATA",
        variant: "destructive",
      });
      return;
    }

    clearAllMutation.mutate(confirmationText);
  };

  return (
    <Card className="border-orange-200">
      <CardHeader className="bg-orange-50">
        <CardTitle className="flex items-center gap-2 text-orange-600">
          <Database className="h-5 w-5" />
          Clear Load Data - Testing Tool
        </CardTitle>
        <p className="text-sm text-orange-600 font-medium">
          🗑️ Delete all load-related data while keeping your master data setup
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-900">
            <strong>This will permanently delete:</strong>
            <ul className="mt-2 list-disc list-inside text-sm space-y-1">
              <li><strong>All loads</strong> (and all related stops, status history)</li>
              <li><strong>All invoices</strong> (paid and unpaid)</li>
              <li><strong>All LoadRight tenders</strong></li>
              <li><strong>All GPS tracking data</strong></li>
              <li><strong>All fuel receipts</strong></li>
              <li><strong>All chat messages</strong></li>
              <li><strong>All notification logs</strong></li>
              <li><strong>All BOL numbers</strong></li>
              <li><strong>All road tour history</strong></li>
            </ul>
            <p className="mt-3 font-bold text-green-700">
              ✅ KEEPS: Customers, Locations, Drivers, Trucks, and Rates
            </p>
            <p className="mt-2 text-sm text-orange-700">
              THIS CANNOT BE UNDONE! Perfect for testing new loads with your existing setup.
            </p>
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <Label htmlFor="clear-confirmation" className="text-base font-medium">
            To confirm, type exactly: <code className="bg-orange-100 px-2 py-1 rounded text-orange-600 font-mono">DELETE LOAD DATA</code>
          </Label>
          <Input
            id="clear-confirmation"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Type confirmation text here..."
            className="border-orange-300 focus:border-orange-500 focus:ring-orange-500"
            data-testid="input-clear-confirmation"
          />
        </div>

        <Button 
          variant="destructive"
          size="lg"
          onClick={handleClearAll}
          disabled={confirmationText !== "DELETE LOAD DATA" || clearAllMutation.isPending}
          className="w-full bg-orange-600 hover:bg-orange-700"
          data-testid="button-clear-all-data"
        >
          <Trash2 className="mr-2 h-5 w-5" />
          {clearAllMutation.isPending ? "Deleting Load Data..." : "DELETE LOAD DATA"}
        </Button>

        {results && (
          <Alert className="bg-green-50 border-green-200">
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium text-green-800">Load data cleared successfully!</div>
                <div className="text-sm text-green-700">
                  Deleted: All loads, invoices, tenders, tracking data, fuel receipts, chat messages, and related records.
                </div>
                <div className="text-sm text-green-700 font-bold">
                  ✅ Preserved: All customers, locations, drivers, trucks, and rates.
                </div>
                <div className="text-sm text-green-700 font-medium">
                  Ready for fresh load testing with your existing setup!
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertDescription className="text-sm text-gray-600">
            <strong>When to use this:</strong> Use this tool when you want to test new loads from scratch without 
            having to recreate all your customers, locations, drivers, and trucks. Perfect for testing the full load 
            workflow with real contract data.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
