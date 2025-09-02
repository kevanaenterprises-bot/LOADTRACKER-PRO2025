import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useDriverAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/driver-user"],
    queryFn: async () => {
      console.log("🔍 Driver auth: Checking authentication...");

      // For driver auth, check session FIRST before trying bypass token
      const response = await fetch("/api/auth/driver-user", {
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      console.log("🔍 Driver auth response:", response.status, response.statusText);
      
      if (!response.ok) {
        console.log("❌ Driver auth failed:", response.status);
        throw new Error("Not authenticated");
      }
      
      const data = await response.json();
      console.log("🔍 Driver auth data:", data);
      
      // Check if we need to redirect to login
      if (data.requiresLogin) {
        console.log("🔀 Driver auth requires login");
        throw new Error("Requires login");
      }
      
      console.log("✅ Driver authenticated:", data);
      return data;
    },
    retry: 1, // Retry once in case of race condition
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 0, // Don't cache authentication failures
    retryDelay: 1000, // Wait 1 second before retry
  });

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
    
    // Clear all auth-related cache
    queryClient.removeQueries({ queryKey: ["/api/auth/driver-user"] });
    queryClient.removeQueries({ queryKey: ["/api/auth/user"] });
    queryClient.removeQueries({ queryKey: ["/api/auth/admin-user"] });
    
    // Redirect to login
    window.location.href = "/driver-login";
  };

  // Clear redirect flag when user is authenticated
  useEffect(() => {
    if (user && !error) {
      sessionStorage.removeItem('driver-redirecting');
    }
  }, [user, error]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
    logout,
  };
}