import { sendSMSToDriver } from "./smsService";
import { storage } from "./storage";
import type { NotificationPreferences, User } from "@shared/schema";

type NotificationType = 'load_assignment' | 'status_reminder' | 'document_reminder' | 'delivery_alert' | 'emergency_alert' | 'test';

interface NotificationOptions {
  driverId: string;
  type: NotificationType;
  message: string;
  loadId?: string;
  urgent?: boolean; // Emergency alerts bypass quiet hours
}

export class NotificationService {
  async sendNotification(options: NotificationOptions): Promise<void> {
    try {
      console.log(`🔔 Sending notification to driver ${options.driverId}:`, options);
      
      // Get driver info
      const driver = await storage.getUser(options.driverId);
      if (!driver) {
        console.error(`❌ Driver not found: ${options.driverId}`);
        return;
      }

      // Get notification preferences
      let preferences = await storage.getNotificationPreferences(options.driverId);
      if (!preferences) {
        // Create default preferences if none exist
        preferences = await storage.createDefaultNotificationPreferences(options.driverId);
      }

      // Check if this type of notification is enabled
      if (!this.shouldSendNotification(preferences, options.type)) {
        console.log(`🔕 Notification type ${options.type} disabled for driver ${options.driverId}`);
        return;
      }

      // Check quiet hours (unless it's urgent/emergency)
      if (!options.urgent && preferences.enableQuietHours && this.isQuietHours(preferences)) {
        console.log(`🌙 Quiet hours active for driver ${options.driverId}, skipping non-urgent notification`);
        await this.logNotification(options, driver, 'skipped', 'Quiet hours active');
        return;
      }

      // Send via enabled methods
      const results: Array<{ method: string; success: boolean; error?: string }> = [];

      // SMS
      if (preferences.smsEnabled && driver.phoneNumber) {
        try {
          await sendSMSToDriver(driver.phoneNumber, options.message);
          results.push({ method: 'sms', success: true });
          await this.logNotification(options, driver, 'sent', undefined, 'sms');
        } catch (error: any) {
          console.error(`❌ SMS failed for driver ${options.driverId}:`, error);
          results.push({ method: 'sms', success: false, error: error.message });
          await this.logNotification(options, driver, 'failed', error.message, 'sms');
        }
      }

      // Email (placeholder for future implementation)
      if (preferences.emailEnabled && driver.email) {
        console.log(`📧 Email notifications not yet implemented for driver ${options.driverId}`);
        // TODO: Implement email service
      }

      // In-app notifications (placeholder for future implementation) 
      if (preferences.inAppEnabled) {
        console.log(`🔔 In-app notifications not yet implemented for driver ${options.driverId}`);
        // TODO: Implement real-time in-app notifications
      }

      console.log(`✅ Notification sent to driver ${options.driverId}:`, results);
    } catch (error) {
      console.error(`❌ Failed to send notification to driver ${options.driverId}:`, error);
    }
  }

  private shouldSendNotification(preferences: NotificationPreferences, type: NotificationType): boolean {
    switch (type) {
      case 'load_assignment':
        return preferences.loadAssignments ?? true;
      case 'status_reminder':
        return preferences.statusReminders ?? true;
      case 'document_reminder':
        return preferences.documentReminders ?? true;
      case 'delivery_alert':
        return preferences.deliveryAlerts ?? true;
      case 'emergency_alert':
        return preferences.emergencyAlerts ?? true;
      case 'test':
        return true; // Test notifications always send
      default:
        return false;
    }
  }

  private isQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.enableQuietHours) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = (preferences.quietHoursStart || '22:00').split(':').map(Number);
    const [endHour, endMin] = (preferences.quietHoursEnd || '06:00').split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 to 06:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime <= endTime;
    } else {
      return currentTime >= startTime && currentTime <= endTime;
    }
  }

  private async logNotification(
    options: NotificationOptions, 
    driver: User, 
    status: 'sent' | 'failed' | 'skipped',
    errorMessage?: string,
    method: 'sms' | 'email' | 'in_app' = 'sms'
  ): Promise<void> {
    try {
      await storage.logNotification({
        driverId: options.driverId,
        type: options.type,
        method,
        message: options.message,
        status,
        loadId: options.loadId,
        errorMessage,
      });
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }

  // Predefined notification templates
  async sendLoadAssignmentNotification(driverId: string, loadNumber: string, destination: string, loadId: string): Promise<void> {
    await this.sendNotification({
      driverId,
      type: 'load_assignment',
      message: `🚛 NEW LOAD ASSIGNED: ${loadNumber} to ${destination}. Check your driver portal for details.`,
      loadId,
    });
  }

  async sendStatusReminderNotification(driverId: string, loadNumber: string, loadId: string): Promise<void> {
    await this.sendNotification({
      driverId,
      type: 'status_reminder',
      message: `📍 Please update your status for load ${loadNumber}. Open your driver portal to update.`,
      loadId,
    });
  }

  async sendDocumentReminderNotification(driverId: string, loadNumber: string, loadId: string): Promise<void> {
    await this.sendNotification({
      driverId,
      type: 'document_reminder',
      message: `📄 Don't forget to upload your BOL for load ${loadNumber}. Use your driver portal to upload.`,
      loadId,
    });
  }

  async sendDeliveryAlertNotification(driverId: string, loadNumber: string, loadId: string): Promise<void> {
    await this.sendNotification({
      driverId,
      type: 'delivery_alert',
      message: `⏰ Delivery deadline approaching for load ${loadNumber}. Contact dispatch if you need assistance.`,
      loadId,
    });
  }

  async sendEmergencyNotification(driverId: string, message: string): Promise<void> {
    await this.sendNotification({
      driverId,
      type: 'emergency_alert',
      message: `🚨 URGENT: ${message}`,
      urgent: true, // Bypasses quiet hours
    });
  }

  async sendTestNotification(driverId: string): Promise<void> {
    const driver = await storage.getUser(driverId);
    const driverName = driver ? `${driver.firstName} ${driver.lastName}` : 'Driver';
    
    await this.sendNotification({
      driverId,
      type: 'test',
      message: `🔔 Test notification for ${driverName}. Your notification settings are working correctly! - GO 4 Farms & Cattle`,
    });
  }
}

export const notificationService = new NotificationService();

// Convenience function for routes
export async function sendTestNotification(driverId: string): Promise<void> {
  return notificationService.sendTestNotification(driverId);
}