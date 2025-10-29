import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, MapPin, FileText, DollarSign, BarChart3, Headphones, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import turtleMascot from "@assets/image_1760414014599.png";

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
          setLocation("/dashboard");
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
          <div className="mb-6 flex justify-center">
            <img 
              src={turtleMascot} 
              alt="Turtle Logistics Mascot" 
              className="w-40 h-40 object-contain"
              data-testid="img-turtle-mascot"
            />
          </div>
          <div className="mb-4">
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2" data-testid="text-company-name">
              Turtle Logistics
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
            $249/month • Up to 5 Trucks • No Setup Fees • Cancel Anytime
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
                <p><strong>$249/month</strong> - Perfect for smaller operations</p>
                <p>Ideal for up to 5 trucks, but works great up to 15+ trucks</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Once you exceed tier limits, fair overage charges apply - still 60% cheaper than $700/month competitors!
                </p>
              </div>
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

        {/* Transparent Pricing Section */}
        <div className="max-w-6xl mx-auto mt-16">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4" data-testid="heading-pricing-main">
              100% Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-2" data-testid="text-pricing-subtitle">
              No hidden fees. No surprises. No "call for pricing" BS. Here's exactly what you'll pay.
            </p>
            <p className="text-lg text-blue-600 dark:text-blue-400 font-semibold">
              Built for smaller operations struggling with $700-900/month TMS systems
            </p>
          </div>

          {/* Single Pricing Tier */}
          <div className="max-w-2xl mx-auto mb-12">
            <Card className="border-2 border-blue-500 dark:border-blue-600 shadow-2xl relative" data-testid="card-tier-main">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-1.5 rounded-full text-sm font-semibold">
                One Simple Price
              </div>
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-3xl mb-3">LoadTracker Pro</CardTitle>
                <div className="text-5xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                  $249<span className="text-2xl text-gray-600 dark:text-gray-400">/month</span>
                </div>
                <p className="text-base text-gray-600 dark:text-gray-400 mt-2">Perfect for smaller trucking operations</p>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mt-1">Ideal for up to 5 trucks • Works up to 15+ trucks</p>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-700 dark:text-gray-300 text-center">
                    <strong>Built for you</strong> - small operations struggling with $700-900/month systems. 
                    <br />
                    You get <strong>everything</strong> with unlimited users. Once you exceed tier limits, fair overage charges apply.
                  </p>
                </div>
                
                <div className="grid md:grid-cols-2 gap-x-4 gap-y-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm"><strong>Unlimited users</strong></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm"><strong>Unlimited GPS tracking</strong></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Real-time fleet tracking</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Automated invoicing</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">OCR document scanning</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">IFTA reporting</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Driver mobile portal</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Historical marker tours</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Weather & fuel overlays</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Fleet maintenance tracking</span>
                  </div>
                </div>

                <div className="mt-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                  <p className="font-bold text-green-800 dark:text-green-200 text-center">Real Savings</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 text-center mt-1">
                    $249/mo vs. $700-900/mo = <strong>Save $5,412-$7,812/year</strong>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Overage Pricing - The Part Everyone Hides */}
          <Card className="bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 mb-12" data-testid="card-overage-pricing">
            <CardHeader>
              <CardTitle className="text-xl text-green-800 dark:text-green-200">
                Overage Pricing - We Don't Hide This Like Others Do!
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                If you go over your monthly limits, here's EXACTLY what you'll pay (no surprise bills):
              </p>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                  <p className="font-semibold text-gray-900 dark:text-white mb-2">Rate Con Scans (OCR)</p>
                  <p className="text-gray-600 dark:text-gray-400">$1.00 per additional scan</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Our cost: $0.10. We add $25 admin fee total per month (not per scan)</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                  <p className="font-semibold text-gray-900 dark:text-white mb-2">SMS Notifications</p>
                  <p className="text-gray-600 dark:text-gray-400">$0.04 per additional SMS</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Our cost: $0.004. We add $25 admin fee total per month</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                  <p className="font-semibold text-gray-900 dark:text-white mb-2">Email Invoices</p>
                  <p className="text-gray-600 dark:text-gray-400">$0.09 per additional email</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Unlimited included - just here for transparency</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
                  <p className="font-semibold text-gray-900 dark:text-white mb-2">GPS/Maps Calls</p>
                  <p className="text-gray-600 dark:text-gray-400">Unlimited - Always Free</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">We eat this cost. Track all you want!</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Competitor Comparison */}
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800" data-testid="card-competitor-comparison">
            <CardHeader>
              <CardTitle className="text-2xl text-blue-800 dark:text-blue-200">
                Why We're 30-50% Cheaper Than $700/Month Competitors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">1</div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">Usage-Based = Fair Pricing</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">You only pay for what you actually use. Competitors charge flat fees whether you use it or not.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">2</div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">No Sales Team Overhead</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Try it yourself, no sales calls required. We pass those savings to you.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">3</div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">Modern Cloud Infrastructure</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Built on efficient cloud tech, not legacy systems that cost more to maintain.</p>
                  </div>
                </div>
                <div className="bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg p-4 mt-4">
                  <p className="font-bold text-green-800 dark:text-green-200 text-lg">Real Savings Example:</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                    Small operation (5 trucks): <strong>LoadTracker Pro $249/mo</strong> vs. Competitor $700-900/mo = <strong>Save $5,412-$7,812/year</strong>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
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
