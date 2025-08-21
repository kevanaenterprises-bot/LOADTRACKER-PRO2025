import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function SimpleInvoiceTest() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleDriverLogin = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/driver/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "john_doe", password: "1234567890" }),
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Driver Login Success",
          description: `Logged in as ${data.user.firstName} ${data.user.lastName}`,
        });
        setResult({ type: "login", data });
      } else {
        throw new Error("Login failed");
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  const handleGenerateInvoice = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/loads/5e48ebca-3a18-4c4c-b09e-c8f8cc3c6bf1/generate-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Invoice Generated Successfully",
          description: `Invoice ${data.invoiceNumber} for $${data.totalAmount}`,
        });
        setResult({ type: "invoice", data });
      } else {
        const errorText = await response.text();
        throw new Error(errorText);
      }
    } catch (error: any) {
      console.error("Invoice generation error:", error);
      toast({
        title: "Invoice Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Simple Invoice Test - Direct API Calls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={handleDriverLogin}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? "Logging in..." : "1. Login as Driver"}
            </Button>
            
            <Button
              onClick={handleGenerateInvoice}
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isLoading ? "Generating..." : "2. Generate Invoice"}
            </Button>
          </div>
          
          {result && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">
                {result.type === "login" ? "Login Result:" : "Invoice Result:"}
              </h3>
              <pre className="text-sm overflow-auto">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Test Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Click "Login as Driver" first to authenticate</li>
            <li>Click "Generate Invoice" to test invoice creation</li>
            <li>Check the results below each action</li>
            <li>This bypasses React Query to test direct API calls</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}