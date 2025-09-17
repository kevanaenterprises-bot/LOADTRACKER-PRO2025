import { useMainAuth } from "@/hooks/useMainAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useQuery } from "@tanstack/react-query";

export default function QuickAuthTest() {
  const mainAuth = useMainAuth();
  const adminAuth = useAdminAuth();
  
  const { data: rawAdminCheck } = useQuery({
    queryKey: ["/api/auth/admin-user"],
    retry: false,
    refetchInterval: 1000,
  });

  return (
    <div className="p-8 bg-white">
      <h1 className="text-2xl font-bold mb-4">🔍 Authentication Debug</h1>
      
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded">
          <h3 className="font-semibold">Main Auth Status:</h3>
          <pre className="text-sm mt-2">{JSON.stringify(mainAuth, null, 2)}</pre>
        </div>
        
        <div className="bg-green-50 p-4 rounded">
          <h3 className="font-semibold">Admin Auth Status:</h3>
          <pre className="text-sm mt-2">{JSON.stringify(adminAuth, null, 2)}</pre>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded">
          <h3 className="font-semibold">Raw Admin Check:</h3>
          <pre className="text-sm mt-2">{JSON.stringify(rawAdminCheck, null, 2)}</pre>
        </div>
      </div>
      
      <div className="mt-6">
        <button
          onClick={() => window.location.href = "/dashboard"}
          className="bg-blue-500 text-white px-4 py-2 rounded mr-4"
        >
          Go to Dashboard
        </button>
        <button
          onClick={() => window.location.href = "/admin-login"}
          className="bg-gray-500 text-white px-4 py-2 rounded"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}