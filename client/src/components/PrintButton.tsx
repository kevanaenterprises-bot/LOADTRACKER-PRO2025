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
      // Check if BOL document exists as attachment
      if (load?.bolDocumentPath) {
        // If BOL document exists, open it for printing
        const bolUrl = `/objects/${load.bolDocumentPath}`;
        const printWindow = window.open(bolUrl, '_blank');
        if (!printWindow) {
          throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
        }
        
        // Wait for document to load then trigger print
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 1000); // Give it time to load
        };
        
        toast({
          title: "BOL Document Opened",
          description: "BOL document attachment has been opened for printing.",
        });
      } else {
        // If no document attachment, print BOL form template
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
          title: "BOL Template Sent to Printer",
          description: "Bill of Lading template has been prepared for printing.",
        });
      }
      
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

  const handlePrintRateConAndInvoice = async () => {
    setIsPrinting(true);
    try {
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
      }

      // Generate combined rate confirmation and invoice HTML
      const combinedHTML = generateCombinedRateConInvoiceHTML(invoice, load);
      
      printWindow.document.write(combinedHTML);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };

      // Mark invoice as printed if available
      if (invoiceId) {
        await fetch(`/api/invoices/${invoiceId}/mark-printed`, {
          method: 'PATCH',
          credentials: 'include'
        });
      }

      toast({
        title: "Rate Con & Invoice Sent to Printer",
        description: "Rate confirmation and invoice have been prepared for printing.",
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
          {invoice && load && (
            <Card className="cursor-pointer hover:bg-gray-50 border-2 border-blue-200 bg-blue-50" onClick={handlePrintRateConAndInvoice}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center">
                  <Printer className="h-4 w-4 mr-2 text-blue-700" />
                  Rate Confirmation & Invoice Combined
                  <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded font-semibold">
                    RECOMMENDED
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-gray-700 font-medium">
                  Load {load.number_109 || load.number109} • Invoice {invoice.invoiceNumber} • ${invoice.totalAmount}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Print rate confirmation and invoice together - Perfect for customer records
                </p>
              </CardContent>
            </Card>
          )}

          {invoice && (
            <Card className="cursor-pointer hover:bg-gray-50" onClick={handlePrintInvoice}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center">
                  <FileText className="h-4 w-4 mr-2 text-blue-600" />
                  Invoice Only ({invoice.invoiceNumber})
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
                    Load: {load.number_109 || load.number109} • Destination: {load.destination}
                  </p>
                </CardContent>
              </Card>
              
              <Card className="cursor-pointer hover:bg-gray-50" onClick={handlePrintBOL}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-orange-600" />
                    Bill of Lading (BOL)
                    {load.bolDocumentPath && (
                      <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                        Document Attached
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-600">
                    Load: {load.number_109 || load.number109} • Origin: {load.origin}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {load.bolDocumentPath ? 
                      "Will print attached BOL document" : 
                      "Will print BOL template form"
                    }
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
          <div class="company-name">🐄 GO 4 Farms & Cattle 🌾</div>
          <div class="company-info">
            Melissa, Texas 75454<br>
            Phone: (555) 123-4567 • Email: billing@go4farms.com<br>
            Federal Tax ID: 12-3456789
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
  // Generate a 4-digit trip number based on current timestamp
  return String(Date.now()).slice(-4);
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
        <p><strong>Load Number:</strong> ${load?.number_109 || load?.number109 || 'N/A'}</p>
        <p><strong>BOL Number:</strong> ${load?.bolNumber || '374'}</p>
        <p><strong>Trip Number:</strong> ${load?.tripNumber || generateTripNumber()}</p>
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
          <td>${load?.number_109 || load?.number109 || 'N/A'}</td>
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

function generateCombinedRateConInvoiceHTML(invoice: any, load: any): string {
  const currentDate = new Date().toLocaleDateString();
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Rate Confirmation & Invoice - ${load?.number_109 || load?.number109 || 'N/A'}</title>
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
          border-bottom: 3px solid #2d5aa0;
          padding-bottom: 20px;
          margin-bottom: 30px;
          gap: 20px;
        }
        .company-info-section {
          text-align: center;
        }
        .company-name {
          font-size: 32px;
          font-weight: bold;
          color: #2d5aa0;
          margin-bottom: 5px;
        }
        .company-info {
          font-size: 14px;
          color: #666;
        }
        .section-header {
          background-color: #2d5aa0;
          color: white;
          padding: 15px;
          text-align: center;
          font-size: 22px;
          font-weight: bold;
          margin: 30px 0 20px 0;
        }
        .load-details {
          background-color: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
          border-left: 5px solid #2d5aa0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          padding: 8px 0;
          border-bottom: 1px solid #e9ecef;
        }
        .detail-label {
          font-weight: bold;
          color: #495057;
          min-width: 150px;
        }
        .detail-value {
          color: #212529;
        }
        .rate-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          border: 1px solid #dee2e6;
        }
        .rate-table th,
        .rate-table td {
          border: 1px solid #dee2e6;
          padding: 15px;
          text-align: left;
        }
        .rate-table th {
          background-color: #e9ecef;
          font-weight: bold;
          color: #495057;
        }
        .rate-table .amount {
          text-align: right;
          font-weight: bold;
          color: #28a745;
        }
        .invoice-section {
          margin-top: 40px;
          border-top: 2px solid #2d5aa0;
          padding-top: 30px;
        }
        .invoice-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          background-color: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
        }
        .invoice-number {
          font-size: 24px;
          font-weight: bold;
          color: #2d5aa0;
        }
        .total-section {
          background-color: #2d5aa0;
          color: white;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          margin: 20px 0;
        }
        .total-amount {
          font-size: 28px;
          font-weight: bold;
        }
        .signature-section {
          margin-top: 50px;
          display: flex;
          justify-content: space-between;
          gap: 30px;
        }
        .signature-box {
          border: 2px solid #dee2e6;
          padding: 20px;
          border-radius: 8px;
          width: 45%;
          height: 120px;
          background-color: #f8f9fa;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #dee2e6;
          text-align: center;
          font-size: 12px;
          color: #6c757d;
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="header">
        <div class="company-info-section">
          <div class="company-name">🐄 GO 4 Farms & Cattle 🌾</div>
          <div class="company-info">
            Melissa, Texas 75454<br>
            Phone: (555) 123-4567 • Email: billing@go4farms.com<br>
            Federal Tax ID: 12-3456789
          </div>
        </div>
      </div>

      <!-- Rate Confirmation Section -->
      <div class="section-header">RATE CONFIRMATION</div>
      
      <div class="load-details">
        <div class="detail-row">
          <span class="detail-label">Load Number:</span>
          <span class="detail-value">${load?.number_109 || load?.number109 || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">BOL Number:</span>
          <span class="detail-value">${load?.bolNumber || '374'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Trip Number:</span>
          <span class="detail-value">${load?.tripNumber || generateTripNumber()}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Pickup Location:</span>
          <span class="detail-value">${load?.origin || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Delivery Location:</span>
          <span class="detail-value">${load?.destination || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Driver:</span>
          <span class="detail-value">${load?.driver?.firstName ? `${load.driver.firstName} ${load.driver.lastName}` : load?.driverId || 'TBD'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Estimated Miles:</span>
          <span class="detail-value">${load?.estimatedMiles || 'TBD'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status:</span>
          <span class="detail-value">${load?.status || 'Created'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date Created:</span>
          <span class="detail-value">${load?.createdAt ? new Date(load.createdAt).toLocaleDateString() : currentDate}</span>
        </div>
        ${load?.specialInstructions ? `
        <div class="detail-row">
          <span class="detail-label">Special Instructions:</span>
          <span class="detail-value">${load.specialInstructions}</span>
        </div>
        ` : ''}
      </div>

      <table class="rate-table">
        <thead>
          <tr>
            <th>Service Description</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Transportation Service</td>
            <td class="amount">$${invoice?.flatRate || '0.00'}</td>
          </tr>
          ${invoice?.lumperCharge && parseFloat(invoice.lumperCharge) > 0 ? `
          <tr>
            <td>Lumper Service Charge</td>
            <td class="amount">$${invoice.lumperCharge}</td>
          </tr>
          ` : ''}
          ${invoice?.extraStopsCharge && parseFloat(invoice.extraStopsCharge) > 0 ? `
          <tr>
            <td>Extra Stops (${invoice.extraStopsCount || 0} stops @ $50 each)</td>
            <td class="amount">$${invoice.extraStopsCharge}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <div class="total-section">
        <div style="font-size: 18px; margin-bottom: 10px;">AGREED TOTAL RATE</div>
        <div class="total-amount">$${invoice?.totalAmount || '0.00'}</div>
        <div style="font-size: 14px; margin-top: 10px;">Payment Terms: Net 30 Days</div>
      </div>

      <!-- Invoice Section -->
      <div class="invoice-section">
        <div class="section-header">INVOICE</div>
        
        <div class="invoice-details">
          <div>
            <div class="invoice-number">INVOICE ${invoice?.invoiceNumber || 'N/A'}</div>
            <div>Invoice Date: ${invoice?.generatedAt ? new Date(invoice.generatedAt).toLocaleDateString() : currentDate}</div>
            <div>Load: ${load?.number_109 || load?.number109 || 'N/A'}</div>
            <div>BOL: ${load?.bolNumber || '374'}</div>
          </div>
          <div>
            <div><strong>Status:</strong> ${invoice?.status || 'Pending'}</div>
            <div><strong>Due Date:</strong> ${invoice?.generatedAt ? 
              new Date(new Date(invoice.generatedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString() : 
              new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()
            }</div>
          </div>
        </div>

        <table class="rate-table">
          <thead>
            <tr>
              <th>Service Description</th>
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
              <td class="amount">$${invoice?.flatRate || '0.00'}</td>
            </tr>
            ${invoice?.lumperCharge && parseFloat(invoice.lumperCharge) > 0 ? `
            <tr>
              <td>Lumper Service Charge</td>
              <td>-</td>
              <td>-</td>
              <td class="amount">$${invoice.lumperCharge}</td>
            </tr>
            ` : ''}
            ${invoice?.extraStopsCharge && parseFloat(invoice.extraStopsCharge) > 0 ? `
            <tr>
              <td>Extra Stops (${invoice.extraStopsCount || 0} stops @ $50 each)</td>
              <td>-</td>
              <td>-</td>
              <td class="amount">$${invoice.extraStopsCharge}</td>
            </tr>
            ` : ''}
          </tbody>
        </table>

        <div class="total-section">
          <div style="font-size: 18px; margin-bottom: 10px;">TOTAL AMOUNT DUE</div>
          <div class="total-amount">$${invoice?.totalAmount || '0.00'}</div>
          <div style="font-size: 14px; margin-top: 10px;">Payment Terms: Net 30 Days</div>
        </div>
      </div>

      <!-- Signature Section -->
      <div class="signature-section">
        <div class="signature-box">
          <strong>Customer Acceptance</strong><br><br>
          <div style="border-bottom: 2px solid #333; margin: 15px 0;"></div>
          Print Name: ________________________<br>
          Date: ____________________________
        </div>
        <div class="signature-box">
          <strong>GO 4 Farms & Cattle</strong><br><br>
          <div style="border-bottom: 2px solid #333; margin: 15px 0;"></div>
          Authorized Signature<br>
          Date: ____________________________
        </div>
      </div>

      <div class="footer">
        <p><strong>Thank you for your business!</strong></p>
        <p>For questions about this rate confirmation or invoice, please contact us at billing@go4farms.com or (555) 123-4567</p>
        <p>This document serves as both rate confirmation and invoice for the transportation services described above.</p>
      </div>
    </body>
    </html>
  `;
}