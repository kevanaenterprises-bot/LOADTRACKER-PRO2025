import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  // CRITICAL FIX: Handle 304 (Not Modified) as success to prevent mobile errors
  if (!res.ok && res.status !== 304) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
): Promise<any> {
  // Use bypass token for driver portal access
  const headers: any = data ? { "Content-Type": "application/json" } : {};
  
  // TEMPORARY: Add bypass token for driver access until sessions are fixed
  // Check both localStorage and sessionStorage (for mobile compatibility)
  const useDriverBypass = localStorage.getItem('driver-bypass-mode') === 'true' || 
                          sessionStorage.getItem('driver-bypass-mode') === 'true';
  if (useDriverBypass) {
    headers['x-bypass-token'] = 'LOADTRACKER_BYPASS_2025';
  }
  
  console.log(`🔄 API Request: ${method} ${url}`);

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include", // This ensures cookies are sent
  });

  // CRITICAL FIX: Handle 304 for mutations (though less common)
  if (!res.ok && res.status !== 304) {
    const errorText = await res.text();
    console.error(`❌ API Error: ${res.status} ${errorText}`);
    throw new Error(`${res.status}: ${errorText}`);
  }
  
  // Handle 304 or successful response
  if (res.status === 304) {
    console.log(`✅ API Success (304 Not Modified): ${method} ${url}`);
    return {}; // Return empty object for 304
  }
  
  const result = await res.json();
  console.log(`✅ API Success: ${method} ${url}`);
  return result;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Check if driver bypass mode is enabled (both localStorage and sessionStorage for mobile)
    const useDriverBypass = localStorage.getItem('driver-bypass-mode') === 'true' || 
                            sessionStorage.getItem('driver-bypass-mode') === 'true';
    const headers: any = {};
    
    if (useDriverBypass) {
      headers['x-bypass-token'] = 'LOADTRACKER_BYPASS_2025';
    }
    
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include", // This ensures cookies are sent
      headers: useDriverBypass ? headers : undefined,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }
    
    // CRITICAL FIX: Handle 304 responses properly - return cached data
    if (res.status === 304) {
      // For 304, return the cached data or empty array
      return queryClient.getQueryData(queryKey as any) || [];
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5000, // 5 seconds - allows faster cache updates
      retry: false, // Disable retries to prevent infinite loops
    },
    mutations: {
      retry: false,
    },
  },
});
