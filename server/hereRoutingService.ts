// HERE Maps Routing Service for IFTA state-by-state mileage breakdown

interface StateMileage {
  [stateCode: string]: number; // Miles by state
}

interface RouteAnalysis {
  totalMiles: number;
  milesByState: StateMileage;
  duration: number; // seconds
}

interface HERESpan {
  offset: number;
  length: number; // meters
  stateCode?: string;
  countryCode?: string;
  truckAttributes?: string[];
}

/**
 * Get truck route with state-by-state mileage breakdown using HERE Maps API
 * @param originLat Origin latitude
 * @param originLng Origin longitude
 * @param destLat Destination latitude
 * @param destLng Destination longitude
 * @returns Route analysis with state-by-state mileage
 */
export async function getTruckRouteWithStateMileage(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<RouteAnalysis | null> {
  try {
    const apiKey = process.env.HERE_API_KEY;
    if (!apiKey) {
      console.error("❌ HERE_API_KEY not configured");
      return null;
    }

    const origin = `${originLat},${originLng}`;
    const destination = `${destLat},${destLng}`;

    // Build HERE Maps API v8 truck routing request with spans for state-by-state breakdown
    const url = new URL("https://router.hereapi.com/v8/routes");
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    url.searchParams.set("transportMode", "truck");
    url.searchParams.set("routingMode", "fast");
    url.searchParams.set("units", "imperial");
    url.searchParams.set("return", "summary,polyline");
    url.searchParams.set("spans", "stateCode,length,truckAttributes"); // Key parameter for state breakdown
    url.searchParams.set("truck[trailerCount]", "1"); // Standard truck with trailer

    console.log(`🗺️  Calling HERE Maps API for route: ${origin} -> ${destination}`);

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ HERE Maps API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      console.error("❌ No routes found in HERE Maps response");
      return null;
    }

    const route = data.routes[0];
    const section = route.sections[0];
    const spans: HERESpan[] = section.spans || [];

    // Aggregate mileage by state
    const stateMileage: StateMileage = {};
    let totalMeters = 0;

    spans.forEach((span) => {
      if (span.stateCode && span.length) {
        const state = span.stateCode;
        const miles = span.length / 1609.34; // Convert meters to miles

        stateMileage[state] = (stateMileage[state] || 0) + miles;
        totalMeters += span.length;
      }
    });

    // Get total from summary (more accurate than sum of spans)
    const totalMiles = section.summary.length / 1609.34;
    const duration = section.summary.duration; // seconds

    console.log(`✅ HERE Maps route calculated:`);
    console.log(`   Total: ${totalMiles.toFixed(1)} miles`);
    console.log(`   Duration: ${(duration / 3600).toFixed(1)} hours`);
    console.log(`   State breakdown:`, stateMileage);

    return {
      totalMiles: parseFloat(totalMiles.toFixed(1)),
      milesByState: Object.fromEntries(
        Object.entries(stateMileage).map(([state, miles]) => [
          state,
          parseFloat(miles.toFixed(1))
        ])
      ),
      duration
    };
  } catch (error) {
    console.error("❌ Error calling HERE Maps API:", error);
    return null;
  }
}

/**
 * Get state-by-state mileage for a load based on its stops
 * Falls back to delivery location if no pickup location is available
 * @param load Load with pickup and delivery locations
 * @returns Route analysis or null if unable to calculate
 */
export async function getLoadStateMileage(load: any): Promise<RouteAnalysis | null> {
  try {
    // Need both pickup and delivery coordinates
    const hasPickup = load.shipperLatitude && load.shipperLongitude;
    const hasDelivery = load.receiverLatitude && load.receiverLongitude;

    if (!hasPickup || !hasDelivery) {
      console.log(`⚠️  Load ${load.number109} missing coordinates for route calculation`);
      return null;
    }

    const originLat = parseFloat(load.shipperLatitude);
    const originLng = parseFloat(load.shipperLongitude);
    const destLat = parseFloat(load.receiverLatitude);
    const destLng = parseFloat(load.receiverLongitude);

    return await getTruckRouteWithStateMileage(originLat, originLng, destLat, destLng);
  } catch (error) {
    console.error(`❌ Error getting state mileage for load ${load.number109}:`, error);
    return null;
  }
}
