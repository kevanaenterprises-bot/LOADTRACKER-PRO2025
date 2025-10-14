import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useLocation } from "wouter";
import { useEffect } from "react";
import logoUrl from "../assets/go-farms-logo.png";

export default function Landing() {
  const [, setLocation] = useLocation();
  
  // Feature flag for temporary Telnyx company information
  const showTelnyxInfo = import.meta.env.VITE_SHOW_TELNYX_INFO === 'true';
  
  useEffect(() => {
    if (showTelnyxInfo) {
      document.title = "Turtle Logistics - LoadTracker Pro | Professional Transportation Management Software";
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', 'Turtle Logistics LoadTracker Pro - Professional transportation management software for trucking companies. Real-time GPS tracking, automated invoicing, IFTA reporting, and more.');
      } else {
        const meta = document.createElement('meta');
        meta.name = 'description';
        meta.content = 'Turtle Logistics LoadTracker Pro - Professional transportation management software for trucking companies. Real-time GPS tracking, automated invoicing, IFTA reporting, and more.';
        document.head.appendChild(meta);
      }
    }
  }, [showTelnyxInfo]);

  const handleAdminLogin = () => {
    setLocation("/admin-login");
  };

  const handleDriverLogin = () => {
    setLocation("/driver-login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center px-4">
      {/* Company Logo */}
      <div className="mb-12 text-center">
        <div className="mb-4">
          <p className="text-3xl font-bold text-blue-600 mb-2">🐢 Turtle Logistics</p>
          <p className="text-sm text-gray-600">Melissa, Texas</p>
        </div>
        <h1 className="text-4xl font-bold text-primary mb-2">LoadTracker Pro</h1>
        <p className="text-gray-600">Professional Transportation Management System</p>
      </div>

      {/* Login Buttons */}
      <div className="flex flex-col gap-6 w-full max-w-md">
        <Button 
          onClick={handleAdminLogin} 
          size="lg" 
          className="w-full py-4 text-lg font-semibold"
        >
          <i className="fas fa-user-shield mr-3 text-xl"></i>
          Admin Login
        </Button>
        
        <Button 
          onClick={handleDriverLogin} 
          variant="outline" 
          size="lg" 
          className="w-full py-4 text-lg font-semibold"
        >
          <i className="fas fa-truck mr-3 text-xl"></i>
          Driver Login
        </Button>
        
        <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
          <Button 
            onClick={() => setLocation("/troubleshoot")} 
            variant="outline" 
            size="sm" 
            className="w-full bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
          >
            <i className="fas fa-wrench mr-2"></i>
            Fix Problems
          </Button>
          <Button 
            onClick={() => setLocation("/how-to-assign")} 
            variant="outline" 
            size="sm" 
            className="w-full bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
          >
            <i className="fas fa-book mr-2"></i>
            How to Assign Drivers
          </Button>

        </div>
      </div>
      
      {/* BEGIN TEMP TELNYX COMPLIANCE - Temporary company information for messaging service verification */}
      {showTelnyxInfo && (
        <div className="mt-8 w-full max-w-2xl">
          <Card className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-2 border-blue-200 dark:border-blue-700">
            <CardHeader className="text-center">
              <CardTitle className="text-lg font-semibold text-blue-800 dark:text-blue-200" data-testid="text-company-section-title">
                Company Information
              </CardTitle>
              <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
                Temporary display while main website is under maintenance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Business Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Business Details</h3>
                  <div className="text-sm space-y-1">
                    <p data-testid="text-company-name"><strong>Business Name:</strong> Turtle Logistics</p>
                    <p data-testid="text-address"><strong>Address:</strong> 1510 Crystal Valley Way, Melissa, Texas</p>
                    <p data-testid="text-services"><strong>Services:</strong> Transportation & Logistics</p>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Contact Information</h3>
                  <div className="text-sm space-y-1">
                    <p data-testid="text-email"><strong>Email:</strong> accounting@go4fc.com</p>
                    <p data-testid="text-phone"><strong>Phone:</strong> (214) 878-1230</p>
                    <p><strong>Support Hours:</strong> Monday-Friday, 8AM-5PM CST</p>
                    <p><strong>Business Type:</strong> Transportation Company</p>
                    <p><strong>Last Updated:</strong> {new Date().toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
              
              {/* SMS Messaging Compliance */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
                <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">SMS Messaging Information</h3>
                <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                  <p data-testid="text-sms-disclosure">
                    <strong>Messaging Disclosure:</strong> By engaging with our service you agree to receive SMS notifications. 
                    Message and data rates may apply. Message frequency varies.
                  </p>
                  <p data-testid="text-optout">
                    <strong>Opt-out Instructions:</strong> Reply STOP to opt out of messages. Reply HELP for help.
                  </p>
                </div>
              </div>
              
              {/* Expandable Policies */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="privacy-policy">
                  <AccordionTrigger data-testid="link-privacy" className="text-left text-sm">
                    Privacy Policy & Terms
                  </AccordionTrigger>
                  <AccordionContent className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
                    <p><strong>Privacy:</strong> We collect minimal information necessary for transportation services. 
                    Contact information is used solely for load coordination and delivery notifications.</p>
                    <p><strong>SMS Terms:</strong> SMS notifications are sent for load updates, delivery confirmations, 
                    and service-related communications. Standard messaging rates apply. We do not share your phone number 
                    with third parties for marketing purposes.</p>
                    <p><strong>Data Retention:</strong> Contact information is retained for business record requirements 
                    and may be used to improve our transportation services.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              
              <div className="text-center pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This information is temporarily displayed for business verification purposes while our main website undergoes maintenance.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {/* END TEMP TELNYX COMPLIANCE */}
    </div>
  );
}
