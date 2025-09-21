import { useEffect, useState } from "react";
import { useMainAuth } from "@/hooks/useMainAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Calendar, DollarSign, FileText } from "lucide-react";
import { format } from "date-fns";

export default function PaidLoads() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useMainAuth();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM format

  // Setup bypass token automatically when authenticated
  useEffect(() => {
    const setupBypassToken = async () => {
      if (!localStorage.getItem('bypass-token')) {
        try {
          const response = await fetch("/api/auth/browser-bypass", {
            method: "POST",
            credentials: "include",
          });
          if (response.ok) {
            const data = await response.json();
            localStorage.setItem('bypass-token', data.token);
          }
        } catch (error) {
          // Silent fail - will use normal authentication
        }
      }
    };

    if (isAuthenticated && !isLoading) {
      setupBypassToken();
    }
  }, [isAuthenticated, isLoading]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Please log in...",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/");
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast, setLocation]);

  const { data: paidLoads, isLoading: loadsLoading } = useQuery({
    queryKey: ["/api/loads", { status: "paid", search: searchTerm, month: selectedMonth }],
    enabled: isAuthenticated && !isLoading,
  });

  // Filter loads by search term
  const filteredLoads = (Array.isArray(paidLoads) ? paidLoads : []).filter((load: any) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      load.number109?.toLowerCase().includes(searchLower) ||
      load.driver?.firstName?.toLowerCase().includes(searchLower) ||
      load.driver?.lastName?.toLowerCase().includes(searchLower) ||
      load.paymentMethod?.toLowerCase().includes(searchLower) ||
      load.paymentReference?.toLowerCase().includes(searchLower)
    );
  });

  // Calculate totals for the displayed loads
  const totalPaid = filteredLoads.reduce((sum: number, load: any) => {
    return sum + (parseFloat(load.invoice?.totalAmount || "0"));
  }, 0);

  const backToDashboard = () => {
    setLocation("/dashboard");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            onClick={backToDashboard}
            className="flex items-center gap-2"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Paid Loads Archive
          </h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid Loads</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-loads">
                {filteredLoads.length}
              </div>
              <p className="text-xs text-muted-foreground">
                {searchTerm || selectedMonth !== new Date().toISOString().slice(0, 7) ? "Filtered results" : "All time"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-revenue">
                ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">
                From displayed loads
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Viewing Period</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {format(new Date(selectedMonth + "-01"), "MMM yyyy")}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filter Paid Loads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search by load number, driver, payment method..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <div className="sm:w-48">
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  data-testid="input-month-filter"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Paid Loads Table */}
        <Card>
          <CardHeader>
            <CardTitle>Paid Loads History</CardTitle>
          </CardHeader>
          <CardContent>
            {loadsLoading ? (
              <div className="text-center py-8">Loading paid loads...</div>
            ) : filteredLoads.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchTerm || selectedMonth !== new Date().toISOString().slice(0, 7) ? 
                  "No paid loads match your search criteria." : 
                  "No paid loads found."
                }
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">Load #</th>
                      <th className="text-left p-3 font-medium">Driver</th>
                      <th className="text-left p-3 font-medium">Customer</th>
                      <th className="text-left p-3 font-medium">Amount</th>
                      <th className="text-left p-3 font-medium">Payment Method</th>
                      <th className="text-left p-3 font-medium">Payment Ref</th>
                      <th className="text-left p-3 font-medium">Paid Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLoads.map((load: any) => (
                      <tr key={load.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800" data-testid={`row-load-${load.id}`}>
                        <td className="p-3 font-mono text-sm" data-testid={`text-load-number-${load.id}`}>
                          {load.number109}
                        </td>
                        <td className="p-3" data-testid={`text-driver-${load.id}`}>
                          {load.driver ? `${load.driver.firstName} ${load.driver.lastName}` : "Unassigned"}
                        </td>
                        <td className="p-3" data-testid={`text-customer-${load.id}`}>
                          {load.location?.name || "N/A"}
                        </td>
                        <td className="p-3 font-medium" data-testid={`text-amount-${load.id}`}>
                          ${parseFloat(load.invoice?.totalAmount || "0").toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3" data-testid={`text-payment-method-${load.id}`}>
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-xs">
                            {load.paymentMethod || "N/A"}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-gray-600 dark:text-gray-400" data-testid={`text-payment-ref-${load.id}`}>
                          {load.paymentReference || "—"}
                        </td>
                        <td className="p-3 text-sm" data-testid={`text-paid-date-${load.id}`}>
                          {load.paidAt ? format(new Date(load.paidAt), "MMM dd, yyyy") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}