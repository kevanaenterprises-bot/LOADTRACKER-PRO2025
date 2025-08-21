import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";

export default function TroubleshootPage() {
  const [, setLocation] = useLocation();
  const [systemStatus, setSystemStatus] = useState<any>({});
  const [testing, setTesting] = useState(false);

  const checkSystemStatus = async () => {
    setTesting(true);
    const status: any = {};

    try {
      // Check if bypass token works
      const authResponse = await fetch("/api/auth/browser-bypass", {
        method: "POST",
        credentials: "include",
      });
      status.authBypass = authResponse.ok;
      
      if (authResponse.ok) {
        const authData = await authResponse.json();
        localStorage.setItem('bypass-token', authData.token);
        status.token = authData.token;
      }
    } catch (error) {
      status.authBypass = false;
      status.authError = String(error);
    }

    try {
      // Check if loads API works
      const loadsResponse = await fetch("/api/loads", {
        headers: {
          "X-Bypass-Token": localStorage.getItem('bypass-token') || '',
        },
        credentials: "include",
      });
      status.loadsAPI = loadsResponse.ok;
      
      if (loadsResponse.ok) {
        const loads = await loadsResponse.json();
        status.loadCount = Array.isArray(loads) ? loads.length : 0;
      }
    } catch (error) {
      status.loadsAPI = false;
      status.loadsError = String(error);
    }

    try {
      // Check if drivers API works
      const driversResponse = await fetch("/api/drivers/available", {
        headers: {
          "X-Bypass-Token": localStorage.getItem('bypass-token') || '',
        },
        credentials: "include",
      });
      status.driversAPI = driversResponse.ok;
      
      if (driversResponse.ok) {
        const drivers = await driversResponse.json();
        status.driverCount = Array.isArray(drivers) ? drivers.length : 0;
      }
    } catch (error) {
      status.driversAPI = false;
      status.driversError = String(error);
    }

    setSystemStatus(status);
    setTesting(false);
  };

  useEffect(() => {
    checkSystemStatus();
  }, []);

  const StatusIndicator = ({ good, label }: { good: boolean; label: string }) => (
    <div className="flex items-center space-x-2">
      <div className={`w-3 h-3 rounded-full ${good ? 'bg-green-500' : 'bg-red-500'}`}></div>
      <span className={good ? 'text-green-700' : 'text-red-700'}>{label}</span>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto mt-10 p-6">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">System Status Check</CardTitle>
          <p className="text-gray-600">Let's see what's working and what isn't</p>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={checkSystemStatus} 
            disabled={testing}
            className="mb-4"
          >
            {testing ? "Checking..." : "Run System Check"}
          </Button>

          {Object.keys(systemStatus).length > 0 && (
            <div className="space-y-3">
              <StatusIndicator 
                good={systemStatus.authBypass} 
                label={`Authentication Bypass: ${systemStatus.authBypass ? 'Working' : 'Failed'}`} 
              />
              
              <StatusIndicator 
                good={systemStatus.loadsAPI} 
                label={`Loads API: ${systemStatus.loadsAPI ? `Working (${systemStatus.loadCount} loads)` : 'Failed'}`} 
              />
              
              <StatusIndicator 
                good={systemStatus.driversAPI} 
                label={`Drivers API: ${systemStatus.driversAPI ? `Working (${systemStatus.driverCount} drivers)` : 'Failed'}`} 
              />

              {systemStatus.token && (
                <div className="mt-4 p-3 bg-green-50 rounded">
                  <p className="text-sm text-green-700">Auth token active: {systemStatus.token.substring(0, 20)}...</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">What to try next</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            onClick={() => setLocation("/quick-assign")} 
            className="w-full"
            variant="outline"
          >
            Try Quick Assignment Test
          </Button>
          
          <Button 
            onClick={() => setLocation("/admin-test")} 
            className="w-full"
            variant="outline"
          >
            Go to Admin Test Page
          </Button>
          
          <Button 
            onClick={() => setLocation("/dashboard")} 
            className="w-full"
            variant="outline"
          >
            Go to Dashboard
          </Button>

          <Button 
            onClick={() => setLocation("/production-debug")} 
            className="w-full"
            variant="destructive"
          >
            🔧 Production Debug Tool
          </Button>

          <Button 
            onClick={() => setLocation("/")} 
            className="w-full"
            variant="ghost"
          >
            Back to Home
          </Button>
        </CardContent>
      </Card>

      {systemStatus.authError && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">Authentication Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">{systemStatus.authError}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}