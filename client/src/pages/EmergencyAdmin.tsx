import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function EmergencyAdmin() {
  const [, setLocation] = useLocation();
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async () => {
    setIsLoading(true);
    setMessage("");

    try {
      console.log("🚨 EMERGENCY LOGIN ATTEMPT:", credentials);
      
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials),
      });

      console.log("🚨 LOGIN RESPONSE:", response.status, response.statusText);

      if (response.ok) {
        setMessage("✅ LOGIN SUCCESS! Redirecting...");
        // Force clear all cache
        localStorage.clear();
        sessionStorage.clear();
        
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 1000);
      } else {
        const data = await response.json();
        setMessage(`❌ LOGIN FAILED: ${data.message}`);
      }
    } catch (error: any) {
      console.error("🚨 LOGIN ERROR:", error);
      setMessage(`❌ NETWORK ERROR: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="bg-white border-2 border-red-500 rounded-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-red-600 mb-4">🚨 EMERGENCY ADMIN ACCESS</h1>
        <p className="text-gray-600 mb-6">This is a direct login bypass for emergencies</p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Username:</label>
            <Input
              value={credentials.username}
              onChange={(e) => setCredentials({...credentials, username: e.target.value})}
              placeholder="admin"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Password:</label>
            <Input
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials({...credentials, password: e.target.value})}
              placeholder="Your admin password"
            />
          </div>
          
          <Button 
            onClick={handleLogin} 
            disabled={isLoading} 
            className="w-full bg-red-600 hover:bg-red-700"
          >
            {isLoading ? "🔄 LOGGING IN..." : "🚨 EMERGENCY LOGIN"}
          </Button>
          
          {message && (
            <div className={`p-3 rounded text-center ${message.includes('SUCCESS') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {message}
            </div>
          )}
          
          <div className="text-center space-y-2">
            <Button variant="outline" onClick={() => setLocation("/")}>
              🏠 Back to Home
            </Button>
            <Button variant="outline" onClick={() => setLocation("/admin-login")}>
              🔒 Try Regular Login
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}