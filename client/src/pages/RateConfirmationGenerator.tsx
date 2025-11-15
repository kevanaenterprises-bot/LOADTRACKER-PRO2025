import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, X, Download, Mail } from "lucide-react";
import { useMainAuth } from "@/hooks/useMainAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { rateConfirmationRequestSchema, type RateConfirmationRequest, type Location, type Carrier } from "@shared/schema";
import { cn } from "@/lib/utils";

export default function RateConfirmationGenerator() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, authType } = useMainAuth();
  const [, setLocation] = useLocation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please log in to access rate confirmations",
        variant: "destructive",
      });
      setLocation("/admin-login");
    }
  }, [isAuthenticated, isLoading, toast, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const form = useForm<RateConfirmationRequest>({
    resolver: zodResolver(rateConfirmationRequestSchema),
    defaultValues: {
      issueDate: new Date(),
      pickupDate: new Date(),
      deliveryDate: new Date(),
      baseRate: 0,
      totalRate: 0,
      accessorials: [],
      sendEmail: false,
      ccEmails: [],
      paymentTerms: "Net 30",
      trailerType: "53' Dry Van",
    },
  });

  // Fetch locations for dropdowns
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  // Fetch carriers for dropdown
  const { data: carriers = [] } = useQuery<Carrier[]>({
    queryKey: ["/api/carriers"],
  });

  // Watch financial fields to auto-calculate total
  const baseRate = form.watch("baseRate");
  const fuelSurcharge = form.watch("fuelSurcharge");
  const accessorials = form.watch("accessorials");

  // Auto-calculate total rate
  const calculateTotal = () => {
    const base = Number(baseRate) || 0;
    const fuel = Number(fuelSurcharge) || 0;
    const accessorialTotal = (accessorials || []).reduce((sum, acc) => sum + (Number(acc.amount) || 0), 0);
    return base + fuel + accessorialTotal;
  };

  // Update total when base/fuel/accessorials change
  const updateTotal = () => {
    const total = calculateTotal();
    form.setValue("totalRate", total);
  };

  // Auto-update total whenever financial fields change
  // Use JSON.stringify for deep comparison of accessorials array
  useEffect(() => {
    updateTotal();
  }, [baseRate, fuelSurcharge, JSON.stringify(accessorials)]);

  // Handle location selection and auto-fill address
  const handlePickupLocationChange = (locationId: string) => {
    form.setValue("pickupLocationId", locationId);
    const location = locations.find(l => l.id === locationId);
    if (location) {
      form.setValue("pickupLocationName", location.name);
      const address = `${location.address || ""}, ${location.city || ""}, ${location.state || ""}`.trim();
      form.setValue("pickupAddress", address);
      form.setValue("pickupContact", location.contactName || "");
    }
  };

  const handleDeliveryLocationChange = (locationId: string) => {
    form.setValue("deliveryLocationId", locationId);
    const location = locations.find(l => l.id === locationId);
    if (location) {
      form.setValue("deliveryLocationName", location.name);
      const address = `${location.address || ""}, ${location.city || ""}, ${location.state || ""}`.trim();
      form.setValue("deliveryAddress", address);
      form.setValue("deliveryContact", location.contactName || "");
    }
  };

  // Handle carrier selection
  const handleCarrierChange = (carrierId: string) => {
    form.setValue("customerId", carrierId);
    const carrier = carriers.find(c => c.id === carrierId);
    if (carrier) {
      form.setValue("customerName", carrier.name);
    }
  };

  // Add accessorial line item
  const addAccessorial = () => {
    const current = form.getValues("accessorials") || [];
    form.setValue("accessorials", [...current, { lineType: "", description: "", amount: 0 }]);
  };

  // Remove accessorial line item
  const removeAccessorial = (index: number) => {
    const current = form.getValues("accessorials") || [];
    form.setValue("accessorials", current.filter((_, i) => i !== index));
    updateTotal();
  };

  // Generate and download PDF
  const handleDownload = async (data: RateConfirmationRequest) => {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/rate-confirmations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, sendEmail: false }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate rate confirmation");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rate-confirmation-${data.rateConfirmationNumber || "draft"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success!",
        description: "Rate confirmation PDF downloaded successfully",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error",
        description: "Failed to generate rate confirmation PDF",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Send email
  const handleSendEmail = async (data: RateConfirmationRequest) => {
    if (!data.recipientEmail) {
      toast({
        title: "Email Required",
        description: "Please enter a recipient email address",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      await apiRequest("/api/rate-confirmations/generate", "POST", { ...data, sendEmail: true });

      toast({
        title: "Email Sent!",
        description: `Rate confirmation sent to ${data.recipientEmail}`,
      });
    } catch (error) {
      console.error("Error sending email:", error);
      toast({
        title: "Error",
        description: "Failed to send rate confirmation email",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Company Header */}
      <div className="mb-6 text-center border-b pb-4">
        <h1 className="text-3xl font-bold">GO 4 Farms & Cattle</h1>
        <p className="text-lg mt-1">1915 Espinoza Dr</p>
        <p className="text-lg">Carrollton, TX 75010-4002</p>
        <p className="text-lg">(903) 803-7500</p>
      </div>

      <Form {...form}>
        <form className="space-y-6">
          {/* Carrier Information */}
          <Card>
            <CardHeader>
              <CardTitle>Carrier Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Carrier</FormLabel>
                    <Select onValueChange={handleCarrierChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-carrier">
                          <SelectValue placeholder="Choose a carrier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {carriers.map((carrier) => (
                          <SelectItem key={carrier.id} value={carrier.id}>
                            {carrier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Carrier Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Carrier company name" {...field} data-testid="input-customer-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Document Information */}
          <Card>
            <CardHeader>
              <CardTitle>Document Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="rateConfirmationNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate Confirmation #</FormLabel>
                    <FormControl>
                      <Input placeholder="RC-001" {...field} data-testid="input-rate-conf-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="issueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Issue Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-issue-date"
                          >
                            {field.value ? format(new Date(field.value), "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="preparedBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prepared By</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" {...field} data-testid="input-prepared-by" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Pickup Information */}
          <Card>
            <CardHeader>
              <CardTitle>Pickup Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="pickupLocationId"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Pickup Location</FormLabel>
                    <Select onValueChange={handlePickupLocationChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-pickup-location">
                          <SelectValue placeholder="Choose pickup location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name} - {location.city}, {location.state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pickupAddress"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Pickup Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Shipper St, City, ST 12345" {...field} data-testid="input-pickup-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pickupDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pickup Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-pickup-date"
                          >
                            {field.value ? format(new Date(field.value), "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pickupContact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pickup Contact</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact person" {...field} data-testid="input-pickup-contact" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pickupTimeWindowStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Window Start</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-pickup-time-start" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pickupTimeWindowEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Window End</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-pickup-time-end" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pickupInstructions"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Pickup Instructions</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Special pickup instructions" {...field} data-testid="textarea-pickup-instructions" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Delivery Information */}
          <Card>
            <CardHeader>
              <CardTitle>Delivery Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="deliveryLocationId"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Delivery Location</FormLabel>
                    <Select onValueChange={handleDeliveryLocationChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-delivery-location">
                          <SelectValue placeholder="Choose delivery location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name} - {location.city}, {location.state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deliveryAddress"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Delivery Address</FormLabel>
                    <FormControl>
                      <Input placeholder="456 Receiver Ave, City, ST 12345" {...field} data-testid="input-delivery-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deliveryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-delivery-date"
                          >
                            {field.value ? format(new Date(field.value), "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deliveryContact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery Contact</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact person" {...field} data-testid="input-delivery-contact" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deliveryTimeWindowStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Window Start</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-delivery-time-start" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deliveryTimeWindowEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Window End</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-delivery-time-end" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deliveryInstructions"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Delivery Instructions</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Special delivery instructions" {...field} data-testid="textarea-delivery-instructions" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Load & Equipment Details */}
          <Card>
            <CardHeader>
              <CardTitle>Load & Equipment Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="loadNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Load Number</FormLabel>
                    <FormControl>
                      <Input placeholder="L-12345" {...field} data-testid="input-load-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="poNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO Number</FormLabel>
                    <FormControl>
                      <Input placeholder="PO-98765" {...field} data-testid="input-po-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="commodity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commodity</FormLabel>
                    <FormControl>
                      <Input placeholder="Live Cattle" {...field} data-testid="input-commodity" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight</FormLabel>
                    <FormControl>
                      <Input placeholder="45,000 lbs" {...field} data-testid="input-weight" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="estimatedMiles"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Miles</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="500" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber)} data-testid="input-estimated-miles" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="trailerType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trailer Type</FormLabel>
                    <FormControl>
                      <Input placeholder="53' Livestock Trailer" {...field} data-testid="input-trailer-type" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="powerUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Power Unit</FormLabel>
                    <FormControl>
                      <Input placeholder="Truck #123" {...field} data-testid="input-power-unit" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="temperatureRequirement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperature</FormLabel>
                    <FormControl>
                      <Input placeholder="N/A" {...field} data-testid="input-temperature" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="equipmentNotes"
                render={({ field }) => (
                  <FormItem className="md:col-span-3">
                    <FormLabel>Equipment Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Special equipment requirements" {...field} data-testid="textarea-equipment-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Financial Information */}
          <Card>
            <CardHeader>
              <CardTitle>Rate Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="baseRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Rate *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e.target.valueAsNumber);
                            setTimeout(updateTotal, 0);
                          }}
                          data-testid="input-base-rate"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ratePerMile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rate Per Mile</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber)} data-testid="input-rate-per-mile" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fuelSurcharge"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fuel Surcharge</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e.target.valueAsNumber);
                            setTimeout(updateTotal, 0);
                          }}
                          data-testid="input-fuel-surcharge"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Terms</FormLabel>
                      <FormControl>
                        <Input placeholder="Net 30" {...field} data-testid="input-payment-terms" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Accessorials */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel>Accessorial Charges</FormLabel>
                  <Button type="button" variant="outline" size="sm" onClick={addAccessorial} data-testid="button-add-accessorial">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Charge
                  </Button>
                </div>
                {accessorials && accessorials.length > 0 && (
                  <div className="space-y-2">
                    {accessorials.map((acc, index) => (
                      <div key={index} className="grid gap-2 md:grid-cols-[2fr,3fr,1fr,auto] items-end">
                        <FormField
                          control={form.control}
                          name={`accessorials.${index}.lineType`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="Type (e.g., Detention)" {...field} data-testid={`input-accessorial-type-${index}`} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`accessorials.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="Description" {...field} data-testid={`input-accessorial-desc-${index}`} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`accessorials.${index}.amount`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e.target.valueAsNumber);
                                    setTimeout(updateTotal, 0);
                                  }}
                                  data-testid={`input-accessorial-amount-${index}`}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAccessorial(index)}
                          data-testid={`button-remove-accessorial-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Total Rate */}
              <FormField
                control={form.control}
                name="totalRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg font-semibold">Total Rate *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        className="text-lg font-bold"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        data-testid="input-total-rate"
                        readOnly
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Special terms, conditions, or notes" {...field} data-testid="textarea-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Email Options */}
          <Card>
            <CardHeader>
              <CardTitle>Email Delivery (Optional)</CardTitle>
              <CardDescription>Enter email to send the rate confirmation directly</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="recipientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipient Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="customer@company.com" {...field} data-testid="input-recipient-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={form.handleSubmit(handleDownload)}
              disabled={isGenerating || isSendingEmail}
              data-testid="button-download-pdf"
            >
              <Download className="mr-2 h-4 w-4" />
              {isGenerating ? "Generating..." : "Download PDF"}
            </Button>
            <Button
              type="button"
              onClick={form.handleSubmit(handleSendEmail)}
              disabled={isGenerating || isSendingEmail}
              data-testid="button-send-email"
            >
              <Mail className="mr-2 h-4 w-4" />
              {isSendingEmail ? "Sending..." : "Send Email"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
