import { useQuery } from "@tanstack/react-query";

export function useAdminAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/admin-user"],
    queryFn: async () => {
      const response = await fetch("/api/auth/admin-user", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Not authenticated");
      }
      return response.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
  };
}