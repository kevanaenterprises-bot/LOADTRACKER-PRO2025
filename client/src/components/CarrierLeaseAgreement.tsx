import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import html2pdf from "html2pdf.js";

const leaseAgreementSchema = z.object({
  operatorName: z.string().min(1, "Operator name is required"),
  operatorAddress: z.string().min(1, "Address is required"),
  operatorCity: z.string().min(1, "City is required"),
  operatorState: z.string().min(2, "State is required").max(2, "Use 2-letter state code").regex(/^[A-Z]{2}$/, "State must be 2 uppercase letters"),
  operatorZip: z.string().regex(/^\d{5}(-\d{4})?$/, "ZIP must be 5 digits or 5+4 format"),
  operatorPhone: z.string().regex(/^[\d\s\-\(\)]+$/, "Phone must contain only digits and formatting characters").min(10, "Phone number must be at least 10 digits"),
  operatorEmail: z.string().email("Valid email is required"),
  vehicleMake: z.string().min(1, "Vehicle make is required"),
  vehicleModel: z.string().min(1, "Vehicle model is required"),
  vehicleYear: z.string().regex(/^\d{4}$/, "Year must be 4 digits"),
  vehicleVin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN must be 17 alphanumeric characters (no I, O, Q)").length(17, "VIN must be exactly 17 characters"),
  truckNumber: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  compensationType: z.string().min(1, "Compensation type is required"),
  compensationRate: z.string().min(1, "Compensation rate is required"),
  paymentTerms: z.string().min(1, "Payment terms are required"),
});

type LeaseAgreementData = z.infer<typeof leaseAgreementSchema>;

