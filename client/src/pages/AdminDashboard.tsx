import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import StatsCards from "@/components/StatsCards";
import LoadForm from "@/components/LoadForm";
import LoadsTable from "@/components/LoadsTable";
import InvoiceInbox from "@/components/InvoiceInbox";
import { Header } from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"loads" | "drivers" | "ocr" | "tracking" | "customers" | "locations" | "rates" | "paid-invoices">("loads");

  // Simple auth check - use bypass token like driver auth (which works perfectly)
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    retry: false
  });

  const { data: user } = useQuery({
    queryKey: ["/api/auth/admin-user"],
    queryFn: async () => {
      // Use the EXACT same bypass token approach that works for drivers
      const bypassToken = localStorage.getItem('bypass-token');
      console.log("🔧 AdminDashboard: Using bypass token auth", !!bypassToken);
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      
      if (bypassToken) {
        headers["x-bypass-token"] = bypassToken;
      }
      
      const response = await fetch("/api/auth/admin-user", {
        credentials: "include",
        headers
      });
      
      if (!response.ok) {
        throw new Error("Not authenticated");
      }
      
      return response.json();
    },
    retry: false
  });

  // Debug what's happening
  console.log("🔧 ADMIN DASHBOARD DEBUG:", {
    user,
    stats,
    statsLoading,
    hasUser: !!user,
    hasStats: !!stats
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <div className="container mx-auto px-4 py-6">
        {!user ? (
          <div className="flex h-96 items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p>Checking authentication...</p>
              <div className="mt-4 text-sm text-gray-600">
                <p>If this persists, admin authentication is not working properly.</p>
                <button 
                  onClick={() => window.location.href = '/admin-login'}
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Go to Login
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Welcome, {(user as any)?.firstName || 'Admin'}!
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                GO 4 Farms & Cattle Dashboard
              </p>
            </div>

            {/* Stats Cards */}
            <div className="mb-6">
              <StatsCards isLoading={statsLoading} />
            </div>

            {/* Main Tabs */}
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="space-y-6">
              <TabsList className="grid grid-cols-4 lg:grid-cols-8 h-auto p-1 bg-white dark:bg-gray-800 shadow-sm">
                <TabsTrigger value="loads" className="text-xs px-2 py-2">
                  📦 Loads
                </TabsTrigger>
                <TabsTrigger value="drivers" className="text-xs px-2 py-2">
                  👥 Drivers
                </TabsTrigger>
                <TabsTrigger value="ocr" className="text-xs px-2 py-2">
                  📄 Wright Con
                </TabsTrigger>
                <TabsTrigger value="tracking" className="text-xs px-2 py-2">
                  📍 Tracking
                </TabsTrigger>
                <TabsTrigger value="customers" className="text-xs px-2 py-2">
                  🏢 Customers
                </TabsTrigger>
                <TabsTrigger value="locations" className="text-xs px-2 py-2">
                  📍 Locations
                </TabsTrigger>
                <TabsTrigger value="rates" className="text-xs px-2 py-2">
                  💰 Rates
                </TabsTrigger>
                <TabsTrigger value="paid-invoices" className="text-xs px-2 py-2">
                  ✅ Paid
                </TabsTrigger>
              </TabsList>

              {/* Loads Tab */}
              <TabsContent value="loads" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-8">
                    <LoadsTable />
                  </div>
                  <div className="lg:col-span-4">
                    <LoadForm />
                  </div>
                </div>
              </TabsContent>

              {/* Other tabs would go here - keeping it simple for now */}
              <TabsContent value="drivers" className="mt-6">
                <div className="text-center py-8">
                  <h2 className="text-2xl font-bold">Driver Management</h2>
                  <p className="text-gray-600 mt-2">Driver management features coming up...</p>
                </div>
              </TabsContent>

              <TabsContent value="ocr" className="mt-6">
                <div className="text-center py-8">
                  <h2 className="text-2xl font-bold">Wright Con Scanner</h2>
                  <p className="text-gray-600 mt-2">OCR scanning features coming up...</p>
                </div>
              </TabsContent>

            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}