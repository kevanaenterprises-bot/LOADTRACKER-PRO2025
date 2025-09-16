import { db } from "./db";
import { loads } from "@shared/schema";
import { eq } from "drizzle-orm";

// GPS tracking service for automatic status updates
export class GPSService {
  // Distance threshold in meters for determining location proximity
  private static readonly LOCATION_THRESHOLD = 150; // 150 meters

  // Calculate distance between two GPS coordinates using Haversine formula
  static calculateDistance(
    lat1: number, 
    lon1: number, 
    lat2: number, 
    lon2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.degreesToRadians(lat2 - lat1);
    const dLon = this.degreesToRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degreesToRadians(lat1)) * Math.cos(this.degreesToRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }

  private static degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Geocode address to get GPS coordinates (simplified - in production use Google Maps API)
  static async geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
    try {
      // For now, return null - in production, integrate with Google Maps Geocoding API
      // This would require the user to provide a Google Maps API key
      console.log(`Would geocode address: ${address}`);
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  // Update load status based on GPS location
  static async updateLoadStatus(
    loadId: string, 
    currentLat: number, 
    currentLon: number
  ): Promise<void> {
    try {
      // Get current load info
      const [load] = await db.select().from(loads).where(eq(loads.id, loadId));
      if (!load || !load.trackingEnabled) {
        return;
      }

      let newStatus = load.status;
      const now = new Date();

      // Check proximity to shipper location
      if (load.shipperLatitude && load.shipperLongitude) {
        const distanceToShipper = this.calculateDistance(
          currentLat,
          currentLon,
          parseFloat(load.shipperLatitude.toString()),
          parseFloat(load.shipperLongitude.toString())
        );

        if (distanceToShipper <= this.LOCATION_THRESHOLD) {
          if (load.status === 'confirmed' || load.status === 'en_route_pickup') {
            newStatus = 'at_shipper';
          }
        } else {
          // If driver was at shipper but is now away, they've left
          if (load.status === 'at_shipper') {
            newStatus = 'left_shipper';
          }
        }
      }

      // Check proximity to receiver location
      if (load.receiverLatitude && load.receiverLongitude) {
        const distanceToReceiver = this.calculateDistance(
          currentLat,
          currentLon,
          parseFloat(load.receiverLatitude.toString()),
          parseFloat(load.receiverLongitude.toString())
        );

        if (distanceToReceiver <= this.LOCATION_THRESHOLD) {
          if (load.status === 'left_shipper' || load.status === 'en_route_receiver') {
            newStatus = 'at_receiver';
          }
        }
      }

      // Determine en route status based on previous status and location
      if (load.status === 'confirmed' && newStatus === 'confirmed') {
        // Driver is moving but not at locations yet
        newStatus = 'en_route_pickup';
      } else if (load.status === 'left_shipper' && newStatus !== 'at_receiver') {
        newStatus = 'en_route_receiver';
      }

      // Update database if status changed
      if (newStatus !== load.status) {
        const updateData: any = {
          status: newStatus,
          currentLatitude: currentLat.toString(),
          currentLongitude: currentLon.toString(),
          updatedAt: now,
        };

        // Add timestamp for specific status
        switch (newStatus) {
          case 'en_route_pickup':
            updateData.enRoutePickupAt = now;
            break;
          case 'at_shipper':
            updateData.atShipperAt = now;
            break;
          case 'left_shipper':
            updateData.leftShipperAt = now;
            break;
          case 'en_route_receiver':
            updateData.enRouteReceiverAt = now;
            break;
          case 'at_receiver':
            updateData.atReceiverAt = now;
            break;
        }

        await db.update(loads)
          .set(updateData)
          .where(eq(loads.id, loadId));

        console.log(`Load ${loadId} status updated from ${load.status} to ${newStatus}`);
      } else {
        // Just update the current location
        await db.update(loads)
          .set({
            currentLatitude: currentLat.toString(),
            currentLongitude: currentLon.toString(),
            updatedAt: now,
          })
          .where(eq(loads.id, loadId));
      }
    } catch (error) {
      console.error('Error updating load status:', error);
    }
  }

  // Set up geocoded locations for a load
  static async setupLoadLocations(loadId: string): Promise<void> {
    try {
      const [load] = await db.select().from(loads).where(eq(loads.id, loadId));
      if (!load) {
        return;
      }

      let updateData: any = {};

      // Geocode pickup address
      if (load.pickupAddress && !load.shipperLatitude) {
        const pickupCoords = await this.geocodeAddress(load.pickupAddress);
        if (pickupCoords) {
          updateData.shipperLatitude = pickupCoords.latitude.toString();
          updateData.shipperLongitude = pickupCoords.longitude.toString();
        }
      }

      // Geocode delivery address
      if (load.deliveryAddress && !load.receiverLatitude) {
        const deliveryCoords = await this.geocodeAddress(load.deliveryAddress);
        if (deliveryCoords) {
          updateData.receiverLatitude = deliveryCoords.latitude.toString();
          updateData.receiverLongitude = deliveryCoords.longitude.toString();
        }
      }

      // Update load with geocoded coordinates
      if (Object.keys(updateData).length > 0) {
        await db.update(loads)
          .set(updateData)
          .where(eq(loads.id, loadId));
      }
    } catch (error) {
      console.error('Error setting up load locations:', error);
    }
  }
}