import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, FileText, Package, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PrintButtonProps {
  invoiceId?: string;
  loadId?: string;
  invoice?: any;
  load?: any;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export function PrintButton({ invoiceId, loadId, invoice, load, variant = "default", size = "default" }: PrintButtonProps) {
  const { toast } = useToast();
  const [isPrinting, setIsPrinting] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [isEmailing, setIsEmailing] = useState(false);

  const handlePrintInvoice = async () => {
    setIsPrinting(true);
    try {
      // Create a new window for preview
      const previewWindow = window.open('', '_blank');
      if (!previewWindow) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
      }

      // Generate invoice HTML
      const invoiceHTML = generateInvoiceHTML(invoice, load);
      
      // Create preview HTML with Print and Close buttons
      const previewHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print Preview - Invoice</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; }
            .preview-header { 
              background: #f8f9fa; 
              padding: 15px; 
              border-bottom: 1px solid #dee2e6;
              position: sticky;
              top: 0;
              z-index: 1000;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .preview-title { 
              font-size: 18px; 
              font-weight: bold; 
              color: #333;
            }
            .preview-buttons { 
              display: flex; 
              gap: 10px; 
            }
            .btn { 
              padding: 8px 16px; 
              border: none; 
              border-radius: 4px; 
              cursor: pointer; 
              font-size: 14px;
              font-weight: 500;
            }
            .btn-primary { 
              background: #007bff; 
              color: white; 
            }
            .btn-secondary { 
              background: #6c757d; 
              color: white; 
            }
            .btn:hover { 
              opacity: 0.9; 
            }
            .document-content { 
              padding: 20px; 
            }
            @media print {
              .preview-header { display: none; }
              .document-content { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="preview-header">
            <div class="preview-title">🧾 Print Preview - Invoice</div>
            <div class="preview-buttons">
              <button class="btn btn-primary" onclick="window.print(); markAsPrinted();">🖨️ Print</button>
              <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
            </div>
          </div>
          <div class="document-content">
            ${invoiceHTML}
          </div>
          <script>
            async function markAsPrinted() {
              try {
                await fetch('/api/invoices/${invoiceId}/mark-printed', {
                  method: 'PATCH',
                  credentials: 'include'
                });
              } catch (e) {
                console.log('Could not mark as printed:', e);
              }
            }
          </script>
        </body>
        </html>
      `;
      
      previewWindow.document.write(previewHTML);
      previewWindow.document.close();

      toast({
        title: "Preview Opened",
        description: "Invoice preview opened. Review and click Print when ready.",
      });
      
    } catch (error: any) {
      toast({
        title: "Preview Failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setIsPrinting(false);
    setPrintDialogOpen(false);
  };

  const handlePrintPOD = async () => {
    setIsPrinting(true);
    try {
      // Create a new window for preview
      const previewWindow = window.open('', '_blank');
      if (!previewWindow) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
      }

      // Check if POD document exists as attachment
      if (load?.podDocumentPath) {
        // Create preview with embedded POD document (authenticated)
        const previewHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Print Preview - POD Document</title>
            <style>
              body { margin: 0; font-family: Arial, sans-serif; }
              .preview-header { 
                background: #f8f9fa; 
                padding: 15px; 
                border-bottom: 1px solid #dee2e6;
                position: sticky;
                top: 0;
                z-index: 1000;
                display: flex;
                justify-content: space-between;
                align-items: center;
              }
              .preview-title { 
                font-size: 18px; 
                font-weight: bold; 
                color: #333;
              }
              .preview-buttons { 
                display: flex; 
                gap: 10px; 
              }
              .btn { 
                padding: 8px 16px; 
                border: none; 
                border-radius: 4px; 
                cursor: pointer; 
                font-size: 14px;
                font-weight: 500;
              }
              .btn-primary { 
                background: #007bff; 
                color: white; 
              }
              .btn-secondary { 
                background: #6c757d; 
                color: white; 
              }
              .btn:hover { 
                opacity: 0.9; 
              }
              .document-content { 
                padding: 0; 
                height: calc(100vh - 60px);
              }
              .document-frame {
                width: 100%;
                height: 100%;
                border: none;
              }
              @media print {
                .preview-header { display: none; }
                .document-content { padding: 0; height: auto; }
                .document-frame { height: auto; }
              }
            </style>
          </head>
          <body>
            <div class="preview-header">
              <div class="preview-title">📋 Print Preview - POD Document</div>
              <div class="preview-buttons">
                <button class="btn btn-primary" onclick="printDocument()">🖨️ Print</button>
                <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
              </div>
            </div>
            <div class="document-content">
              <iframe class="document-frame" src="/objects/${load.podDocumentPath}"></iframe>
            </div>
            <script>
              function printDocument() {
                try {
                  const iframe = document.querySelector('.document-frame');
                  iframe.contentWindow.print();
                } catch (e) {
                  window.print();
                }
              }
            </script>
          </body>
          </html>
        `;
        
        previewWindow.document.write(previewHTML);
        previewWindow.document.close();
        
        toast({
          title: "POD Preview Opened",
          description: "POD document preview opened. Review and click Print when ready.",
        });
      } else {
        // If no document attachment, show POD template preview
        const podHTML = generatePODHTML(load);
        
        const previewHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Print Preview - POD Template</title>
            <style>
              body { margin: 0; font-family: Arial, sans-serif; }
              .preview-header { 
                background: #f8f9fa; 
                padding: 15px; 
                border-bottom: 1px solid #dee2e6;
                position: sticky;
                top: 0;
                z-index: 1000;
                display: flex;
                justify-content: space-between;
                align-items: center;
              }
              .preview-title { 
                font-size: 18px; 
                font-weight: bold; 
                color: #333;
              }
              .preview-buttons { 
                display: flex; 
                gap: 10px; 
              }
              .btn { 
                padding: 8px 16px; 
                border: none; 
                border-radius: 4px; 
                cursor: pointer; 
                font-size: 14px;
                font-weight: 500;
              }
              .btn-primary { 
                background: #007bff; 
                color: white; 
              }
              .btn-secondary { 
                background: #6c757d; 
                color: white; 
              }
              .btn:hover { 
                opacity: 0.9; 
              }
              .document-content { 
                padding: 20px; 
              }
              @media print {
                .preview-header { display: none; }
                .document-content { padding: 0; }
              }
            </style>
          </head>
          <body>
            <div class="preview-header">
              <div class="preview-title">📋 Print Preview - POD Template</div>
              <div class="preview-buttons">
                <button class="btn btn-primary" onclick="window.print()">🖨️ Print</button>
                <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
              </div>
            </div>
            <div class="document-content">
              ${podHTML}
            </div>
          </body>
          </html>
        `;
        
        previewWindow.document.write(previewHTML);
        previewWindow.document.close();

        toast({
          title: "POD Template Preview Opened",
          description: "POD template preview opened. Review and click Print when ready.",
        });
      }
      
    } catch (error: any) {
      toast({
        title: "Preview Failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setIsPrinting(false);
    setPrintDialogOpen(false);
  };

  const handlePrintRateConAndInvoice = async () => {
    setIsPrinting(true);
    try {
      // Create a new window for preview
      const previewWindow = window.open('', '_blank');
      if (!previewWindow) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
      }

      // Fetch combined invoice + POD preview from server (like email system does)
      const response = await fetch(`/api/invoices/${invoiceId}/print-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bypass-token': 'LOADTRACKER_BYPASS_2025'
        },
        credentials: 'include',
        body: JSON.stringify({ loadId: load?.id })
      });

      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }

      const { previewHTML: combinedHTML } = await response.json();
      
      // Create preview HTML with Print and Close buttons
      const previewHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print Preview - Complete Package</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; }
            .preview-header { 
              background: #f8f9fa; 
              padding: 15px; 
              border-bottom: 1px solid #dee2e6;
              position: sticky;
              top: 0;
              z-index: 1000;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .preview-title { 
              font-size: 18px; 
              font-weight: bold; 
              color: #333;
            }
            .preview-buttons { 
              display: flex; 
              gap: 10px; 
            }
            .btn { 
              padding: 8px 16px; 
              border: none; 
              border-radius: 4px; 
              cursor: pointer; 
              font-size: 14px;
              font-weight: 500;
            }
            .btn-primary { 
              background: #007bff; 
              color: white; 
            }
            .btn-secondary { 
              background: #6c757d; 
              color: white; 
            }
            .btn:hover { 
              opacity: 0.9; 
            }
            .document-content { 
              padding: 20px; 
            }
            @media print {
              .preview-header { display: none; }
              .document-content { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="preview-header">
            <div class="preview-title">📄 Print Preview - Invoice, Rate Con & POD</div>
            <div class="preview-buttons">
              <button class="btn btn-primary" onclick="window.print()">🖨️ Print</button>
              <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
            </div>
          </div>
          <div class="document-content">
            ${combinedHTML}
          </div>
        </body>
        </html>
      `;
      
      previewWindow.document.write(previewHTML);
      previewWindow.document.close();

      toast({
        title: "Preview Opened",
        description: "Complete package preview opened with Invoice, Rate Con & POD. Review and click Print when ready.",
      });
      
    } catch (error: any) {
      toast({
        title: "Preview Failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setIsPrinting(false);
    setPrintDialogOpen(false);
  };

  const handleEmailCompletePackage = async () => {
    if (!emailAddress) {
      toast({
        title: "Email Required",
        description: "Please enter an email address.",
        variant: "destructive",
      });
      return;
    }

    setIsEmailing(true);
    try {
      // Use invoice number instead of ID if available, fallback to ID
      const invoiceIdentifier = invoice?.invoiceNumber || invoiceId;
      
      if (!invoiceIdentifier) {
        throw new Error("No invoice identifier found. Please try refreshing the page.");
      }
      
      // Send complete document package - invoice + POD/BOL + rate confirmation (if available)
      await apiRequest(`/api/invoices/${invoiceIdentifier}/email-complete-package`, "POST", {
        emailAddress,
        loadId: loadId,
      });

      // Count available documents
      let documentsIncluded = ["Invoice", "Rate Confirmation"];
      if (load?.podDocumentPath) {
        documentsIncluded.push("POD Document");
      }
      if (load?.podDocumentPath) {
        documentsIncluded.push("POD Document");
      }

      toast({
        title: "Complete Package Sent",
        description: `All available documents sent to ${emailAddress}: ${documentsIncluded.join(", ")}`,
      });
      
      setEmailDialogOpen(false);
      setEmailAddress("");
      
    } catch (error: any) {
      toast({
        title: "Email Failed",
        description: error.message || "Failed to send email. Please try again.",
        variant: "destructive",
      });
    }
    setIsEmailing(false);
  };

  return (
    <div className="flex space-x-2">
      {/* Email Button */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogTrigger asChild>
          <Button variant={variant} size={size} disabled={isEmailing}>
            <Mail className="h-4 w-4 mr-2" />
            {isEmailing ? "Emailing..." : "Email"}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email Complete Document Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Recipient Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="customer@company.com"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                disabled={isEmailing}
              />
            </div>
            
            {invoice && load && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700 font-medium">
                  Invoice: {invoice.invoiceNumber} • Load: {load.number_109 || load.number109} • ${invoice.totalAmount}
                </p>
                <div className="text-xs text-gray-600 mt-2">
                  <p><strong>Will include:</strong></p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Invoice & Rate Confirmation (combined)</li>
                    {load.bolDocumentPath && <li>BOL Document (attached file)</li>}
                    {load.podDocumentPath && <li>POD Document (attached file)</li>}
                    {!load.bolDocumentPath && !load.podDocumentPath && (
                      <li className="text-amber-600">No BOL/POD documents available yet</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
            
            <div className="flex space-x-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setEmailDialogOpen(false);
                  setEmailAddress("");
                }}
                disabled={isEmailing}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleEmailCompletePackage}
                disabled={isEmailing || !emailAddress}
                className="bg-green-600 hover:bg-green-700"
              >
                {isEmailing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending Package...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Complete Package
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Button */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size={size} disabled={isPrinting}>
            <Printer className="h-4 w-4 mr-2" />
            {isPrinting ? "Printing..." : "Print"}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Print Documents</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {invoice && load && (
              <div className="space-y-3">
                <Card className="cursor-pointer hover:bg-gray-50 border-2 border-blue-200 bg-blue-50" onClick={handlePrintRateConAndInvoice}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-blue-700" />
                      Print Complete Package
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-gray-600">
                      Invoice: {invoice.invoiceNumber} • Load: {load.number_109 || load.number109} • ${invoice.totalAmount}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Includes: Rate Confirmation, Invoice{load.podDocumentPath ? ', and POD Documents' : ''}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function generateInvoiceHTML(invoice: any, load: any): string {
  const currentDate = new Date().toLocaleDateString();
  
  // Note: Logo will be displayed in print preview - for now using text header
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${invoice?.invoiceNumber || 'N/A'}</title>
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
          margin-bottom: 30px;
          gap: 20px;
        }
        .logo {
          width: 80px;
          height: 80px;
          object-fit: contain;
        }
        .company-info-section {
          text-align: center;
        }
        .company-name {
          font-size: 28px;
          font-weight: bold;
          color: #2d5aa0;
          margin-bottom: 5px;
        }
        .company-info {
          font-size: 14px;
          color: #666;
        }
        .invoice-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .invoice-number {
          font-size: 24px;
          font-weight: bold;
          color: #333;
        }
        .details-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .details-table th,
        .details-table td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        .details-table th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .total-section {
          margin-top: 30px;
          text-align: right;
        }
        .total-amount {
          font-size: 20px;
          font-weight: bold;
          color: #2d5aa0;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-info-section">
          <div class="company-name">GO 4 Farms & Cattle</div>
          <div class="company-info">
            1510 Crystal Valley Way<br>
            Melissa, TX 75454<br>
            Phone: 214-878-1230<br>
            Email: accounting@go4fc.com
          </div>
        </div>
      </div>

      <div class="invoice-details">
        <div>
          <div class="invoice-number">INVOICE ${invoice?.invoiceNumber || 'N/A'}</div>
          <div>Date: ${currentDate}</div>
          <div>Load: ${load?.number_109 || load?.number109 || 'N/A'}</div>
          <div>BOL: ${load?.bolNumber || '374'}</div>
          <div>Trip: ${load?.tripNumber || generateTripNumber()}</div>
        </div>
        <div>
          <div><strong>Status:</strong> ${invoice?.status || 'Pending'}</div>
          <div><strong>Generated:</strong> ${invoice?.generatedAt ? new Date(invoice.generatedAt).toLocaleDateString() : currentDate}</div>
        </div>
      </div>

      <table class="details-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Transportation Service - Load ${load?.number_109 || load?.number109 || 'N/A'} (BOL: ${load?.bolNumber || '374'}, Trip: ${load?.tripNumber || generateTripNumber()})</td>
            <td>${load?.origin || 'N/A'}</td>
            <td>${load?.destination || 'N/A'}</td>
            <td>$${invoice?.flatRate || '0.00'}</td>
          </tr>
          ${invoice?.lumperCharge && parseFloat(invoice.lumperCharge) > 0 ? `
          <tr>
            <td>Lumper Service Charge</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.lumperCharge}</td>
          </tr>
          ` : ''}
          ${invoice?.extraStopsCharge && parseFloat(invoice.extraStopsCharge) > 0 ? `
          <tr>
            <td>Extra Stops (${invoice.extraStopsCount || 0} stops @ $50 each)</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.extraStopsCharge}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="total-section">
        <div style="font-size: 16px; margin-bottom: 10px;">
          <strong>Total Amount: <span class="total-amount">$${invoice?.totalAmount || '0.00'}</span></strong>
        </div>
        <div style="font-size: 14px; color: #666;">
          Payment Terms: Net 30 Days
        </div>
      </div>

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>For questions about this invoice, please contact us at billing@go4farms.com or (555) 123-4567</p>
      </div>
    </body>
    </html>
  `;
}

function generateTripNumber(): string {
  return `T${Math.floor(Math.random() * 90000) + 10000}`;
}

function generatePODHTML(load: any): string {
  const currentDate = new Date().toLocaleDateString();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Proof of Delivery - Load ${load?.number_109 || load?.number109 || 'N/A'}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          line-height: 1.4;
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .company-name {
          font-size: 28px;
          font-weight: bold;
          color: #2d5aa0;
          margin-bottom: 5px;
        }
        .company-info {
          font-size: 14px;
          color: #666;
        }
        .pod-details {
          margin-bottom: 30px;
        }
        .signature-section {
          margin-top: 50px;
          display: flex;
          justify-content: space-between;
        }
        .signature-box {
          width: 45%;
          border: 1px solid #333;
          padding: 20px;
          text-align: center;
          min-height: 100px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-name">GO 4 Farms & Cattle</div>
        <div class="company-info">
          1510 Crystal Valley Way<br>
          Melissa, TX 75454<br>
          Phone: 214-878-1230<br>
          Email: accounting@go4fc.com
        </div>
        <h2>PROOF OF DELIVERY</h2>
      </div>

      <div class="pod-details">
        <div><strong>Load Number:</strong> ${load?.number_109 || load?.number109 || 'N/A'}</div>
        <div><strong>POD Number:</strong> ${load?.bolNumber || 'N/A'}</div>
        <div><strong>Trip Number:</strong> ${load?.tripNumber || generateTripNumber()}</div>
        <div><strong>Driver:</strong> ${load?.driver ? `${load.driver.firstName} ${load.driver.lastName}` : 'N/A'}</div>
        <div><strong>Origin:</strong> ${load?.origin || 'N/A'}</div>
        <div><strong>Destination:</strong> ${load?.destination || 'N/A'}</div>
        <div><strong>Delivery Date:</strong> ${currentDate}</div>
      </div>

      <div class="signature-section">
        <div class="signature-box">
          <div><strong>Driver Signature</strong></div>
          <div style="margin-top: 60px;">_________________________</div>
          <div>Print Name: _______________</div>
          <div>Date: _______________</div>
        </div>
        <div class="signature-box">
          <div><strong>Receiver Signature</strong></div>
          <div style="margin-top: 60px;">_________________________</div>
          <div>Print Name: _______________</div>
          <div>Date: _______________</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateBOLHTML(load: any): string {
  const currentDate = new Date().toLocaleDateString();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bill of Lading - Load ${load?.number_109 || load?.number109 || 'N/A'}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          line-height: 1.4;
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .company-name {
          font-size: 28px;
          font-weight: bold;
          color: #2d5aa0;
          margin-bottom: 5px;
        }
        .company-info {
          font-size: 14px;
          color: #666;
        }
        .bol-details {
          margin-bottom: 30px;
        }
        .details-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .details-table th,
        .details-table td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        .details-table th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .signature-section {
          margin-top: 50px;
          display: flex;
          justify-content: space-between;
        }
        .signature-box {
          width: 30%;
          border: 1px solid #333;
          padding: 20px;
          text-align: center;
          min-height: 80px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-name">GO 4 Farms & Cattle</div>
        <div class="company-info">
          1510 Crystal Valley Way<br>
          Melissa, TX 75454<br>
          Phone: 214-878-1230<br>
          Email: accounting@go4fc.com
        </div>
        <h2>BILL OF LADING</h2>
      </div>

      <div class="bol-details">
        <div><strong>Load Number:</strong> ${load?.number_109 || load?.number109 || 'N/A'}</div>
        <div><strong>POD Number:</strong> ${load?.bolNumber || 'N/A'}</div>
        <div><strong>Trip Number:</strong> ${load?.tripNumber || generateTripNumber()}</div>
        <div><strong>Driver:</strong> ${load?.driver ? `${load.driver.firstName} ${load.driver.lastName}` : 'N/A'}</div>
        <div><strong>Date:</strong> ${currentDate}</div>
      </div>

      <table class="details-table">
        <thead>
          <tr>
            <th>Shipper</th>
            <th>Consignee</th>
            <th>Description of Articles</th>
            <th>Weight</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${load?.origin || 'N/A'}</td>
            <td>${load?.destination || 'N/A'}</td>
            <td>General Freight</td>
            <td>TBD</td>
          </tr>
        </tbody>
      </table>

      <div class="signature-section">
        <div class="signature-box">
          <div><strong>Shipper</strong></div>
          <div style="margin-top: 40px;">_____________</div>
          <div>Signature</div>
        </div>
        <div class="signature-box">
          <div><strong>Driver</strong></div>
          <div style="margin-top: 40px;">_____________</div>
          <div>Signature</div>
        </div>
        <div class="signature-box">
          <div><strong>Consignee</strong></div>
          <div style="margin-top: 40px;">_____________</div>
          <div>Signature</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateCombinedRateConInvoiceHTML(invoice: any, load: any): string {
  const currentDate = new Date().toLocaleDateString();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Rate Confirmation & Invoice - ${invoice?.invoiceNumber || 'N/A'}</title>
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
          .page-break { page-break-before: always; }
        }
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
          margin-bottom: 30px;
          gap: 20px;
        }
        .company-info-section {
          text-align: center;
        }
        .company-name {
          font-size: 28px;
          font-weight: bold;
          color: #2d5aa0;
          margin-bottom: 5px;
        }
        .company-info {
          font-size: 14px;
          color: #666;
        }
        .section-title {
          font-size: 22px;
          font-weight: bold;
          color: #2d5aa0;
          margin: 30px 0 20px 0;
          text-align: center;
          border-bottom: 1px solid #ddd;
          padding-bottom: 10px;
        }
        .details-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .details-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .details-table th,
        .details-table td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        .details-table th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .total-section {
          margin-top: 30px;
          text-align: right;
        }
        .total-amount {
          font-size: 20px;
          font-weight: bold;
          color: #2d5aa0;
        }
        .signature-section {
          margin-top: 50px;
          display: flex;
          justify-content: space-between;
        }
        .signature-box {
          width: 45%;
          border: 1px solid #333;
          padding: 20px;
          text-align: center;
          min-height: 80px;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <!-- RATE CONFIRMATION SECTION -->
      <div class="header">
        <div class="company-info-section">
          <div class="company-name">GO 4 Farms & Cattle</div>
          <div class="company-info">
            1510 Crystal Valley Way<br>
            Melissa, TX 75454<br>
            Phone: 214-878-1230<br>
            Email: accounting@go4fc.com
          </div>
        </div>
      </div>

      <div class="section-title">RATE CONFIRMATION</div>

      <div class="details-section">
        <div>
          <div><strong>Load Number:</strong> ${load?.number_109 || load?.number109 || 'N/A'}</div>
          <div><strong>POD Number:</strong> ${load?.bolNumber || 'N/A'}</div>
          <div><strong>Trip Number:</strong> ${load?.tripNumber || generateTripNumber()}</div>
        </div>
        <div>
          <div><strong>Date:</strong> ${currentDate}</div>
          <div><strong>Status:</strong> Confirmed</div>
        </div>
      </div>

      <table class="details-table">
        <thead>
          <tr>
            <th>Service Type</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Transportation Service</td>
            <td>${load?.origin || 'N/A'}</td>
            <td>${load?.destination || 'N/A'}</td>
            <td>$${invoice?.flatRate || '0.00'}</td>
          </tr>
          ${invoice?.lumperCharge && parseFloat(invoice.lumperCharge) > 0 ? `
          <tr>
            <td>Lumper Service</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.lumperCharge}</td>
          </tr>
          ` : ''}
          ${invoice?.extraStopsCharge && parseFloat(invoice.extraStopsCharge) > 0 ? `
          <tr>
            <td>Extra Stops (${invoice.extraStopsCount || 0})</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.extraStopsCharge}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="total-section">
        <div style="font-size: 18px; margin-bottom: 10px;">
          <strong>Total Agreed Rate: <span class="total-amount">$${invoice?.totalAmount || '0.00'}</span></strong>
        </div>
      </div>

      <div class="signature-section">
        <div class="signature-box">
          <div><strong>Customer Acceptance</strong></div>
          <div style="margin-top: 40px;">_________________________</div>
          <div>Signature & Date</div>
        </div>
        <div class="signature-box">
          <div><strong>GO 4 Farms & Cattle</strong></div>
          <div style="margin-top: 40px;">_________________________</div>
          <div>Authorized Signature & Date</div>
        </div>
      </div>

      <!-- INVOICE SECTION -->
      <div class="page-break"></div>
      
      <div class="header">
        <div class="company-info-section">
          <div class="company-name">GO 4 Farms & Cattle</div>
          <div class="company-info">
            1510 Crystal Valley Way<br>
            Melissa, TX 75454<br>
            Phone: 214-878-1230<br>
            Email: accounting@go4fc.com
          </div>
        </div>
      </div>

      <div class="section-title">INVOICE</div>

      <div class="details-section">
        <div>
          <div style="font-size: 24px; font-weight: bold; color: #333;">INVOICE ${invoice?.invoiceNumber || 'N/A'}</div>
          <div><strong>Load:</strong> ${load?.number_109 || load?.number109 || 'N/A'}</div>
          <div><strong>BOL:</strong> ${load?.bolNumber || '374'}</div>
          <div><strong>Trip:</strong> ${load?.tripNumber || generateTripNumber()}</div>
        </div>
        <div>
          <div><strong>Invoice Date:</strong> ${currentDate}</div>
          <div><strong>Status:</strong> ${invoice?.status || 'Pending'}</div>
          <div><strong>Generated:</strong> ${invoice?.generatedAt ? new Date(invoice.generatedAt).toLocaleDateString() : currentDate}</div>
        </div>
      </div>

      <table class="details-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Transportation Service - Load ${load?.number_109 || load?.number109 || 'N/A'}</td>
            <td>${load?.origin || 'N/A'}</td>
            <td>${load?.destination || 'N/A'}</td>
            <td>$${invoice?.flatRate || '0.00'}</td>
          </tr>
          ${invoice?.lumperCharge && parseFloat(invoice.lumperCharge) > 0 ? `
          <tr>
            <td>Lumper Service Charge</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.lumperCharge}</td>
          </tr>
          ` : ''}
          ${invoice?.extraStopsCharge && parseFloat(invoice.extraStopsCharge) > 0 ? `
          <tr>
            <td>Extra Stops (${invoice.extraStopsCount || 0} stops @ $50 each)</td>
            <td>-</td>
            <td>-</td>
            <td>$${invoice.extraStopsCharge}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="total-section">
        <div style="font-size: 20px; margin-bottom: 10px;">
          <strong>Total Amount Due: <span class="total-amount">$${invoice?.totalAmount || '0.00'}</span></strong>
        </div>
        <div style="font-size: 14px; color: #666;">
          Payment Terms: Net 30 Days
        </div>
      </div>

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>For questions about this invoice, please contact us at billing@go4farms.com or (555) 123-4567</p>
      </div>
    </body>
    </html>
  `;
}