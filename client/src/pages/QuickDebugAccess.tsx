import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function QuickDebugAccess() {
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-lg mx-auto mt-20 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">Quick Access Menu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={() => setLocation("/production-debug")} 
            className="w-full"
            size="lg"
          >
            🔧 Production Debug Tool
          </Button>
          
          <Button 
            onClick={() => setLocation("/troubleshoot")} 
            className="w-full"
            variant="outline"
            size="lg"
          >
            📋 System Status Check
          </Button>
          
          <Button 
            onClick={() => setLocation("/admin-test")} 
            className="w-full"
            variant="outline"
            size="lg"
          >
            ⚙️ Admin Test Page
          </Button>
          
          <Button 
            onClick={() => setLocation("/dashboard")} 
            className="w-full"
            variant="outline"
            size="lg"
          >
            📊 Dashboard
          </Button>
          
          <div className="mt-6 pt-4 border-t">
            <p className="text-sm text-gray-600 text-center">
              For the "not a valid token" error, use the Production Debug Tool to see exactly what's happening.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}