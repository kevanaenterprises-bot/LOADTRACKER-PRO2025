import { useQuery } from "@tanstack/react-query";

export function useDriverAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/driver-user"],
    queryFn: async () => {
      const response = await fetch("/api/auth/driver-user", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Not authenticated");
      }
      return response.json();
    },
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
  };
}