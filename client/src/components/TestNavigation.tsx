import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function TestNavigation() {
  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Testing & Development Tools</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/invoice-test">
            <Button variant="outline" className="w-full justify-start">
              📊 Invoice Generation Test
            </Button>
          </Link>
          
          <Link href="/upload-test">
            <Button variant="outline" className="w-full justify-start">
              📁 Upload System Test
            </Button>
          </Link>
          
          <Link href="/quick-upload">
            <Button variant="outline" className="w-full justify-start">
              ⚡ Quick Upload Test
            </Button>
          </Link>
          
          <Link href="/driver-login">
            <Button variant="outline" className="w-full justify-start">
              🚛 Driver Portal Login
            </Button>
          </Link>
          
          <Link href="/admin-login">
            <Button variant="outline" className="w-full justify-start">
              👨‍💼 Admin Login
            </Button>
          </Link>
          
          <Link href="/">
            <Button variant="outline" className="w-full justify-start">
              🏠 Main Dashboard
            </Button>
          </Link>
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium mb-2">Quick Access Guide:</h4>
          <ul className="text-sm space-y-1">
            <li><strong>Invoice Test:</strong> Test automatic invoice generation when BOL/POD are uploaded</li>
            <li><strong>Upload Tests:</strong> Test file upload functionality step by step</li>
            <li><strong>Driver Portal:</strong> Login as driver (john_doe / 1234567890) to upload BOL documents</li>
            <li><strong>Admin:</strong> View generated invoices in the admin inbox</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}