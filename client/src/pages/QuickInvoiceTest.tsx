import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function QuickInvoiceTest() {
  const { toast } = useToast();

  // Fetch loads
  const { data: loads, isLoading } = useQuery({
    queryKey: ["/api/loads"],
    retry: false,
  });

  // Fetch invoices
  const { data: invoices } = useQuery({
    queryKey: ["/api/invoices"],
    retry: false,
  });

  // Manual invoice generation mutation
  const generateInvoiceMutation = useMutation({
    mutationFn: async (loadId: string) => {
      return await apiRequest("/api/loads/" + loadId + "/generate-invoice", "POST", {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Invoice Generated Successfully",
        description: `Invoice ${data.invoiceNumber} created for $${data.totalAmount}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    },
    onError: (error: any) => {
      console.error("Invoice generation error:", error);
      toast({
        title: "Invoice Generation Failed",
        description: error.message || "Unable to generate invoice",
        variant: "destructive",
      });
    },
  });

  const hasInvoice = (loadId: string) => {
    return Array.isArray(invoices) && invoices.some((inv: any) => inv.loadId === loadId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "created":
        return "bg-gray-100 text-gray-800";
      case "en_route_pickup":
      case "en_route_receiver":
        return "bg-yellow-100 text-yellow-800";
      case "at_shipper":
      case "at_receiver":
        return "bg-blue-100 text-blue-800";
      case "delivered":
        return "bg-green-100 text-green-800";
      case "completed":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  const activeLoads = Array.isArray(loads) ? loads.filter((load: any) => load.status !== "completed") : [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quick Invoice Test</h1>
        <div className="text-sm text-gray-600">
          Active loads: {activeLoads.length} | Total invoices: {Array.isArray(invoices) ? invoices.length : 0}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Load Invoice Generation</CardTitle>
        </CardHeader>
        <CardContent>
          {activeLoads.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No active loads available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeLoads.map((load: any) => (
                <div
                  key={load.id}
                  className="border rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">{load.number109}</div>
                    <div className="text-sm text-gray-600">
                      Driver: {load.driver ? `${load.driver.firstName} ${load.driver.lastName}` : 'Not assigned'}
                    </div>
                    <div className="text-sm text-gray-500">
                      Destination: {load.location ? `${load.location.city}, ${load.location.state}` : 'Not set'}
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge className={getStatusColor(load.status)}>
                        {load.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                      {hasInvoice(load.id) && (
                        <Badge className="bg-green-100 text-green-800">
                          Invoice Generated
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {!hasInvoice(load.id) ? (
                      <Button
                        onClick={() => generateInvoiceMutation.mutate(load.id)}
                        disabled={generateInvoiceMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {generateInvoiceMutation.isPending ? "Generating..." : "Generate Invoice"}
                      </Button>
                    ) : (
                      <Button variant="outline" disabled>
                        Invoice Already Generated
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {Array.isArray(invoices) && invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invoices.slice(0, 5).map((invoice: any) => (
                <div key={invoice.id} className="flex justify-between items-center p-2 border rounded">
                  <div>
                    <span className="font-medium">{invoice.invoiceNumber}</span>
                    <span className="text-sm text-gray-600 ml-2">
                      Load: {(Array.isArray(loads) ? loads : []).find((l: any) => l.id === invoice.loadId)?.number109 || 'Unknown'}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">${invoice.totalAmount}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(invoice.generatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}