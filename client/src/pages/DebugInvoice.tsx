import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function DebugInvoice() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const testDirectAPI = async () => {
    setIsLoading(true);
    setLogs([]);
    
    try {
      addLog("Testing direct API call to invoice generation...");
      
      const response = await fetch("/api/loads/5e48ebca-3a18-4c4c-b09e-c8f8cc3c6bf1/generate-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
        credentials: "include",
      });
      
      addLog(`Response status: ${response.status}`);
      addLog(`Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);
      
      const responseText = await response.text();
      addLog(`Response text: ${responseText}`);
      
      if (response.ok) {
        const data = JSON.parse(responseText);
        toast({
          title: "Success!",
          description: `Invoice ${data.invoiceNumber} generated for $${data.totalAmount}`,
        });
        addLog(`SUCCESS: Invoice generated - ${data.invoiceNumber}`);
      } else {
        toast({
          title: "Failed",
          description: `Error ${response.status}: ${responseText}`,
          variant: "destructive",
        });
        addLog(`FAILED: ${response.status} - ${responseText}`);
      }
    } catch (error: any) {
      addLog(`EXCEPTION: ${error.message}`);
      toast({
        title: "Exception",
        description: error.message,
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };

  const testWithSession = async () => {
    setIsLoading(true);
    setLogs([]);
    
    try {
      // First login
      addLog("Step 1: Logging in as driver...");
      const loginResponse = await fetch("/api/driver/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "john_doe", password: "1234567890" }),
        credentials: "include",
      });
      
      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        addLog(`Login successful: ${loginData.user.firstName} ${loginData.user.lastName}`);
        
        // Then try invoice generation
        addLog("Step 2: Generating invoice...");
        const invoiceResponse = await fetch("/api/loads/5e48ebca-3a18-4c4c-b09e-c8f8cc3c6bf1/generate-invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          credentials: "include",
        });
        
        addLog(`Invoice response status: ${invoiceResponse.status}`);
        const invoiceText = await invoiceResponse.text();
        addLog(`Invoice response: ${invoiceText}`);
        
        if (invoiceResponse.ok) {
          const invoiceData = JSON.parse(invoiceText);
          toast({
            title: "Success with Session!",
            description: `Invoice ${invoiceData.invoiceNumber} generated`,
          });
        } else {
          toast({
            title: "Failed with Session",
            description: `Error: ${invoiceText}`,
            variant: "destructive",
          });
        }
      } else {
        const loginError = await loginResponse.text();
        addLog(`Login failed: ${loginError}`);
        toast({
          title: "Login Failed",
          description: loginError,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      addLog(`EXCEPTION: ${error.message}`);
      toast({
        title: "Exception",
        description: error.message,
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Debug Invoice Generation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={testDirectAPI}
              disabled={isLoading}
              variant="outline"
            >
              {isLoading ? "Testing..." : "Test Direct API Call"}
            </Button>
            
            <Button
              onClick={testWithSession}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? "Testing..." : "Test With Login Session"}
            </Button>
          </div>
          
          <div className="mt-6">
            <h3 className="font-semibold mb-2">Debug Logs:</h3>
            <div className="bg-black text-green-400 p-4 rounded-lg max-h-96 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="text-gray-500">No logs yet - click a test button above</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="font-mono text-sm mb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}