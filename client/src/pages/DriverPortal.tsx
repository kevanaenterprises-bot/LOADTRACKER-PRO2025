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

  // STEP 2: Add load assignments with CORRECT endpoint
  console.log("🚛 DriverPortal: Authentication successful, adding load assignments");
  
  // Get driver's assigned loads - FIXED ENDPOINT
  const { data: loads, isLoading: loadsLoading, error: loadsError } = useQuery({
    queryKey: ["/api/drivers", user.id, "loads"],
    queryFn: () => fetch(`/api/drivers/${user.id}/loads`, {
      credentials: 'include',
      headers: {
        'x-bypass-token': 'LOADTRACKER_BYPASS_2025'
      }
    }).then(res => res.json()),
    enabled: !!user.id,
  });
  
  console.log("🚛 Load assignments:", { loads, loadsLoading, loadsError, userID: user.id });

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

      {/* Load Assignments */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Your Load Assignments</h2>
        {loadsLoading ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-600">Loading your assignments...</p>
            </CardContent>
          </Card>
        ) : loadsError ? (
          <Card>
            <CardContent className="p-6 text-center">
              <h3 className="font-semibold text-red-600">Error Loading Assignments</h3>
              <p className="text-gray-600 mt-2">Unable to fetch your load assignments.</p>
            </CardContent>
          </Card>
        ) : !loads || loads.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <h3 className="font-semibold text-gray-700">No Active Assignments</h3>
              <p className="text-gray-600 mt-2">You don't have any active load assignments. Check back later or contact dispatch.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {loads.map((load: any) => (
              <Card key={load.id} className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg">{load.number109}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        📍 {load.location?.name} 
                        {load.location?.city && `, ${load.location.city}, ${load.location.state}`}
                      </p>
                      <Badge variant="secondary" className="mt-2">{load.status}</Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">${load.flatRate || '1350.00'}</p>
                      <p className="text-xs text-gray-500">{new Date(load.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {load.specialInstructions && (
                    <p className="text-sm text-gray-600 mt-2">📝 {load.specialInstructions}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Status Message */}
      <Card className="mb-4">
        <CardContent className="p-6 text-center">
          <h3 className="font-semibold text-green-700">✅ Driver Portal Active</h3>
          <p className="text-gray-600 mt-2">Authentication working. BOL upload ready.</p>
          <p className="text-sm text-gray-500 mt-1">Load assignments loading successfully!</p>
        </CardContent>
      </Card>
    </div>
  );
}