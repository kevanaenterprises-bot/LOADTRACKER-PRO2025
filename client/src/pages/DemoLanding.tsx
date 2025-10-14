import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, MapPin, FileText, DollarSign, BarChart3, Headphones, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function DemoLanding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    companyName: "",
    phoneNumber: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await apiRequest("POST", "/api/demo/start", formData);
      const data = await response.json();

      if (data.sessionToken) {
        localStorage.setItem("demoToken", data.sessionToken);
        
        toast({
          title: "Demo Access Granted!",
          description: "Welcome to LoadTracker Pro. Explore all features!",
        });

        setTimeout(() => {
          setLocation("/demo/dashboard");
        }, 500);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start demo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="mb-4">
            <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400 mb-2" data-testid="text-company-name">
              🐢 Turtle Logistics
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Melissa, Texas</p>
          </div>
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4" data-testid="heading-demo-title">
            LoadTracker Pro
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-2" data-testid="text-tagline">
            Complete Logistics Management for Modern Trucking Companies
          </p>
          <p className="text-lg text-blue-600 dark:text-blue-400 font-semibold" data-testid="text-pricing-preview">
            Starting at $149/month • No Setup Fees • Cancel Anytime
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-start max-w-6xl mx-auto">
          {/* Features Column */}
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6" data-testid="heading-features">
              Why LoadTracker Pro?
            </h2>

            <div className="space-y-4">
              <FeatureItem
                icon={<Truck className="w-6 h-6 text-blue-600" />}
                title="Real-Time Fleet Tracking"
                description="GPS tracking, HERE Maps integration, weather overlays, and fuel station finder"
              />
              <FeatureItem
                icon={<FileText className="w-6 h-6 text-green-600" />}
                title="Smart Document Processing"
                description="AI-powered OCR scans rate confirmations, BOL validation, automated invoicing"
              />
              <FeatureItem
                icon={<BarChart3 className="w-6 h-6 text-purple-600" />}
                title="IFTA Reporting"
                description="Automatic state-by-state mileage tracking with deadhead miles calculation"
              />
              <FeatureItem
                icon={<MapPin className="w-6 h-6 text-red-600" />}
                title="GPS Auto-Updates"
                description="Automatic status updates based on driver location proximity"
              />
              <FeatureItem
                icon={<Headphones className="w-6 h-6 text-orange-600" />}
                title="Road Tour Feature"
                description="GPS-triggered audio narration of historical markers - unique selling point!"
              />
              <FeatureItem
                icon={<DollarSign className="w-6 h-6 text-emerald-600" />}
                title="Usage-Based Pricing"
                description="Only pay for what you use. Fair pricing that scales with your business"
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mt-8">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3" data-testid="heading-pricing-tiers">
                Simple, Transparent Pricing
              </h3>
              <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <p><strong>Starter:</strong> $149/mo (5 trucks, basic limits)</p>
                <p><strong>Professional:</strong> $249/mo (15 trucks, higher limits)</p>
                <p><strong>Enterprise:</strong> $349/mo + usage (25+ trucks, custom limits)</p>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
                All overages charged at cost + $25 admin fee. 30-50% cheaper than $700 competitors!
              </p>
            </div>
          </div>

          {/* Demo Form Column */}
          <div>
            <Card className="shadow-2xl border-2 border-blue-200 dark:border-blue-800" data-testid="card-demo-form">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
                <CardTitle className="text-2xl" data-testid="heading-form-title">
                  Start Your Free Demo
                </CardTitle>
                <CardDescription className="text-blue-100" data-testid="text-form-description">
                  No credit card required. Full access to all features for 24 hours.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="fullName" data-testid="label-full-name">Full Name *</Label>
                    <Input
                      id="fullName"
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="John Smith"
                      className="mt-1"
                      data-testid="input-full-name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email" data-testid="label-email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john@trucking.com"
                      className="mt-1"
                      data-testid="input-email"
                    />
                  </div>

                  <div>
                    <Label htmlFor="companyName" data-testid="label-company">Company Name *</Label>
                    <Input
                      id="companyName"
                      required
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="ABC Trucking LLC"
                      className="mt-1"
                      data-testid="input-company"
                    />
                  </div>

                  <div>
                    <Label htmlFor="phoneNumber" data-testid="label-phone">Phone Number (Optional)</Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      placeholder="(555) 123-4567"
                      className="mt-1"
                      data-testid="input-phone"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-lg py-6"
                    disabled={isSubmitting}
                    data-testid="button-start-demo"
                  >
                    {isSubmitting ? "Starting Demo..." : "Start Free Demo Now →"}
                  </Button>

                  <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4" data-testid="text-auto-wipe-notice">
                    All demo data automatically deleted when you log out. Try it risk-free!
                  </p>
                </form>
              </CardContent>
            </Card>

            <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3" data-testid="heading-what-you-get">
                What You'll Get:
              </h4>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Create and manage loads with GPS tracking</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Test the OCR rate confirmation scanner</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Explore the real-time fleet map with weather</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Try the historical marker road tour feature</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Generate sample invoices and reports</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="mt-1">{icon}</div>
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}
