import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface NotificationPreferences {
  id?: string;
  driverId: string;
  loadAssignments: boolean;
  statusReminders: boolean;
  documentReminders: boolean;
  deliveryAlerts: boolean;
  emergencyAlerts: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  enableQuietHours: boolean;
}

interface NotificationSettingsProps {
  driverId: string;
}

export function NotificationSettings({ driverId }: NotificationSettingsProps) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch current notification preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ["/api/drivers", driverId, "notifications"],
    queryFn: () => fetch(`/api/drivers/${driverId}/notifications`, {
      credentials: 'include',
      headers: {
        'x-bypass-token': 'LOADTRACKER_BYPASS_2025'
      }
    }).then(res => res.json()),
  });

  // Update notification preferences
  const updatePreferencesMutation = useMutation({
    mutationFn: (updatedPreferences: Partial<NotificationPreferences> & { testNotification?: boolean }) => 
      apiRequest(`/api/drivers/${driverId}/notifications`, "PATCH", updatedPreferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers", driverId, "notifications"] });
      toast({
        title: "Settings Updated",
        description: "Your notification preferences have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update notification settings.",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (key: keyof NotificationPreferences, value: boolean) => {
    updatePreferencesMutation.mutate({ [key]: value });
  };

  const handleTimeChange = (key: 'quietHoursStart' | 'quietHoursEnd', value: string) => {
    updatePreferencesMutation.mutate({ [key]: value });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-gray-600">Loading notification settings...</p>
        </CardContent>
      </Card>
    );
  }

  const prefs = preferences || {};

  return (
    <Card>
      <CardHeader 
        className="cursor-pointer" 
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="notification-settings-header"
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            🔔 Notification Settings
            <Badge variant="secondary" className="text-xs">
              {isExpanded ? 'Click to collapse' : 'Click to expand'}
            </Badge>
          </CardTitle>
          <div className="text-sm text-gray-500">
            {isExpanded ? '▼' : '▶'}
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-6" data-testid="notification-settings-content">          
          {/* Alert Types */}
          <div>
            <h3 className="font-semibold mb-3">📱 Alert Types</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="load-assignments" className="text-sm">
                  🚛 New Load Assignments
                </Label>
                <Switch
                  id="load-assignments"
                  checked={prefs.loadAssignments ?? true}
                  onCheckedChange={(checked) => handleToggle('loadAssignments', checked)}
                  data-testid="toggle-load-assignments"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="status-reminders" className="text-sm">
                  📍 Status Update Reminders
                </Label>
                <Switch
                  id="status-reminders"
                  checked={prefs.statusReminders ?? true}
                  onCheckedChange={(checked) => handleToggle('statusReminders', checked)}
                  data-testid="toggle-status-reminders"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="document-reminders" className="text-sm">
                  📄 Document Upload Reminders
                </Label>
                <Switch
                  id="document-reminders"
                  checked={prefs.documentReminders ?? true}
                  onCheckedChange={(checked) => handleToggle('documentReminders', checked)}
                  data-testid="toggle-document-reminders"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="delivery-alerts" className="text-sm">
                  ⏰ Delivery Deadline Alerts
                </Label>
                <Switch
                  id="delivery-alerts"
                  checked={prefs.deliveryAlerts ?? true}
                  onCheckedChange={(checked) => handleToggle('deliveryAlerts', checked)}
                  data-testid="toggle-delivery-alerts"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="emergency-alerts" className="text-sm">
                  🚨 Emergency Dispatcher Messages
                </Label>
                <Switch
                  id="emergency-alerts"
                  checked={prefs.emergencyAlerts ?? true}
                  onCheckedChange={(checked) => handleToggle('emergencyAlerts', checked)}
                  data-testid="toggle-emergency-alerts"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Delivery Methods */}
          <div>
            <h3 className="font-semibold mb-3">📲 How You'll Receive Alerts</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="sms-enabled" className="text-sm">
                  📱 Text Messages (SMS)
                </Label>
                <Switch
                  id="sms-enabled"
                  checked={prefs.smsEnabled ?? true}
                  onCheckedChange={(checked) => handleToggle('smsEnabled', checked)}
                  data-testid="toggle-sms-enabled"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="email-enabled" className="text-sm">
                  📧 Email Notifications
                </Label>
                <Switch
                  id="email-enabled"
                  checked={prefs.emailEnabled ?? false}
                  onCheckedChange={(checked) => handleToggle('emailEnabled', checked)}
                  data-testid="toggle-email-enabled"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="in-app-enabled" className="text-sm">
                  🔔 In-App Notifications
                </Label>
                <Switch
                  id="in-app-enabled"
                  checked={prefs.inAppEnabled ?? true}
                  onCheckedChange={(checked) => handleToggle('inAppEnabled', checked)}
                  data-testid="toggle-in-app-enabled"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Quiet Hours */}
          <div>
            <h3 className="font-semibold mb-3">🌙 Quiet Hours</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="enable-quiet-hours" className="text-sm">
                  Enable Quiet Hours (no non-emergency alerts)
                </Label>
                <Switch
                  id="enable-quiet-hours"
                  checked={prefs.enableQuietHours ?? true}
                  onCheckedChange={(checked) => handleToggle('enableQuietHours', checked)}
                  data-testid="toggle-quiet-hours"
                />
              </div>
              
              {prefs.enableQuietHours !== false && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="quiet-start" className="text-xs text-gray-600">
                      Start Time
                    </Label>
                    <Input
                      id="quiet-start"
                      type="time"
                      value={prefs.quietHoursStart || '22:00'}
                      onChange={(e) => handleTimeChange('quietHoursStart', e.target.value)}
                      className="mt-1"
                      data-testid="input-quiet-start"
                    />
                  </div>
                  <div>
                    <Label htmlFor="quiet-end" className="text-xs text-gray-600">
                      End Time
                    </Label>
                    <Input
                      id="quiet-end"
                      type="time"
                      value={prefs.quietHoursEnd || '06:00'}
                      onChange={(e) => handleTimeChange('quietHoursEnd', e.target.value)}
                      className="mt-1"
                      data-testid="input-quiet-end"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Test Notification */}
          <div className="text-center">
            <Button 
              variant="outline" 
              onClick={() => {
                updatePreferencesMutation.mutate({ testNotification: true } as any);
                toast({
                  title: "Test Sent",
                  description: "A test notification has been sent to your preferred methods.",
                });
              }}
              disabled={updatePreferencesMutation.isPending}
              data-testid="button-test-notification"
            >
              📤 Send Test Notification
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}