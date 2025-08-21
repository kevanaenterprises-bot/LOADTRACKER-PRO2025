import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";

export default function Landing() {
  const [, setLocation] = useLocation();
  
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleDriverLogin = () => {
    setLocation("/driver-login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-primary mb-4">LoadTracker Pro</h1>
          <p className="text-xl text-secondary max-w-2xl mx-auto">
            Comprehensive logistics management system for load dispatch, driver coordination, and automated invoicing
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <Card className="material-card cursor-pointer hover:shadow-lg transition-shadow" onClick={handleLogin}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <i className="fas fa-truck text-primary text-2xl"></i>
                Load Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Create and track loads with 109 numbers, assign drivers, and manage deliveries from pickup to completion.
              </p>
              <Button variant="outline" className="mt-4 w-full">
                Access Load Management
              </Button>
            </CardContent>
          </Card>

          <Card className="material-card cursor-pointer hover:shadow-lg transition-shadow" onClick={handleLogin}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <i className="fas fa-mobile-alt text-primary text-2xl"></i>
                Driver Portal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Mobile-optimized interface for drivers to update status, enter BOL numbers, and upload POD documents.
              </p>
              <Button variant="outline" className="mt-4 w-full">
                Access Driver Portal
              </Button>
            </CardContent>
          </Card>

          <Card className="material-card cursor-pointer hover:shadow-lg transition-shadow" onClick={handleLogin}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <i className="fas fa-file-invoice-dollar text-primary text-2xl"></i>
                Automated Invoicing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Generate invoices automatically based on location rates and mileage calculations upon load completion.
              </p>
              <Button variant="outline" className="mt-4 w-full">
                Access Invoicing
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Card className="inline-block">
            <CardContent className="pt-6">
              <h3 className="text-2xl font-semibold text-secondary mb-4">Ready to get started?</h3>
              <p className="text-gray-600 mb-6">
                Sign in to access your dashboard and start managing your logistics operations.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button onClick={handleLogin} size="lg" className="px-8 py-3 text-lg">
                  <i className="fas fa-sign-in-alt mr-2"></i>
                  Office Sign In
                </Button>
                <Button onClick={() => setLocation('/admin-login')} variant="secondary" size="lg" className="px-8 py-3 text-lg">
                  <i className="fas fa-user-shield mr-2"></i>
                  Admin Login
                </Button>
                <Button onClick={handleDriverLogin} variant="outline" size="lg" className="px-8 py-3 text-lg">
                  <i className="fas fa-truck mr-2"></i>
                  Driver Login
                </Button>
              </div>
              
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button onClick={() => setLocation('/test')} variant="ghost" size="lg" className="px-8 py-3 text-lg">
                    <i className="fas fa-cog mr-2"></i>
                    Testing Tools
                  </Button>
                  <Button onClick={() => setLocation('/test-loads')} variant="ghost" size="lg" className="px-8 py-3 text-lg">
                    <i className="fas fa-mouse-pointer mr-2"></i>
                    Test Load Clicks
                  </Button>
                  <Button onClick={() => setLocation('/quick-invoice')} variant="ghost" size="lg" className="px-8 py-3 text-lg">
                    <i className="fas fa-file-invoice mr-2"></i>
                    Quick Invoice Test
                  </Button>
                  <Button onClick={() => setLocation('/admin-invoice')} variant="ghost" size="lg" className="px-8 py-3 text-lg">
                    <i className="fas fa-user-shield mr-2"></i>
                    Admin Invoice Fix
                  </Button>
                  <Button onClick={() => setLocation('/simple-invoice')} variant="ghost" size="lg" className="px-8 py-3 text-lg">
                    <i className="fas fa-cog mr-2"></i>
                    Simple Invoice Test
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
