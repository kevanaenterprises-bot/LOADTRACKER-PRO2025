import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminPortal() {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // Force redirect to admin dashboard after 3 seconds
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          window.location.href = '/admin-dashboard';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Admin Portal</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p>You've been authenticated successfully!</p>
          <p>Redirecting to dashboard in <strong>{countdown}</strong> seconds...</p>
          
          <div className="space-y-2">
            <Button 
              onClick={() => window.location.href = '/admin-dashboard'}
              className="w-full"
            >
              Go to Dashboard Now
            </Button>
            
            <Button 
              onClick={() => window.location.href = '/admin-test'}
              variant="outline"
              className="w-full"
            >
              Test Authentication
            </Button>
          </div>

          <div className="text-sm text-gray-600 mt-4 p-3 bg-gray-100 rounded">
            <p><strong>If you see a white screen:</strong></p>
            <ul className="text-left mt-2 space-y-1">
              <li>• Try clicking "Go to Dashboard Now"</li>
              <li>• Try the Test Authentication button</li>
              <li>• The dashboard should load properly</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}