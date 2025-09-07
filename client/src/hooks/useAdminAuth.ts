import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useAdminAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/admin-user"],
    queryFn: async () => {
      console.log("🔍 Admin auth: Checking authentication...");

      // Check with bypass token first (copy exact driver pattern)
      const bypassToken = localStorage.getItem('bypass-token');
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      
      if (bypassToken) {
        headers['x-bypass-token'] = bypassToken;
        console.log("🔑 Admin auth: Using bypass token");
      }

      const response = await fetch("/api/auth/admin-user", {
        credentials: "include",
        headers
      });
      
      console.log("🔍 Admin auth response:", response.status, response.statusText);
      
      if (!response.ok) {
        console.log("❌ Admin auth failed:", response.status);
        throw new Error("Not authenticated");
      }
      
      const data = await response.json();
      console.log("🔍 Admin auth data:", data);
      
      // Make sure we have the essential user data
      if (!data.id && !data.userId) {
        console.log("❌ Missing user ID in response");
        throw new Error("Invalid user data");
      }
      
      console.log("✅ Admin authenticated:", data);
      return data;
    },
    retry: false, // Don't retry to avoid confusion
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 2, // 2 minutes (copy driver pattern)
    gcTime: 0, // Don't cache authentication failures
  });

  const logout = async () => {
    try {
      await fetch("/api/auth/admin-logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
    
    // Clear all auth-related cache (copy driver pattern)
    queryClient.removeQueries({ queryKey: ["/api/auth/admin-user"] });
    queryClient.removeQueries({ queryKey: ["/api/auth/user"] });
    queryClient.removeQueries({ queryKey: ["/api/auth/driver-user"] });
    
    // Redirect to login
    window.location.href = "/admin-login";
  };

  // Clear redirect flag when user is authenticated (copy driver pattern)
  useEffect(() => {
    if (user && !error) {
      sessionStorage.removeItem('admin-redirecting');
    }
  }, [user, error]);

  const authResult = {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
    error,
    logout,
  };
  
  console.log("🔍 ADMIN AUTH HOOK RESULT:", authResult);
  
  return authResult;
}