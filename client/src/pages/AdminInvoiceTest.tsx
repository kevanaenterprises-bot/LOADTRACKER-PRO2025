import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function AdminInvoiceTest() {
  const { toast } = useToast();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      return await apiRequest("/api/admin/login", "POST", { username, password });
    },
    onSuccess: () => {
      setIsLoggedIn(true);
      toast({
        title: "Login Successful",
        description: "You are now logged in as admin",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  // Fetch loads
  const { data: loads } = useQuery({
    queryKey: ["/api/loads"],
    enabled: isLoggedIn,
    retry: false,
  });

  // Manual invoice generation mutation
  const generateInvoiceMutation = useMutation({
    mutationFn: async (loadId: string) => {
      return await apiRequest("/api/loads/" + loadId + "/generate-invoice", "POST", {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Invoice Generated Successfully",
        description: `Invoice ${data.invoiceNumber} created for $${data.totalAmount}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
    },
    onError: (error: any) => {
      console.error("Invoice generation error:", error);
      toast({
        title: "Invoice Generation Failed",
        description: error.message || "Unable to generate invoice",
        variant: "destructive",
      });
    },
  });

  const handleLogin = () => {
    loginMutation.mutate({ username, password });
  };

  const handleGenerateInvoice = (loadId: string) => {
    generateInvoiceMutation.mutate(loadId);
  };

  const activeLoads = Array.isArray(loads) ? loads.filter((load: any) => load.status !== "completed") : [];

  if (!isLoggedIn) {
    return (
      <div className="p-8 max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Admin Invoice Test Login</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="admin123"
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={loginMutation.isPending}
              className="w-full"
            >
              {loginMutation.isPending ? "Logging in..." : "Login as Admin"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Invoice Test</h1>
        <div className="text-sm text-green-600">✅ Logged in as admin</div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Load Invoice Generation (Admin)</CardTitle>
        </CardHeader>
        <CardContent>
          {activeLoads.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No active loads available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeLoads.map((load: any) => (
                <div
                  key={load.id}
                  className="border rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">{load.number109}</div>
                    <div className="text-sm text-gray-600">
                      Driver: {load.driver ? `${load.driver.firstName} ${load.driver.lastName}` : 'Not assigned'}
                    </div>
                    <div className="text-sm text-gray-500">
                      Destination: {load.location ? `${load.location.city}, ${load.location.state}` : 'Not set'}
                    </div>
                    <Badge className="mt-1">
                      {load.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                  
                  <Button
                    onClick={() => handleGenerateInvoice(load.id)}
                    disabled={generateInvoiceMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {generateInvoiceMutation.isPending ? "Generating..." : "Generate Invoice"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}