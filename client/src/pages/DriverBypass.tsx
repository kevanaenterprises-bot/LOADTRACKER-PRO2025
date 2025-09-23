import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "wouter";
import { Truck } from "lucide-react";

export function DriverBypass() {
  const navigate = useNavigate();

  const enableDriverAccess = () => {
    // Enable driver bypass mode
    localStorage.setItem('driver-bypass-mode', 'true');
    
    // Reload to apply the bypass token to all requests
    window.location.href = '/dashboard';
  };

  const disableDriverAccess = () => {
    localStorage.removeItem('driver-bypass-mode');
    window.location.href = '/';
  };

  const isDriverMode = localStorage.getItem('driver-bypass-mode') === 'true';

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Truck className="h-12 w-12 text-primary" />
          </div>
          <CardTitle>Driver Portal Access</CardTitle>
          <CardDescription>
            Emergency access for drivers when normal login isn't working
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isDriverMode ? (
            <>
              <p className="text-sm text-muted-foreground">
                Click the button below to enable driver access mode. This will bypass authentication issues and allow you to view loads.
              </p>
              <Button 
                onClick={enableDriverAccess} 
                className="w-full"
                size="lg"
                data-testid="button-enable-driver-access"
              >
                <Truck className="mr-2 h-4 w-4" />
                Enable Driver Access
              </Button>
              <Button 
                onClick={() => navigate('/admin')} 
                variant="outline"
                className="w-full"
                data-testid="button-admin-login"
              >
                Admin Login Instead
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Driver access mode is currently <strong>ENABLED</strong>. You can access the dashboard with full permissions.
              </p>
              <Button 
                onClick={() => window.location.href = '/dashboard'} 
                className="w-full"
                size="lg"
                data-testid="button-go-dashboard"
              >
                Go to Dashboard
              </Button>
              <Button 
                onClick={disableDriverAccess} 
                variant="outline"
                className="w-full"
                data-testid="button-disable-driver-access"
              >
                Disable Driver Access
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}