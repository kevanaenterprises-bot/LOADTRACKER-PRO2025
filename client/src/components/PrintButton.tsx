import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Printer, FileText, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  const handlePrintInvoice = async () => {
    setIsPrinting(true);
    try {
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
      }

      // Generate invoice HTML
      const invoiceHTML = generateInvoiceHTML(invoice, load);
      
      printWindow.document.write(invoiceHTML);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };

      // Mark invoice as printed
      if (invoiceId) {
        await fetch(`/api/invoices/${invoiceId}/mark-printed`, {
          method: 'PATCH',
          credentials: 'include'
        });
      }

      toast({
        title: "Invoice Sent to Printer",
        description: "Invoice has been prepared for printing and marked as printed.",
      });
      
    } catch (error: any) {
      toast({
        title: "Print Failed",
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
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
      }

      const podHTML = generatePODHTML(load);
      
      printWindow.document.write(podHTML);
      printWindow.document.close();
      
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };

      toast({
        title: "POD Sent to Printer",
        description: "Proof of Delivery document has been prepared for printing.",
      });
      
    } catch (error: any) {
      toast({
        title: "Print Failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setIsPrinting(false);
    setPrintDialogOpen(false);
  };

  const handlePrintBOL = async () => {
    setIsPrinting(true);
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
      }

      const bolHTML = generateBOLHTML(load);
      
      printWindow.document.write(bolHTML);
      printWindow.document.close();
      
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };

      toast({
        title: "BOL Sent to Printer",
        description: "Bill of Lading has been prepared for printing.",
      });
      
    } catch (error: any) {
      toast({
        title: "Print Failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setIsPrinting(false);
    setPrintDialogOpen(false);
  };

  return (
    <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} disabled={isPrinting}>
          <Printer className="h-4 w-4 mr-2" />
          {isPrinting ? "Printing..." : "Print"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print Documents</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {invoice && (
            <Card className="cursor-pointer hover:bg-gray-50" onClick={handlePrintInvoice}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center">
                  <FileText className="h-4 w-4 mr-2 text-blue-600" />
                  Invoice {invoice.invoiceNumber}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-gray-600">
                  Amount: ${invoice.totalAmount} • Status: {invoice.status}
                </p>
              </CardContent>
            </Card>
          )}
          
          {load && (
            <>
              <Card className="cursor-pointer hover:bg-gray-50" onClick={handlePrintPOD}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center">
                    <Package className="h-4 w-4 mr-2 text-green-600" />
                    Proof of Delivery (POD)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-600">
                    Load: {load.number_109} • Destination: {load.destination}
                  </p>
                </CardContent>
              </Card>
              
              <Card className="cursor-pointer hover:bg-gray-50" onClick={handlePrintBOL}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-orange-600" />
                    Bill of Lading (BOL)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-600">
                    Load: {load.number_109} • Origin: {load.origin}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function generateInvoiceHTML(invoice: any, load: any): string {
  const currentDate = new Date().toLocaleDateString();
  
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
        <div class="company-name">GO 4 Farms & Cattle</div>
        <div class="company-info">
          123 Farm Road, Agriculture City, TX 75001<br>
          Phone: (555) 123-4567 • Email: billing@go4farms.com<br>
          Federal Tax ID: 12-3456789
        </div>
      </div>

      <div class="invoice-details">
        <div>
          <div class="invoice-number">INVOICE ${invoice?.invoiceNumber || 'N/A'}</div>
          <div>Date: ${currentDate}</div>
          <div>Load: ${load?.number_109 || 'N/A'}</div>
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
            <td>Transportation Service - Load ${load?.number_109 || 'N/A'}</td>
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

function generatePODHTML(load: any): string {
  const currentDate = new Date().toLocaleDateString();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Proof of Delivery - ${load?.number_109 || 'N/A'}</title>
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
        .pod-title {
          font-size: 24px;
          font-weight: bold;
          color: #333;
        }
        .load-info {
          background-color: #f5f5f5;
          padding: 15px;
          border-radius: 5px;
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
          height: 100px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div style="font-size: 28px; font-weight: bold; color: #2d5aa0;">GO 4 Farms & Cattle</div>
        <div class="pod-title">PROOF OF DELIVERY</div>
      </div>

      <div class="load-info">
        <h3>Load Information</h3>
        <p><strong>Load Number:</strong> ${load?.number_109 || 'N/A'}</p>
        <p><strong>Origin:</strong> ${load?.origin || 'N/A'}</p>
        <p><strong>Destination:</strong> ${load?.destination || 'N/A'}</p>
        <p><strong>Driver:</strong> ${load?.driverId || 'N/A'}</p>
        <p><strong>Delivery Date:</strong> ${currentDate}</p>
      </div>

      <div style="margin: 30px 0;">
        <h3>Delivery Confirmation</h3>
        <p>I acknowledge receipt of the goods described above in good condition.</p>
      </div>

      <div class="signature-section">
        <div class="signature-box">
          <strong>Receiver Signature</strong><br><br>
          <div style="border-bottom: 1px solid #333; margin: 20px 0;"></div>
          Print Name: ________________________<br>
          Date: ____________________________
        </div>
        <div class="signature-box">
          <strong>Driver Signature</strong><br><br>
          <div style="border-bottom: 1px solid #333; margin: 20px 0;"></div>
          Print Name: ________________________<br>
          Date: ____________________________
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
      <title>Bill of Lading - ${load?.number_109 || 'N/A'}</title>
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
        .bol-title {
          font-size: 24px;
          font-weight: bold;
          color: #333;
        }
        .bol-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .bol-table th,
        .bol-table td {
          border: 1px solid #333;
          padding: 8px;
          text-align: left;
        }
        .bol-table th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div style="font-size: 28px; font-weight: bold; color: #2d5aa0;">GO 4 Farms & Cattle</div>
        <div class="bol-title">BILL OF LADING</div>
      </div>

      <table class="bol-table">
        <tr>
          <th>Load Number</th>
          <td>${load?.number_109 || 'N/A'}</td>
          <th>Date</th>
          <td>${currentDate}</td>
        </tr>
        <tr>
          <th>Shipper</th>
          <td>${load?.origin || 'N/A'}</td>
          <th>Consignee</th>
          <td>${load?.destination || 'N/A'}</td>
        </tr>
        <tr>
          <th>Driver</th>
          <td>${load?.driverId || 'N/A'}</td>
          <th>Status</th>
          <td>${load?.status || 'N/A'}</td>
        </tr>
      </table>

      <div style="margin: 30px 0;">
        <h3>Freight Description</h3>
        <p><strong>Commodity:</strong> Agricultural Products</p>
        <p><strong>Weight:</strong> _______________ lbs</p>
        <p><strong>Pieces:</strong> _______________</p>
        <p><strong>Special Instructions:</strong> ${load?.specialInstructions || 'None'}</p>
      </div>

      <div style="margin-top: 50px;">
        <h3>Signatures</h3>
        <div style="display: flex; justify-content: space-between;">
          <div style="width: 45%;">
            <strong>Shipper</strong><br><br>
            Signature: ________________________<br>
            Date: ____________________________
          </div>
          <div style="width: 45%;">
            <strong>Driver</strong><br><br>
            Signature: ________________________<br>
            Date: ____________________________
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}