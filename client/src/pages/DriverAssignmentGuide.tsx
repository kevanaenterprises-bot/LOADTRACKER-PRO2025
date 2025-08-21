import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";

export default function DriverAssignmentGuide() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);

  const steps = [
    {
      number: 1,
      title: "Get Authentication Token",
      description: "First, you need to activate authentication",
      action: "Go to Admin Test Page",
      link: "/admin-test",
      details: "Click the green 'Get Auth Token' button when you get there"
    },
    {
      number: 2,
      title: "Open Dashboard",
      description: "Navigate to the main dashboard",
      action: "Go to Dashboard",
      link: "/dashboard",
      details: "You'll see the loads table with all your shipments"
    },
    {
      number: 3,
      title: "Select a Load",
      description: "Click on any row in the loads table",
      action: "Click Load Row",
      link: "",
      details: "This opens the load details dialog"
    },
    {
      number: 4,
      title: "Assign Driver",
      description: "In the dialog, find the Driver section",
      action: "Click 'Assign Driver'",
      link: "",
      details: "Select a driver from the dropdown menu"
    }
  ];

  return (
    <div className="max-w-4xl mx-auto mt-10 p-6">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl text-center">How to Assign Drivers to Loads</CardTitle>
          <p className="text-center text-gray-600">Follow these simple steps</p>
        </CardHeader>
      </Card>

      <div className="grid gap-6">
        {steps.map((step) => (
          <Card key={step.number} className={`${currentStep === step.number ? 'border-blue-500 bg-blue-50' : ''}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                  currentStep >= step.number ? 'bg-green-500' : 'bg-gray-400'
                }`}>
                  {step.number}
                </div>
                {step.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4">{step.description}</p>
              <p className="text-sm text-gray-600 mb-4">{step.details}</p>
              
              {step.link && (
                <Button 
                  onClick={() => {
                    setCurrentStep(step.number + 1);
                    setLocation(step.link);
                  }}
                  className="mr-4"
                >
                  {step.action}
                </Button>
              )}
              
              {step.number < steps.length && (
                <Button 
                  variant="outline" 
                  onClick={() => setCurrentStep(step.number + 1)}
                >
                  Mark Complete
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-8 bg-green-50 border-green-200">
        <CardHeader>
          <CardTitle className="text-green-800">Quick Test Option</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-green-700 mb-4">
            Want to test immediately without going through the dashboard?
          </p>
          <Button 
            onClick={() => setLocation("/quick-assign")}
            className="bg-green-600 hover:bg-green-700"
          >
            Go to Quick Test Page
          </Button>
        </CardContent>
      </Card>

      <div className="mt-8 text-center">
        <Button 
          variant="outline" 
          onClick={() => setLocation("/")}
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
}