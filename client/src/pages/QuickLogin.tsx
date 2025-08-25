import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function QuickLogin() {
  const [isLogging, setIsLogging] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleLogin = async () => {
    setIsLogging(true);
    try {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: "admin",
          password: "go4fc2024"
        }),
      });

      if (response.ok) {
        toast({
          title: "Login Successful!",
          description: "You are now logged in as admin",
        });
        
        // Refresh auth state
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/admin-user"] });
        
        // Redirect to dashboard
        window.location.href = "/dashboard";
      } else {
        const data = await response.json();
        toast({
          title: "Login Failed",
          description: data.message || "Login failed",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Network error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-4">Quick Admin Login</h1>
        <p className="text-gray-600 mb-6">
          Click the button below to login as admin and access the dashboard.
        </p>
        
        <Button 
          onClick={handleLogin} 
          disabled={isLogging}
          className="w-full"
          size="lg"
        >
          {isLogging ? "Logging in..." : "Login as Admin"}
        </Button>
        
        <div className="mt-4 text-sm text-gray-500">
          <p>Credentials: admin / go4fc2024</p>
        </div>
      </div>
    </div>
  );
}