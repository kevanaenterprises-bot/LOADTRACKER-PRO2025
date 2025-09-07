import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Printer, Eye, DollarSign, Truck, FileText, Calendar, Search, Mail, ChevronDown } from "lucide-react";
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
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewHTML, setPreviewHTML] = useState("");
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string>("");
  
  // Fetch actual customers from database for dropdown
  const { data: customersData } = useQuery({
    queryKey: ["/api/customers"],
  });

  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ["/api/invoices"],
  });

  const invoices = Array.isArray(invoicesData) ? invoicesData as Invoice[] : [];

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

  // Print preview function - Shows invoice with POD attachments
  const handlePrintPreview = async (invoice: Invoice) => {
    if (!invoice.loadId) {
      toast({
        title: "Error",
        description: "No load associated with this invoice",
        variant: "destructive",
      });
      return;
    }

    setIsPreviewing(true);
    try {
      const response = await apiRequest(`/api/invoices/${invoice.invoiceNumber}/print-preview`, "POST", {
        loadId: invoice.loadId
      });

      if (response.success) {
        setPreviewHTML(response.previewHTML);
        setPreviewInvoice(invoice);
        setPreviewDialogOpen(true);
        
        toast({
          title: "Preview Generated",
          description: `${response.podAttachments?.length || 0} POD attachment(s) found`,
        });
      }
    } catch (error: any) {
      console.error("Print preview error:", error);
      toast({
        title: "Preview Failed",
        description: error.message || "Failed to generate print preview",
        variant: "destructive",
      });
    }
    setIsPreviewing(false);
  };

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
              <h1>GO 4 Farms & Cattle</h1>
              <p style="margin: 5px 0;">1510 Crystal Valley Way<br>
                 Melissa, TX 75454<br>
                 Phone: 214-878-1230<br>
                 Email: accounting@go4fc.com</p>
              <h2 style="margin-top: 20px;">Invoice ${invoice.invoiceNumber}</h2>
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
              <p>GO 4 Farms & Cattle - Professional Logistics Services</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      
      // Wait for content to load before printing
      setTimeout(() => {
        printWindow.print();
      }, 500);
      
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
                          onClick={() => handlePrintPreview(invoice)}
                          variant="outline"
                          className="flex items-center gap-2"
                          disabled={isPreviewing}
                        >
                          <Search className="h-4 w-4" />
                          {isPreviewing ? "Loading..." : "Preview with PODs"}
                        </Button>
                        
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

      {/* Print Preview Modal */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Print Preview - Invoice {previewInvoice?.invoiceNumber}
              {previewInvoice?.load?.podDocumentPath && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  POD Attached
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {previewHTML && (
              <div className="border rounded-lg p-4 bg-white">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-sm text-gray-600">
                    Preview shows exactly what will be printed/emailed with POD attachments
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const printWindow = window.open('', '_blank');
                        if (printWindow) {
                          printWindow.document.write(previewHTML);
                          printWindow.document.close();
                          printWindow.print();
                        }
                      }}
                    >
                      <Printer className="h-4 w-4 mr-1" />
                      Print This Preview
                    </Button>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <button
                          type="button"
                          className="flex h-10 w-[280px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                          data-testid="customer-email-select"
                        >
                          <span className={selectedEmail ? "" : "text-muted-foreground"}>
                            {selectedEmail ? 
                              (selectedEmail === 'custom' ? 'Enter Custom Email...' : 
                               Array.isArray(customersData) ? 
                                 customersData.find(c => c.email === selectedEmail || c.name === selectedEmail)?.name + 
                                 (customersData.find(c => c.email === selectedEmail || c.name === selectedEmail)?.email ? 
                                   ` - ${customersData.find(c => c.email === selectedEmail || c.name === selectedEmail)?.email}` : ' (no email)') 
                                 : selectedEmail
                              ) : 
                              "Select customer to send invoice..."
                            }
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </button>
                        
                        {showCustomerDropdown && (
                          <div className="absolute top-full left-0 z-50 w-full mt-1 bg-popover text-popover-foreground rounded-md border shadow-md max-h-[200px] overflow-y-auto">
                            {Array.isArray(customersData) && customersData.length > 0 ? (
                              customersData.map((customer: any) => (
                                <div
                                  key={customer.id}
                                  className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                                  onClick={() => {
                                    setSelectedEmail(customer.email || customer.name);
                                    setShowCustomerDropdown(false);
                                  }}
                                >
                                  {customer.name} {customer.email ? `- ${customer.email}` : '(no email)'}
                                </div>
                              ))
                            ) : (
                              <div className="relative flex select-none items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground">
                                No customers available
                              </div>
                            )}
                            <div
                              className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                              onClick={() => {
                                setSelectedEmail('custom');
                                setShowCustomerDropdown(false);
                              }}
                            >
                              Enter Custom Email...
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <Button
                        size="sm"
                        disabled={!selectedEmail}
                        onClick={() => {
                          if (!selectedEmail || !previewInvoice) return;
                          
                          const sendEmail = async (emailAddress: string) => {
                            return fetch(`/api/invoices/${previewInvoice.id}/email-complete-package`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'X-Bypass-Token': 'LOADTRACKER_BYPASS_2025'
                              },
                              credentials: 'include',
                              body: JSON.stringify({ 
                                emailAddress: emailAddress,
                                loadId: previewInvoice.loadId 
                              })
                            }).then(response => response.json());
                          };
                          
                          // Always send to internal addresses first
                          const internalEmails = [
                            'accounting@go4fc.com',
                            'gofarmsbills@gmail.com'
                          ];
                          
                          const emailsToSend = [...internalEmails];
                          
                          // Add customer email if selected
                          if (selectedEmail === 'custom') {
                            const customEmail = prompt("Enter custom email address:");
                            if (customEmail) {
                              emailsToSend.push(customEmail);
                            }
                          } else if (selectedEmail !== 'no-customers') {
                            // Add selected customer email
                            emailsToSend.push(selectedEmail);
                          }
                          
                          // Send to all addresses
                          Promise.all(emailsToSend.map(email => sendEmail(email)))
                          .then(results => {
                            const successful = results.filter(result => result.message && result.message.includes('successfully'));
                            const failed = results.length - successful.length;
                            
                            if (successful.length > 0) {
                              const customerCount = emailsToSend.length - 2; // Subtract internal addresses
                              toast({
                                title: "✅ Emails Sent!",
                                description: `Sent to internal accounting (2) ${customerCount > 0 ? `+ customer (${customerCount})` : ''}`,
                              });
                            }
                            
                            if (failed > 0) {
                              toast({
                                title: "⚠️ Partial Success",
                                description: `${successful.length} sent, ${failed} failed`,
                                variant: "destructive"
                              });
                            }
                          })
                          .catch(error => {
                            toast({
                              title: "❌ Email Failed",
                              description: "Failed to send emails",
                              variant: "destructive"
                            });
                          });
                        }}
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Send Email
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div 
                  className="border border-gray-200 bg-white"
                  style={{ 
                    minHeight: '600px',
                    transform: 'scale(0.8)',
                    transformOrigin: 'top left',
                    width: '125%'
                  }}
                  dangerouslySetInnerHTML={{ __html: previewHTML }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}