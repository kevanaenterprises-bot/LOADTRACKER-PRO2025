/**
 * Google Maps Script Loader
 * Dynamically loads Google Maps API and ensures it's ready for use
 */

let isGoogleMapsLoaded = false;
let isLoading = false;
let loadPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(): Promise<void> {
  // If already loaded, return resolved promise
  if (isGoogleMapsLoaded) {
    return Promise.resolve();
  }

  // If currently loading, return existing promise
  if (isLoading && loadPromise) {
    return loadPromise;
  }

  // Start loading
  isLoading = true;
  loadPromise = new Promise((resolve, reject) => {
    // Check if Google Maps is already available
    if (typeof window.google !== 'undefined' && window.google.maps) {
      isGoogleMapsLoaded = true;
      isLoading = false;
      resolve();
      return;
    }

    // Get API key from environment
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 
                   import.meta.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      reject(new Error('Google Maps API key not found. Please add GOOGLE_MAPS_API_KEY to your environment variables.'));
      return;
    }

    // Create script element
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;

    // Handle successful load
    script.onload = () => {
      isGoogleMapsLoaded = true;
      isLoading = false;
      console.log('✅ Google Maps API loaded successfully');
      resolve();
    };

    // Handle load error
    script.onerror = () => {
      isLoading = false;
      const error = new Error('Failed to load Google Maps API');
      console.error('❌ Google Maps API load failed');
      reject(error);
    };

    // Add script to document head
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Ensure Google Maps is loaded before using it
 */
export async function ensureGoogleMapsLoaded(): Promise<void> {
  try {
    await loadGoogleMapsScript();
    
    // Additional check to make sure the API is fully ready
    if (!window.google || !window.google.maps) {
      throw new Error('Google Maps API not properly loaded');
    }
  } catch (error) {
    console.error('Google Maps loading error:', error);
    throw error;
  }
}

// Types for window.google (fallback if @types/google.maps isn't working)
declare global {
  interface Window {
    google: any;
  }
}