export function CarrierLeaseAgreement() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const form = useForm<LeaseAgreementData>({
    resolver: zodResolver(leaseAgreementSchema),
    defaultValues: {
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
    },
  });

  const generatePDF = async (data: LeaseAgreementData) => {
    setIsGenerating(true);
    let element: HTMLElement | null = null;
    
    try {
      const htmlContent = generateLeaseHTML(data);
      
      // Create a temporary element to render the HTML
      element = document.createElement('div');
      element.innerHTML = htmlContent;
      element.style.position = 'absolute';
      element.style.left = '-9999px';
      document.body.appendChild(element);

      const opt = {
        margin: [0.5, 0.5, 0.5, 0.5] as [number, number, number, number],
        filename: `Carrier_Lease_Agreement_${data.operatorName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(element).save();
      
      toast({
        title: "PDF Generated",
        description: "Lease agreement downloaded successfully",
      });
      
      setOpen(false);
      form.reset();
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      // Always clean up the temporary element
      if (element && document.body.contains(element)) {
        document.body.removeChild(element);
      }
      setIsGenerating(false);
    }
  };

  const generateLeaseHTML = (data: LeaseAgreementData) => {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    return `
      <div style="font-family: 'Times New Roman', serif; line-height: 1.6; max-width: 8.5in; margin: 0 auto; padding: 0.5in; font-size: 11pt;">
        <div style="margin-bottom: 30px;">
          <h1 style="text-align: center; font-size: 16pt; margin-bottom: 20px; text-transform: uppercase;">Owner-Operator Lease Agreement</h1>
          <p style="text-align: center;">
            <strong>GO 4 Farms & Cattle</strong><br>
            1915 Espinoza Dr, Carrollton, TX 75010-4002<br>
            Phone: (903) 803-7500<br>
            DOT #4358832 | MC #1705330
          </p>
        </div>

        <p><strong>EFFECTIVE DATE:</strong> ${data.startDate}</p>

        <div style="margin-bottom: 15px; text-align: justify;">
          <p>This Owner-Operator Lease Agreement ("Agreement") is entered into on ${data.startDate} between:</p>
          
          <p><strong>CARRIER:</strong><br>
          GO 4 Farms & Cattle<br>
          1915 Espinoza Dr, Carrollton, TX 75010-4002<br>
          DOT #4358832, MC #1705330</p>

          <p><strong>OWNER-OPERATOR:</strong><br>
          ${data.operatorName}<br>
          ${data.operatorAddress}<br>
          ${data.operatorCity}, ${data.operatorState} ${data.operatorZip}<br>
          Phone: ${data.operatorPhone}<br>
          Email: ${data.operatorEmail}</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">1. EQUIPMENT</h2>
          <p>Owner-Operator agrees to lease the following equipment to Carrier under the terms of this Agreement:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
            <tr><td style="padding: 5px;"><strong>Vehicle Make:</strong></td><td style="padding: 5px;">${data.vehicleMake}</td></tr>
            <tr><td style="padding: 5px;"><strong>Vehicle Model:</strong></td><td style="padding: 5px;">${data.vehicleModel}</td></tr>
            <tr><td style="padding: 5px;"><strong>Year:</strong></td><td style="padding: 5px;">${data.vehicleYear}</td></tr>
            <tr><td style="padding: 5px;"><strong>VIN:</strong></td><td style="padding: 5px;">${data.vehicleVin}</td></tr>
            ${data.truckNumber ? `<tr><td style="padding: 5px;"><strong>Truck Number:</strong></td><td style="padding: 5px;">${data.truckNumber}</td></tr>` : ''}
          </table>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">2. TERM AND TERMINATION</h2>
          <p>2.1 <strong>Term:</strong> This Agreement shall commence on ${data.startDate} and continue until terminated by either party.</p>
          <p>2.2 <strong>Termination:</strong> Either party may terminate this Agreement with thirty (30) days written notice to the other party. Carrier may terminate this Agreement immediately for breach by Owner-Operator, including but not limited to: failure to maintain required insurance, violation of safety regulations, unauthorized use of equipment, or failure to maintain equipment in safe operating condition.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">3. EXCLUSIVE POSSESSION AND USE</h2>
          <p>3.1 During the term of this lease, Carrier shall have exclusive possession, control, and use of the equipment. The equipment shall display Carrier's name and MC number as required by federal regulations.</p>
          <p>3.2 A copy of this lease agreement must be maintained in the vehicle at all times during operation under Carrier's authority.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">4. OWNER-OPERATOR RESPONSIBILITIES</h2>
          <p>Owner-Operator agrees to:</p>
          <p>4.1 Maintain the equipment in good working condition, including all necessary repairs and preventive maintenance.</p>
          <p>4.2 Comply with all applicable federal, state, and local laws, regulations, and ordinances, including but not limited to FMCSA Hours of Service regulations, DOT safety regulations, and all motor carrier laws.</p>
          <p>4.3 Maintain current commercial driver's license (CDL) and medical certification as required by law.</p>
          <p>4.4 Maintain all required insurance coverage as outlined in Section 6.</p>
          <p>4.5 Complete and submit all required paperwork, logs, and documentation in a timely manner.</p>
          <p>4.6 Operate the equipment safely and professionally at all times.</p>
          <p>4.7 Bear all costs for fuel, tolls, permits, scales, and other operating expenses unless otherwise agreed in writing.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">5. CARRIER RESPONSIBILITIES</h2>
          <p>Carrier agrees to:</p>
          <p>5.1 Secure freight and loads for transportation.</p>
          <p>5.2 Provide dispatch services and support.</p>
          <p>5.3 Handle customer billing and collections.</p>
          <p>5.4 Provide authority for operation under Carrier's MC number.</p>
          <p>5.5 Maintain cargo insurance as required by law and customer contracts.</p>
          <p>5.6 Provide compensation as outlined in Section 7.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">6. INSURANCE</h2>
          <p>6.1 <strong>Owner-Operator Insurance:</strong> Owner-Operator shall maintain and provide proof of the following insurance coverage:</p>
          <p>&nbsp;&nbsp;&nbsp;• Auto Liability Insurance: Minimum $1,000,000 combined single limit</p>
          <p>&nbsp;&nbsp;&nbsp;• Physical Damage Insurance on leased equipment</p>
          <p>&nbsp;&nbsp;&nbsp;• Occupational Accident Insurance or Workers' Compensation</p>
          <p>6.2 <strong>Carrier Insurance:</strong> Carrier shall maintain cargo insurance and general liability insurance as required by law and customer requirements.</p>
          <p>6.3 Owner-Operator shall provide Carrier with certificates of insurance naming Carrier as additional insured before commencing operations under this Agreement.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">7. COMPENSATION</h2>
          <p>7.1 <strong>Payment Structure:</strong> ${data.compensationType}</p>
          <p>7.2 <strong>Rate:</strong> ${data.compensationRate}</p>
          <p>7.3 <strong>Payment Terms:</strong> ${data.paymentTerms}</p>
          <p>7.4 <strong>Deductions:</strong> Carrier may deduct from Owner-Operator's compensation: unauthorized advances, cargo claims resulting from Owner-Operator's negligence, fines or penalties resulting from Owner-Operator's violations, and any amounts owed to Carrier by Owner-Operator.</p>
          <p>7.5 All payments shall be made via direct deposit to Owner-Operator's designated bank account.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">8. INDEPENDENT CONTRACTOR STATUS</h2>
          <p>8.1 Owner-Operator is an independent contractor and not an employee of Carrier. Owner-Operator is responsible for all federal, state, and local taxes, including income tax, self-employment tax, and any other applicable taxes.</p>
          <p>8.2 Owner-Operator is not entitled to any employee benefits, including but not limited to health insurance, retirement benefits, paid time off, or workers' compensation (unless Owner-Operator obtains their own policy).</p>
          <p>8.3 Owner-Operator has the right to accept or refuse individual loads offered by Carrier.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">9. INDEMNIFICATION</h2>
          <p>9.1 Owner-Operator agrees to indemnify, defend, and hold harmless Carrier from any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorney fees) arising from Owner-Operator's operation of the equipment, breach of this Agreement, or violation of any law or regulation.</p>
          <p>9.2 Carrier agrees to indemnify, defend, and hold harmless Owner-Operator from claims arising from Carrier's negligence in securing freight or providing authority.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">10. COMPLIANCE WITH LAWS</h2>
          <p>Both parties agree to comply with all applicable federal, state, and local laws and regulations, including but not limited to:</p>
          <p>&nbsp;&nbsp;&nbsp;• Federal Motor Carrier Safety Regulations (49 CFR)</p>
          <p>&nbsp;&nbsp;&nbsp;• FMCSA lease and interchange regulations (49 CFR Part 376)</p>
          <p>&nbsp;&nbsp;&nbsp;• Hours of Service regulations (49 CFR Part 395)</p>
          <p>&nbsp;&nbsp;&nbsp;• Drug and alcohol testing requirements (49 CFR Part 382)</p>
          <p>&nbsp;&nbsp;&nbsp;• Vehicle inspection and maintenance requirements</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">11. CONFIDENTIALITY</h2>
          <p>Owner-Operator agrees to maintain confidentiality of Carrier's business information, including but not limited to customer lists, pricing information, and business strategies. This obligation shall survive termination of this Agreement.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">12. DISPUTE RESOLUTION</h2>
          <p>Any disputes arising under this Agreement shall first be attempted to be resolved through good-faith negotiation. If negotiation fails, disputes shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">13. GOVERNING LAW</h2>
          <p>This Agreement shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of law provisions.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">14. ENTIRE AGREEMENT</h2>
          <p>This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, and agreements. This Agreement may only be modified by written amendment signed by both parties.</p>
        </div>

        <div style="margin-bottom: 15px; text-align: justify;">
          <h2 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px; text-decoration: underline;">15. SEVERABILITY</h2>
          <p>If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.</p>
        </div>

        <div style="margin-top: 40px; page-break-inside: avoid;">
          <p><strong>IN WITNESS WHEREOF</strong>, the parties have executed this Agreement as of the date first written above.</p>
          
          <table style="margin-top: 40px; width: 100%;">
            <tr>
              <td style="width: 50%; vertical-align: top;">
                <strong>CARRIER:</strong><br>
                GO 4 Farms & Cattle<br><br>
                <div style="border-bottom: 1px solid black; width: 90%; margin: 30px 0 5px 0;"></div>
                Authorized Representative<br>
                Print Name: _______________________<br>
                Title: _____________________________<br>
                Date: ______________________________
              </td>
              <td style="width: 50%; vertical-align: top;">
                <strong>OWNER-OPERATOR:</strong><br>
                ${data.operatorName}<br><br>
                <div style="border-bottom: 1px solid black; width: 90%; margin: 30px 0 5px 0;"></div>
                Owner-Operator Signature<br>
                Print Name: _______________________<br>
                Date: ______________________________
              </td>
            </tr>
          </table>
        </div>
      </div>
    `;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="w-full sm:w-auto" 
          data-testid="button-generate-lease-agreement"
        >
          <FileText className="mr-2 h-4 w-4" />
          Generate Lease Agreement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Owner-Operator Lease Agreement Generator</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Create FMCSA-compliant lease agreement for GO 4 Farms & Cattle
          </p>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(generatePDF)} className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 text-lg">Operator Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="operatorName"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Operator Full Name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="John Smith" data-testid="input-operator-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="operatorPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="(555) 123-4567" data-testid="input-operator-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="operatorEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address *</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="operator@example.com" data-testid="input-operator-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="operatorAddress"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Street Address *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="123 Main Street" data-testid="input-operator-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="operatorCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Dallas" data-testid="input-operator-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="operatorState"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="TX" maxLength={2} data-testid="input-operator-state" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="operatorZip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP Code *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="75001" data-testid="input-operator-zip" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 text-lg">Vehicle Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="vehicleMake"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Make *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Freightliner" data-testid="input-vehicle-make" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vehicleModel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Cascadia" data-testid="input-vehicle-model" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vehicleYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Year *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="2020" data-testid="input-vehicle-year" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="truckNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Truck Number (Optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="T-101" data-testid="input-truck-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vehicleVin"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>VIN (17 characters) *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="1FUJGLDR12LM12345" maxLength={17} data-testid="input-vehicle-vin" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 text-lg">Agreement Terms</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date *</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" data-testid="input-start-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="compensationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Compensation Type *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Percentage of Gross Revenue" data-testid="input-compensation-type" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="compensationRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rate *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="80%" data-testid="input-compensation-rate" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="paymentTerms"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Payment Terms *</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} data-testid="input-payment-terms" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                disabled={isGenerating}
                data-testid="button-cancel-lease"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isGenerating}
                data-testid="button-download-lease-pdf"
              >
                <Download className="mr-2 h-4 w-4" />
                {isGenerating ? "Generating PDF..." : "Download PDF"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
