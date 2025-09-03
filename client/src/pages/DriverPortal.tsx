import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import StandaloneBOLUpload from "@/components/StandaloneBOLUpload";
import { SimpleFileUpload } from "@/components/SimpleFileUpload";
import DriverLoadCard from "@/components/DriverLoadCard";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { apiRequest } from "@/lib/queryClient";

export default function DriverPortal() {
  console.log("🚨 DEBUG: DriverPortal loading...");
  
  const { user, logout, isLoading, isAuthenticated, error } = useDriverAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  // STEP 1: Simple working version first
  console.log("🚛 DriverPortal: Authentication successful, showing simple interface");

  // SUCCESS: Show authenticated driver portal - BASIC VERSION
  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-green-600">Driver Portal</h1>
            <p className="mt-1">Welcome, {user.firstName} {user.lastName}!</p>
            <p className="text-sm text-gray-600">Username: {user.username}</p>
          </div>
          <Button onClick={logout} variant="outline" size="sm">
            Logout
          </Button>
        </div>
      </div>

      {/* BOL Upload Section - Core Functionality */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">BOL Upload</h2>
        <StandaloneBOLUpload />
      </div>

      {/* Status Message */}
      <Card className="mb-4">
        <CardContent className="p-6 text-center">
          <h3 className="font-semibold text-green-700">✅ Driver Portal Active</h3>
          <p className="text-gray-600 mt-2">Authentication working. BOL upload ready.</p>
          <p className="text-sm text-gray-500 mt-1">Load assignments coming next...</p>
        </CardContent>
      </Card>
    </div>
  );
}