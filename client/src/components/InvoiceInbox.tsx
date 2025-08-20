import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Printer, Eye, DollarSign, Truck, FileText, Calendar } from "lucide-react";
import { format } from "date-fns";

interface Invoice {
  id: string;
  invoiceNumber: string;
  loadId: string;
  flatRate: string;
  lumperCharge: string;
  extraStopsCharge: string;
  extraStopsCount: number;
  totalAmount: string;
  status: string;
  generatedAt: string;
  load?: {
    number109: string;
    driver?: {
      firstName: string;
      lastName: string;
    };
    location?: {
      name: string;
      city: string;
      state: string;
    };
    podDocumentPath?: string;
  };
}

export default function InvoiceInbox() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["/api/invoices"],
  });

  const markPrintedMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      return await apiRequest(`/api/invoices/${invoiceId}/print`, "PATCH");
    },
    onSuccess: () => {
      toast({
        title: "Invoice Marked as Printed",
        description: "Invoice has been marked as printed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark invoice as printed.",
        variant: "destructive",
      });
    },
  });

  const pendingInvoices = invoices.filter((invoice: Invoice) => invoice.status === "pending");
  const printedInvoices = invoices.filter((invoice: Invoice) => invoice.status === "printed");

  const handlePrint = (invoice: Invoice) => {
    // Create a printable invoice format
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Invoice ${invoice.invoiceNumber}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              .invoice-details { margin-bottom: 20px; }
              .line-item { display: flex; justify-content: space-between; margin: 5px 0; }
              .total { font-weight: bold; font-size: 18px; border-top: 2px solid #000; padding-top: 10px; }
              .footer { margin-top: 30px; text-align: center; color: #666; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>LoadTracker Pro</h1>
              <h2>Invoice ${invoice.invoiceNumber}</h2>
            </div>
            
            <div class="invoice-details">
              <p><strong>Load #:</strong> ${invoice.load?.number109 || 'N/A'}</p>
              <p><strong>Driver:</strong> ${invoice.load?.driver ? `${invoice.load.driver.firstName} ${invoice.load.driver.lastName}` : 'N/A'}</p>
              <p><strong>Destination:</strong> ${invoice.load?.location ? `${invoice.load.location.name}, ${invoice.load.location.city}, ${invoice.load.location.state}` : 'N/A'}</p>
              <p><strong>Invoice Date:</strong> ${format(new Date(invoice.generatedAt), 'MMM d, yyyy')}</p>
            </div>

            <div class="line-items">
              <div class="line-item">
                <span>Base Rate (${invoice.load?.location?.city}, ${invoice.load?.location?.state}):</span>
                <span>$${parseFloat(invoice.flatRate).toFixed(2)}</span>
              </div>
              ${parseFloat(invoice.lumperCharge) > 0 ? `
              <div class="line-item">
                <span>Lumper Charge:</span>
                <span>$${parseFloat(invoice.lumperCharge).toFixed(2)}</span>
              </div>
              ` : ''}
              ${invoice.extraStopsCount > 0 ? `
              <div class="line-item">
                <span>Extra Stops (${invoice.extraStopsCount} × $50.00):</span>
                <span>$${parseFloat(invoice.extraStopsCharge).toFixed(2)}</span>
              </div>
              ` : ''}
              <div class="line-item total">
                <span>Total Amount:</span>
                <span>$${parseFloat(invoice.totalAmount).toFixed(2)}</span>
              </div>
            </div>

            <div class="footer">
              <p>Generated automatically upon POD upload</p>
              <p>LoadTracker Pro - Comprehensive Logistics Management</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
      
      // Mark as printed after successful print dialog
      markPrintedMutation.mutate(invoice.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Invoices - Ready to Print */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoice Inbox - Ready to Print
            {pendingInvoices.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingInvoices.length} Pending
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingInvoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pending invoices. Invoices will appear here automatically when drivers upload POD documents.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingInvoices.map((invoice: Invoice) => (
                <Card key={invoice.id} className="border-l-4 border-l-orange-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="font-semibold text-lg">{invoice.invoiceNumber}</h3>
                          <Badge variant="outline" className="bg-orange-50">
                            Load #{invoice.load?.number109}
                          </Badge>
                          <Badge variant="secondary">
                            ${parseFloat(invoice.totalAmount).toFixed(2)}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4" />
                            <span>
                              {invoice.load?.driver 
                                ? `${invoice.load.driver.firstName} ${invoice.load.driver.lastName}`
                                : 'No driver assigned'
                              }
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span>
                              {invoice.load?.location 
                                ? `${invoice.load.location.city}, ${invoice.load.location.state}`
                                : 'No destination'
                              }
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>{format(new Date(invoice.generatedAt), 'MMM d, yyyy h:mm a')}</span>
                          </div>
                        </div>

                        {/* Invoice Breakdown */}
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500">Base Rate:</span>
                              <div className="font-medium">${parseFloat(invoice.flatRate).toFixed(2)}</div>
                            </div>
                            {parseFloat(invoice.lumperCharge) > 0 && (
                              <div>
                                <span className="text-gray-500">Lumper:</span>
                                <div className="font-medium">${parseFloat(invoice.lumperCharge).toFixed(2)}</div>
                              </div>
                            )}
                            {invoice.extraStopsCount > 0 && (
                              <div>
                                <span className="text-gray-500">Extra Stops:</span>
                                <div className="font-medium">{invoice.extraStopsCount} × $50</div>
                              </div>
                            )}
                            <div>
                              <span className="text-gray-500">Total:</span>
                              <div className="font-bold text-lg">${parseFloat(invoice.totalAmount).toFixed(2)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 ml-4">
                        <Button 
                          onClick={() => handlePrint(invoice)}
                          className="flex items-center gap-2"
                          disabled={markPrintedMutation.isPending}
                        >
                          <Printer className="h-4 w-4" />
                          Print & Mark Complete
                        </Button>
                        
                        {invoice.load?.podDocumentPath && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => window.open(invoice.load.podDocumentPath, '_blank')}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View POD
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Printed Invoices History */}
      {printedInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Recently Printed Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {printedInvoices.slice(0, 10).map((invoice: Invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border-l-4 border-l-green-500">
                  <div className="flex items-center gap-4">
                    <span className="font-medium">{invoice.invoiceNumber}</span>
                    <Badge variant="outline">Load #{invoice.load?.number109}</Badge>
                    <span className="text-sm text-gray-600">
                      ${parseFloat(invoice.totalAmount).toFixed(2)}
                    </span>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    Printed
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}