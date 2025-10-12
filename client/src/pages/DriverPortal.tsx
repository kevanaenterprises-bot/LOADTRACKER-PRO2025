import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import StandaloneBOLUpload from "@/components/StandaloneBOLUpload";
import { NotificationSettings } from "@/components/NotificationSettings";
import DriverLoadsDisplay from "@/components/DriverLoadsDisplay";
import { SimpleFileUpload } from "@/components/SimpleFileUpload";
import DriverLoadCard from "@/components/DriverLoadCard";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { apiRequest } from "@/lib/queryClient";
import { HelpButton, TruckerTip } from "@/components/HelpTooltip";
import { RoadTour } from "@/components/RoadTour";

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

  // REVERT: Keep working version stable
  console.log("🚛 DriverPortal: Authentication successful, showing simple interface");

  // Debug the user object to see what's being returned
  console.log("🔍 DRIVER PORTAL USER DEBUG:", {
    userId: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    fullUserObject: JSON.stringify(user, null, 2)
  });

  // SUCCESS: Show authenticated driver portal - MINIMAL VERSION FOR DEBUGGING
  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-green-600">Driver Portal</h1>
            <p className="mt-1">Welcome, {user.firstName} {user.lastName}!</p>
            <p className="text-sm text-gray-600">Username: {user.username}</p>
            <p className="text-sm text-gray-600">Driver ID: {user.id}</p>
          </div>
          <Button onClick={logout} variant="outline" size="sm">
            Logout
          </Button>
        </div>
      </div>

      {/* Driver Loads Section - RESTORED WITH CRASH PROTECTION */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Your Assigned Loads</CardTitle>
        </CardHeader>
        <CardContent>
          {user && user.id ? (
            <DriverLoadsDisplay driverId={user.id} />
          ) : (
            <p className="text-red-600">Error: Driver ID not found</p>
          )}
        </CardContent>
      </Card>

      {/* BOL Upload Section */}
      <StandaloneBOLUpload />

      {/* Road Tour - Historical Markers Audio Tours */}
      <RoadTour driverId={user.id} />
    </div>
  );
}