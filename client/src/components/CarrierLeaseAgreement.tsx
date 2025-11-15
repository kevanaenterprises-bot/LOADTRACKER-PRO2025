import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Download } from "lucide-react";

interface LeaseAgreementData {
  operatorName: string;
  operatorAddress: string;
  operatorCity: string;
  operatorState: string;
  operatorZip: string;
  operatorPhone: string;
  operatorEmail: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleVin: string;
  truckNumber: string;
  startDate: string;
  compensationType: string;
  compensationRate: string;
  paymentTerms: string;
}

export function CarrierLeaseAgreement() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<LeaseAgreementData>({
    operatorName: "",
    operatorAddress: "",
    operatorCity: "",
    operatorState: "",
    operatorZip: "",
    operatorPhone: "",
    operatorEmail: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: "",
    vehicleVin: "",
    truckNumber: "",
    startDate: new Date().toISOString().split('T')[0],
    compensationType: "Percentage of Gross Revenue",
    compensationRate: "80%",
    paymentTerms: "Payment will be made within 14 days after receipt of all required delivery documents",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const generatePDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = generateLeaseHTML();
    printWindow.document.write(html);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const generateLeaseHTML = () => {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Owner-Operator Lease Agreement</title>
        <style>
          body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 0.5in;
            font-size: 11pt;
          }
          h1 {
            text-align: center;
            font-size: 16pt;
            margin-bottom: 20px;
            text-transform: uppercase;
          }
          h2 {
            font-size: 12pt;
            margin-top: 20px;
            margin-bottom: 10px;
            text-decoration: underline;
          }
          .section {
            margin-bottom: 15px;
            text-align: justify;
          }
          .signature-block {
            margin-top: 40px;
            page-break-inside: avoid;
          }
          .signature-line {
            border-bottom: 1px solid black;
            width: 300px;
            margin: 30px 0 5px 0;
          }
          .header-info {
            margin-bottom: 30px;
          }
          .bold {
            font-weight: bold;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
          }
          td {
            padding: 5px;
          }
          @media print {
            body {
              margin: 0;
              padding: 0.5in;
            }
          }
        </style>
      </head>
      <body>
        <div class="header-info">
          <h1>Owner-Operator Lease Agreement</h1>
          <p style="text-align: center;">
            <strong>GO 4 Farms & Cattle</strong><br>
            1915 Espinoza Dr, Carrollton, TX 75010-4002<br>
            Phone: (903) 803-7500<br>
            DOT #4358832 | MC #1705330
          </p>
        </div>

        <p><strong>EFFECTIVE DATE:</strong> ${formData.startDate || '[DATE]'}</p>

        <div class="section">
          <p>This Owner-Operator Lease Agreement ("Agreement") is entered into on ${formData.startDate || '[DATE]'} between:</p>
          
          <p><strong>CARRIER:</strong><br>
          GO 4 Farms & Cattle<br>
          1915 Espinoza Dr, Carrollton, TX 75010-4002<br>
          DOT #4358832, MC #1705330</p>

          <p><strong>OWNER-OPERATOR:</strong><br>
          ${formData.operatorName || '[OPERATOR NAME]'}<br>
          ${formData.operatorAddress || '[ADDRESS]'}<br>
          ${formData.operatorCity || '[CITY]'}, ${formData.operatorState || '[STATE]'} ${formData.operatorZip || '[ZIP]'}<br>
          Phone: ${formData.operatorPhone || '[PHONE]'}<br>
          Email: ${formData.operatorEmail || '[EMAIL]'}</p>
        </div>

        <div class="section">
          <h2>1. EQUIPMENT</h2>
          <p>Owner-Operator agrees to lease the following equipment to Carrier under the terms of this Agreement:</p>
          <table>
            <tr>
              <td><strong>Vehicle Make:</strong></td>
              <td>${formData.vehicleMake || '[MAKE]'}</td>
            </tr>
            <tr>
              <td><strong>Vehicle Model:</strong></td>
              <td>${formData.vehicleModel || '[MODEL]'}</td>
            </tr>
            <tr>
              <td><strong>Year:</strong></td>
              <td>${formData.vehicleYear || '[YEAR]'}</td>
            </tr>
            <tr>
              <td><strong>VIN:</strong></td>
              <td>${formData.vehicleVin || '[VIN]'}</td>
            </tr>
            <tr>
              <td><strong>Truck Number:</strong></td>
              <td>${formData.truckNumber || '[TRUCK #]'}</td>
            </tr>
          </table>
        </div>

        <div class="section">
          <h2>2. TERM AND TERMINATION</h2>
          <p>2.1 <strong>Term:</strong> This Agreement shall commence on ${formData.startDate || '[DATE]'} and continue until terminated by either party.</p>
          <p>2.2 <strong>Termination:</strong> Either party may terminate this Agreement with thirty (30) days written notice to the other party. Carrier may terminate this Agreement immediately for breach by Owner-Operator, including but not limited to: failure to maintain required insurance, violation of safety regulations, unauthorized use of equipment, or failure to maintain equipment in safe operating condition.</p>
        </div>

        <div class="section">
          <h2>3. EXCLUSIVE POSSESSION AND USE</h2>
          <p>3.1 During the term of this lease, Carrier shall have exclusive possession, control, and use of the equipment. The equipment shall display Carrier's name and MC number as required by federal regulations.</p>
          <p>3.2 A copy of this lease agreement must be maintained in the vehicle at all times during operation under Carrier's authority.</p>
        </div>

        <div class="section">
          <h2>4. OWNER-OPERATOR RESPONSIBILITIES</h2>
          <p>Owner-Operator agrees to:</p>
          <p>4.1 Maintain the equipment in good working condition, including all necessary repairs and preventive maintenance.</p>
          <p>4.2 Comply with all applicable federal, state, and local laws, regulations, and ordinances, including but not limited to FMCSA Hours of Service regulations, DOT safety regulations, and all motor carrier laws.</p>
          <p>4.3 Maintain current commercial driver's license (CDL) and medical certification as required by law.</p>
          <p>4.4 Maintain all required insurance coverage as outlined in Section 6.</p>
          <p>4.5 Complete and submit all required paperwork, logs, and documentation in a timely manner.</p>
          <p>4.6 Operate the equipment safely and professionally at all times.</p>
          <p>4.7 Bear all costs for fuel, tolls, permits, scales, and other operating expenses unless otherwise agreed in writing.</p>
        </div>

        <div class="section">
          <h2>5. CARRIER RESPONSIBILITIES</h2>
          <p>Carrier agrees to:</p>
          <p>5.1 Secure freight and loads for transportation.</p>
          <p>5.2 Provide dispatch services and support.</p>
          <p>5.3 Handle customer billing and collections.</p>
          <p>5.4 Provide authority for operation under Carrier's MC number.</p>
          <p>5.5 Maintain cargo insurance as required by law and customer contracts.</p>
          <p>5.6 Provide compensation as outlined in Section 7.</p>
        </div>

        <div class="section">
          <h2>6. INSURANCE</h2>
          <p>6.1 <strong>Owner-Operator Insurance:</strong> Owner-Operator shall maintain and provide proof of the following insurance coverage:</p>
          <p>&nbsp;&nbsp;&nbsp;• Auto Liability Insurance: Minimum $1,000,000 combined single limit</p>
          <p>&nbsp;&nbsp;&nbsp;• Physical Damage Insurance on leased equipment</p>
          <p>&nbsp;&nbsp;&nbsp;• Occupational Accident Insurance or Workers' Compensation</p>
          <p>6.2 <strong>Carrier Insurance:</strong> Carrier shall maintain cargo insurance and general liability insurance as required by law and customer requirements.</p>
          <p>6.3 Owner-Operator shall provide Carrier with certificates of insurance naming Carrier as additional insured before commencing operations under this Agreement.</p>
        </div>

        <div class="section">
          <h2>7. COMPENSATION</h2>
          <p>7.1 <strong>Payment Structure:</strong> ${formData.compensationType || '[COMPENSATION TYPE]'}</p>
          <p>7.2 <strong>Rate:</strong> ${formData.compensationRate || '[RATE]'}</p>
          <p>7.3 <strong>Payment Terms:</strong> ${formData.paymentTerms || '[PAYMENT TERMS]'}</p>
          <p>7.4 <strong>Deductions:</strong> Carrier may deduct from Owner-Operator's compensation: unauthorized advances, cargo claims resulting from Owner-Operator's negligence, fines or penalties resulting from Owner-Operator's violations, and any amounts owed to Carrier by Owner-Operator.</p>
          <p>7.5 All payments shall be made via direct deposit to Owner-Operator's designated bank account.</p>
        </div>

        <div class="section">
          <h2>8. INDEPENDENT CONTRACTOR STATUS</h2>
          <p>8.1 Owner-Operator is an independent contractor and not an employee of Carrier. Owner-Operator is responsible for all federal, state, and local taxes, including income tax, self-employment tax, and any other applicable taxes.</p>
          <p>8.2 Owner-Operator is not entitled to any employee benefits, including but not limited to health insurance, retirement benefits, paid time off, or workers' compensation (unless Owner-Operator obtains their own policy).</p>
          <p>8.3 Owner-Operator has the right to accept or refuse individual loads offered by Carrier.</p>
        </div>

        <div class="section">
          <h2>9. INDEMNIFICATION</h2>
          <p>9.1 Owner-Operator agrees to indemnify, defend, and hold harmless Carrier from any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorney fees) arising from Owner-Operator's operation of the equipment, breach of this Agreement, or violation of any law or regulation.</p>
          <p>9.2 Carrier agrees to indemnify, defend, and hold harmless Owner-Operator from claims arising from Carrier's negligence in securing freight or providing authority.</p>
        </div>

        <div class="section">
          <h2>10. COMPLIANCE WITH LAWS</h2>
          <p>Both parties agree to comply with all applicable federal, state, and local laws and regulations, including but not limited to:</p>
          <p>&nbsp;&nbsp;&nbsp;• Federal Motor Carrier Safety Regulations (49 CFR)</p>
          <p>&nbsp;&nbsp;&nbsp;• FMCSA lease and interchange regulations (49 CFR Part 376)</p>
          <p>&nbsp;&nbsp;&nbsp;• Hours of Service regulations (49 CFR Part 395)</p>
          <p>&nbsp;&nbsp;&nbsp;• Drug and alcohol testing requirements (49 CFR Part 382)</p>
          <p>&nbsp;&nbsp;&nbsp;• Vehicle inspection and maintenance requirements</p>
        </div>

        <div class="section">
          <h2>11. CONFIDENTIALITY</h2>
          <p>Owner-Operator agrees to maintain confidentiality of Carrier's business information, including but not limited to customer lists, pricing information, and business strategies. This obligation shall survive termination of this Agreement.</p>
        </div>

        <div class="section">
          <h2>12. DISPUTE RESOLUTION</h2>
          <p>Any disputes arising under this Agreement shall first be attempted to be resolved through good-faith negotiation. If negotiation fails, disputes shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.</p>
        </div>

        <div class="section">
          <h2>13. GOVERNING LAW</h2>
          <p>This Agreement shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of law provisions.</p>
        </div>

        <div class="section">
          <h2>14. ENTIRE AGREEMENT</h2>
          <p>This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, and agreements. This Agreement may only be modified by written amendment signed by both parties.</p>
        </div>

        <div class="section">
          <h2>15. SEVERABILITY</h2>
          <p>If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.</p>
        </div>

        <div class="signature-block">
          <p><strong>IN WITNESS WHEREOF</strong>, the parties have executed this Agreement as of the date first written above.</p>
          
          <table style="margin-top: 40px;">
            <tr>
              <td style="width: 50%;">
                <strong>CARRIER:</strong><br>
                GO 4 Farms & Cattle<br><br>
                <div class="signature-line"></div>
                Authorized Representative<br>
                Print Name: _______________________<br>
                Title: _____________________________<br>
                Date: ______________________________
              </td>
              <td style="width: 50%;">
                <strong>OWNER-OPERATOR:</strong><br>
                ${formData.operatorName || '[OPERATOR NAME]'}<br><br>
                <div class="signature-line"></div>
                Owner-Operator Signature<br>
                Print Name: _______________________<br>
                Date: ______________________________
              </td>
            </tr>
          </table>
        </div>
      </body>
      </html>
    `;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto" data-testid="button-lease-agreement">
          <FileText className="mr-2 h-4 w-4" />
          Generate Lease Agreement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Owner-Operator Lease Agreement Generator</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="operatorName">Operator Full Name *</Label>
                  <Input
                    id="operatorName"
                    name="operatorName"
                    value={formData.operatorName}
                    onChange={handleChange}
                    placeholder="John Smith"
                    data-testid="input-operator-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="operatorPhone">Phone Number *</Label>
                  <Input
                    id="operatorPhone"
                    name="operatorPhone"
                    value={formData.operatorPhone}
                    onChange={handleChange}
                    placeholder="(555) 123-4567"
                    data-testid="input-operator-phone"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="operatorEmail">Email Address *</Label>
                  <Input
                    id="operatorEmail"
                    name="operatorEmail"
                    type="email"
                    value={formData.operatorEmail}
                    onChange={handleChange}
                    placeholder="operator@example.com"
                    data-testid="input-operator-email"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="operatorAddress">Street Address *</Label>
                  <Input
                    id="operatorAddress"
                    name="operatorAddress"
                    value={formData.operatorAddress}
                    onChange={handleChange}
                    placeholder="123 Main Street"
                    data-testid="input-operator-address"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="operatorCity">City *</Label>
                  <Input
                    id="operatorCity"
                    name="operatorCity"
                    value={formData.operatorCity}
                    onChange={handleChange}
                    placeholder="Dallas"
                    data-testid="input-operator-city"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="operatorState">State *</Label>
                  <Input
                    id="operatorState"
                    name="operatorState"
                    value={formData.operatorState}
                    onChange={handleChange}
                    placeholder="TX"
                    maxLength={2}
                    data-testid="input-operator-state"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="operatorZip">ZIP Code *</Label>
                  <Input
                    id="operatorZip"
                    name="operatorZip"
                    value={formData.operatorZip}
                    onChange={handleChange}
                    placeholder="75001"
                    data-testid="input-operator-zip"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-4">Vehicle Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vehicleMake">Make *</Label>
                  <Input
                    id="vehicleMake"
                    name="vehicleMake"
                    value={formData.vehicleMake}
                    onChange={handleChange}
                    placeholder="Freightliner"
                    data-testid="input-vehicle-make"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicleModel">Model *</Label>
                  <Input
                    id="vehicleModel"
                    name="vehicleModel"
                    value={formData.vehicleModel}
                    onChange={handleChange}
                    placeholder="Cascadia"
                    data-testid="input-vehicle-model"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicleYear">Year *</Label>
                  <Input
                    id="vehicleYear"
                    name="vehicleYear"
                    value={formData.vehicleYear}
                    onChange={handleChange}
                    placeholder="2020"
                    data-testid="input-vehicle-year"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="truckNumber">Truck Number</Label>
                  <Input
                    id="truckNumber"
                    name="truckNumber"
                    value={formData.truckNumber}
                    onChange={handleChange}
                    placeholder="T-101"
                    data-testid="input-truck-number"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="vehicleVin">VIN *</Label>
                  <Input
                    id="vehicleVin"
                    name="vehicleVin"
                    value={formData.vehicleVin}
                    onChange={handleChange}
                    placeholder="1FUJGLDR12LM12345"
                    data-testid="input-vehicle-vin"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-4">Agreement Terms</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    name="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={handleChange}
                    data-testid="input-start-date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="compensationType">Compensation Type *</Label>
                  <Input
                    id="compensationType"
                    name="compensationType"
                    value={formData.compensationType}
                    onChange={handleChange}
                    placeholder="Percentage of Gross Revenue"
                    data-testid="input-compensation-type"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="compensationRate">Rate *</Label>
                  <Input
                    id="compensationRate"
                    name="compensationRate"
                    value={formData.compensationRate}
                    onChange={handleChange}
                    placeholder="80%"
                    data-testid="input-compensation-rate"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="paymentTerms">Payment Terms</Label>
                  <Textarea
                    id="paymentTerms"
                    name="paymentTerms"
                    value={formData.paymentTerms}
                    onChange={handleChange}
                    rows={3}
                    data-testid="input-payment-terms"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-lease">
              Cancel
            </Button>
            <Button onClick={generatePDF} data-testid="button-generate-lease-pdf">
              <Download className="mr-2 h-4 w-4" />
              Generate PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
