import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useDriverAuth() {
  const queryClient = useQueryClient();
  
  // Add timeout for infinite loading issues
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log("🚨 Authentication timeout - forcing redirect to login");
      window.location.replace('/driver-login');
    }, 5000); // 5 second timeout
    
    return () => clearTimeout(timer);
  }, []);
  
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/driver-user"],
    queryFn: async () => {
      // Get bypass token if available (like the dashboard does)
      let bypassToken = localStorage.getItem('bypass-token');
      if (!bypassToken) {
        try {
          const authResponse = await fetch("/api/auth/browser-bypass", {
            method: "POST",
            credentials: "include",
          });
          if (authResponse.ok) {
            const authData = await authResponse.json();
            bypassToken = authData.token;
            if (bypassToken) {
              localStorage.setItem('bypass-token', bypassToken);
            }
          }
        } catch (error) {
          // Silent fail - will use normal authentication
        }
      }

      const headers: any = { "Content-Type": "application/json" };
      if (bypassToken) {
        headers['X-Bypass-Token'] = bypassToken;
      }

      const response = await fetch("/api/auth/driver-user", {
        credentials: "include",
        headers,
      });
      
      if (!response.ok) {
        throw new Error("Not authenticated");
      }
      
      const data = await response.json();
      
      // Check if we need to redirect to login
      if (data.requiresLogin) {
        console.log("🔀 Driver auth requires login - redirecting immediately");
        // Use replace to prevent back button issues
        window.location.replace('/driver-login');
        return null; // Return null instead of throwing to prevent error state
      }
      
      return data;
    },
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    cacheTime: 0, // Don't cache authentication failures
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

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
    logout,
  };
}