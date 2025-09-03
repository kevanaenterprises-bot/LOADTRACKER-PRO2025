import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import StandaloneBOLUpload from "@/components/StandaloneBOLUpload";
import { SimpleFileUpload } from "@/components/SimpleFileUpload";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { apiRequest } from "@/lib/queryClient";

export default function DriverPortal() {
  console.log("🚨 DEBUG: DriverPortal loading...");
  
  const { user, logout, isLoading, isAuthenticated, error } = useDriverAuth();
  console.log("🚨 Auth state:", { isAuthenticated, isLoading, hasUser: !!user, error });

  // Show loading while authentication is being checked
  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <h2 className="text-lg font-semibold">Loading...</h2>
          <p className="text-gray-600 mt-2">Checking authentication</p>
        </div>
      </div>
    );
  }

  // Show error if authentication failed
  if (error) {
    return (
      <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <h2 className="text-lg font-semibold text-red-600">Authentication Error</h2>
          <p className="text-gray-600 mt-2">{String(error)}</p>
          <Button onClick={() => window.location.href = '/driver-login'} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <h2 className="text-lg font-semibold">Please Log In</h2>
          <p className="text-gray-600 mt-2">You need to log in to access the driver portal</p>
          <Button onClick={() => window.location.href = '/driver-login'} className="mt-4">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  // SUCCESS: Show authenticated driver portal
  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold text-green-600">✅ DRIVER PORTAL</h1>
        <p className="mt-2">Welcome back, {user.firstName} {user.lastName}!</p>
        <p className="text-sm text-gray-600 mt-1">Username: {user.username}</p>
        
        <div className="mt-4 p-3 bg-green-50 rounded">
          <p className="text-sm font-medium">✓ Authentication successful</p>
          <p className="text-sm">✓ Driver account verified</p>
        </div>

        <Button 
          onClick={logout} 
          variant="outline" 
          className="mt-4 w-full"
        >
          Logout
        </Button>
      </div>
    </div>
  );
}