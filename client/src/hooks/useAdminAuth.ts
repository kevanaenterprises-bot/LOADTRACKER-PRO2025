import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useAdminAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/admin-user"],
    queryFn: () => apiRequest("/api/auth/admin-user", "GET"),
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}