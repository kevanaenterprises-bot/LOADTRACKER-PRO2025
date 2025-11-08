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
      // Invalidate all queries to refresh the entire UI
      queryClient.invalidateQueries();
      toast({
        title: "Database Cleared",
        description: "All data has been permanently deleted from the system",
        variant: "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Clear Failed",
        description: error.message || "Failed to clear database",
        variant: "destructive",
      });
    },
  });

  const handleClearAll = () => {
    if (confirmationText !== "DELETE EVERYTHING") {
      toast({
        title: "Invalid confirmation",
        description: "Please type exactly: DELETE EVERYTHING",
        variant: "destructive",
      });
      return;
    }

    clearAllMutation.mutate(confirmationText);
  };

  return (
    <Card className="border-red-200">
      <CardHeader className="bg-red-50">
        <CardTitle className="flex items-center gap-2 text-red-600">
          <Database className="h-5 w-5" />
          Clear All Data - Testing Tool
        </CardTitle>
        <p className="text-sm text-red-600 font-medium">
          ⚠️ DANGER ZONE - This will permanently delete ALL data from your entire system!
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-900">
            <strong>WARNING: This action will permanently delete:</strong>
            <ul className="mt-2 list-disc list-inside text-sm space-y-1">
              <li><strong>All loads</strong> (and all related stops, status history)</li>
              <li><strong>All invoices</strong> (paid and unpaid)</li>
              <li><strong>All customers</strong></li>
              <li><strong>All drivers</strong></li>
              <li><strong>All trucks</strong> (and service records)</li>
              <li><strong>All documents</strong> (BOLs, PODs, rate confirmations)</li>
              <li><strong>All LoadRight tenders</strong></li>
              <li><strong>All locations and rates</strong></li>
              <li><strong>All notification logs</strong></li>
              <li><strong>Everything in your database!</strong></li>
            </ul>
            <p className="mt-3 font-bold text-red-600">
              THIS CANNOT BE UNDONE! Use only for testing when you need a completely fresh start.
            </p>
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <Label htmlFor="clear-confirmation" className="text-base font-medium">
            To confirm, type exactly: <code className="bg-red-100 px-2 py-1 rounded text-red-600 font-mono">DELETE EVERYTHING</code>
          </Label>
          <Input
            id="clear-confirmation"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Type confirmation text here..."
            className="border-red-300 focus:border-red-500 focus:ring-red-500"
            data-testid="input-clear-confirmation"
          />
        </div>

        <Button 
          variant="destructive"
          size="lg"
          onClick={handleClearAll}
          disabled={confirmationText !== "DELETE EVERYTHING" || clearAllMutation.isPending}
          className="w-full bg-red-600 hover:bg-red-700"
          data-testid="button-clear-all-data"
        >
          <Trash2 className="mr-2 h-5 w-5" />
          {clearAllMutation.isPending ? "Deleting Everything..." : "DELETE ALL DATA"}
        </Button>

        {results && (
          <Alert className="bg-green-50 border-green-200">
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium text-green-800">Database cleared successfully!</div>
                <div className="text-sm text-green-700">
                  Deleted: {results.loads || 0} loads, {results.invoices || 0} invoices, {results.customers || 0} customers, 
                  {results.drivers || 0} drivers, {results.trucks || 0} trucks, and all related data.
                </div>
                <div className="text-sm text-green-700 font-medium">
                  System is now ready for fresh testing.
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertDescription className="text-sm text-gray-600">
            <strong>When to use this:</strong> Use this tool when starting a new round of testing and you want a completely 
            clean database. This is perfect for testing the full workflow from scratch with real data.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
