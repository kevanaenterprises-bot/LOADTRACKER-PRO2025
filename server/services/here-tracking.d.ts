declare module '@here/tracking-js' {
  interface TrackingConfig {
    apiKey: string;
    environment: 'production' | 'staging';
  }

  interface DeviceConfig {
    deviceId: string;
    name: string;
    description?: string;
    licenseId?: string;
  }

  interface GeofenceGeometry {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  }

  interface GeofenceConfig {
    name: string;
    description?: string;
    geometry: GeofenceGeometry;
    radius: number;
  }

  interface Position {
    lat: number;
    lng: number;
    timestamp: Date;
  }

  interface TelemetryData {
    deviceId: string;
    position: Position;
  }

  interface WebhookConfig {
    url: string;
    events: string[];
  }

  class Tracking {
    constructor(config: TrackingConfig);
    devices: {
      create(config: DeviceConfig): Promise<any>;
    };
    geofences: {
      create(config: GeofenceConfig): Promise<any>;
      delete(geofenceId: string): Promise<void>;
    };
    telemetry: {
      send(data: TelemetryData): Promise<void>;
    };
    notifications: {
      webhooks: {
        list(): Promise<any[]>;
        create(config: WebhookConfig): Promise<any>;
      };
    };
  }

  export default Tracking;
}
