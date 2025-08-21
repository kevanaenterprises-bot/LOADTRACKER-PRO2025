import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function InvoiceTestPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  // Fetch all loads
  const { data: loads = [] } = useQuery({
    queryKey: ["/api/loads"],
    retry: false,
  });

  // Fetch all invoices
  const { data: invoices = [] } = useQuery({
    queryKey: ["/api/invoices"],
    retry: false,
  });

  const triggerInvoiceGeneration = async (loadId: string) => {
    setLoading(true);
    try {
      // First add both BOL and POD documents to trigger invoice generation
      await apiRequest("PATCH", `/api/loads/${loadId}/pod`, {
        podDocumentURL: "https://storage.googleapis.com/test/sample-pod.pdf"
      });

      await apiRequest("PATCH", `/api/loads/${loadId}/bol-document`, {
        bolDocumentURL: "https://storage.googleapis.com/test/sample-bol.pdf"
      });

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });

      toast({
        title: "Documents Added",
        description: "BOL and POD documents added. Check for auto-generated invoice!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to add documents: ${error}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const completeLoad = async (loadId: string) => {
    setLoading(true);
    try {
      await apiRequest("POST", `/api/loads/${loadId}/complete`, {});
      
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });

      toast({
        title: "Load Completed",
        description: "Load completed and invoice generated!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to complete load: ${error}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Generation Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Loads Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Available Loads</h3>
              <div className="space-y-2">
                {loads.map((load: any) => (
                  <Card key={load.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Load #{load.number109}</div>
                        <div className="text-sm text-gray-600">
                          Status: <Badge variant="outline">{load.status}</Badge>
                        </div>
                        <div className="text-xs text-gray-500">
                          BOL: {load.bolDocumentPath ? "✅" : "❌"} | 
                          POD: {load.podDocumentPath ? "✅" : "❌"}
                        </div>
                      </div>
                      <div className="space-x-2">
                        <Button
                          size="sm"
                          onClick={() => triggerInvoiceGeneration(load.id)}
                          disabled={loading}
                        >
                          Add Docs
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => completeLoad(load.id)}
                          disabled={loading}
                        >
                          Complete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Invoices Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Generated Invoices</h3>
              <div className="space-y-2">
                {invoices.length === 0 ? (
                  <Card className="p-3 text-center text-gray-500">
                    No invoices yet. Complete a load to generate an invoice.
                  </Card>
                ) : (
                  invoices.map((invoice: any) => (
                    <Card key={invoice.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{invoice.invoiceNumber}</div>
                          <div className="text-sm text-gray-600">
                            Load: {invoice.load?.number109 || "N/A"}
                          </div>
                          <div className="text-sm text-green-600 font-medium">
                            ${parseFloat(invoice.totalAmount).toFixed(2)}
                          </div>
                        </div>
                        <Badge variant={invoice.status === "pending" ? "destructive" : "default"}>
                          {invoice.status}
                        </Badge>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium mb-2">How to Test Invoice Generation:</h4>
            <ol className="text-sm space-y-1 list-decimal list-inside">
              <li>Click "Add Docs" to add BOL and POD documents to a load</li>
              <li>This should automatically generate an invoice (check console logs)</li>
              <li>Alternatively, click "Complete" to manually complete a load and generate invoice</li>
              <li>Generated invoices should appear in the "Generated Invoices" section</li>
              <li>Go to the main dashboard "Invoicing" tab to see the admin invoice inbox</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}