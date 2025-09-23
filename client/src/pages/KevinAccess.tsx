import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Truck, User } from "lucide-react";

export function KevinAccess() {
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const handleKevinLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password === "go4fc2024") {
      // Enable Kevin's special access
      localStorage.setItem('kevin-access', 'true');
      localStorage.setItem('driver-bypass-mode', 'true');
      
      toast({
        title: "Welcome Kevin Owen!",
        description: "Access granted. Redirecting to dashboard...",
      });
      
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500);
    } else {
      toast({
        title: "Access Denied",
        description: "Incorrect password",
        variant: "destructive",
      });
    }
  };

  const isKevinLoggedIn = localStorage.getItem('kevin-access') === 'true';

  if (isKevinLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <User className="h-12 w-12 text-primary" />
            </div>
            <CardTitle>Welcome Back, Kevin!</CardTitle>
            <CardDescription>
              You're already logged in
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => window.location.href = '/dashboard'} 
              className="w-full"
              size="lg"
              data-testid="button-go-dashboard"
            >
              <Truck className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Button>
            <Button 
              onClick={() => {
                localStorage.removeItem('kevin-access');
                localStorage.removeItem('driver-bypass-mode');
                window.location.reload();
              }} 
              variant="outline"
              className="w-full"
              data-testid="button-logout"
            >
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Truck className="h-12 w-12 text-primary" />
          </div>
          <CardTitle>Kevin Owen - Driver Access</CardTitle>
          <CardDescription>
            Enter your password to access the LoadTracker portal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleKevinLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-kevin-password"
                required
              />
            </div>
            <Button 
              type="submit"
              className="w-full"
              size="lg"
              data-testid="button-kevin-login"
            >
              <User className="mr-2 h-4 w-4" />
              Login as Kevin Owen
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}