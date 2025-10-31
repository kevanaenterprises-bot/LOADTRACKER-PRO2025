import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, CheckCircle, Truck, MapPin, Calendar, DollarSign, Info } from "lucide-react";
import { format } from "date-fns";

interface LoadRightTender {
  id: string;
  loadNumber: string;
  customer: string | null;
  pickupLocation: string;
  pickupCity: string | null;
  pickupState: string | null;
  deliveryLocation: string;
  deliveryCity: string | null;
  deliveryState: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  rate: string | null;
  miles: string | null;
  status: string;
  loadId: string | null;
  syncedAt: string;
  acceptedAt: string | null;
}

export default function LoadRightTenders() {
  const { toast } = useToast();
  const [sessionCookie, setSessionCookie] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: tenders, isLoading, error } = useQuery<LoadRightTender[]>({
    queryKey: ["/api/loadright/tenders"],
  });

  const syncMutation = useMutation({
    mutationFn: async (cookie: string) => {
      const response = await apiRequest("/api/loadright/sync", "POST", { sessionCookie: cookie });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/loadright/tenders"] });
      setDialogOpen(false);
      toast({
        title: "Sync Complete",
        description: `Successfully synced ${data.count} tender(s) from LoadRight`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync LoadRight tenders",
        variant: "destructive",
      });
    },
  });

  const handleSync = () => {
    if (!sessionCookie.trim()) {
      toast({
        title: "Session Cookie Required",
        description: "Please enter your LoadRight session cookie",
        variant: "destructive",
      });
      return;
    }
    syncMutation.mutate(sessionCookie);
  };

  const acceptMutation = useMutation({
    mutationFn: async (tenderId: string) => {
      return apiRequest(`/api/loadright/accept/${tenderId}`, 'POST', {});
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/loadright/tenders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loads"] });
      toast({
        title: "Tender Accepted",
        description: `Load ${data.load.number109} created successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Accept Failed",
        description: error.message || "Failed to accept tender",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (tenderId: string) => {
      return apiRequest(`/api/loadright/reject/${tenderId}`, 'POST', { reason: 'Not available' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loadright/tenders"] });
      toast({
        title: "Tender Rejected",
        description: "Tender has been rejected",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reject Failed",
        description: error.message || "Failed to reject tender",
        variant: "destructive",
      });
    },
  });

  const pendingTenders = tenders?.filter(t => t.status === 'tendered') || [];
  const acceptedTenders = tenders?.filter(t => t.status === 'accepted') || [];
  const rejectedTenders = tenders?.filter(t => t.status === 'rejected') || [];

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">LoadRight Tenders</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-page-description">
            View and accept tendered loads from LoadRight portal
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-open-sync-dialog">
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync LoadRight
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Sync LoadRight Tenders</DialogTitle>
              <DialogDescription>
                Log in to LoadRight manually, then paste your session cookie here
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold">How to get your session cookie:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Open carrierportal.loadright.com in a new tab</li>
                      <li>Log in with your credentials</li>
                      <li>Press F12 to open Developer Tools (or Option+Cmd+I on Mac)</li>
                      <li>Go to "Application" tab (Chrome) or "Storage" tab (Safari/Firefox)</li>
                      <li>Click "Cookies" → "carrierportal.loadright.com"</li>
                      <li>Find the cookie named <strong>"LspAuthCtxPortal"</strong></li>
                      <li>Widen the "Value" column to see the full value</li>
                      <li>Double-click the value to select it, then copy (Cmd+C / Ctrl+C)</li>
                      <li>Paste it below</li>
                    </ol>
                    <p className="text-muted-foreground text-xs mt-2">
                      💡 Tip: Chrome's DevTools are easier to use than Safari's. Consider using Chrome for this step.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="session-cookie">Session Cookie (LspAuthCtxPortal)</Label>
                <Textarea
                  id="session-cookie"
                  placeholder="Paste the full LspAuthCtxPortal cookie value here..."
                  value={sessionCookie}
                  onChange={(e) => setSessionCookie(e.target.value)}
                  rows={4}
                  data-testid="input-session-cookie"
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setDialogOpen(false)}
                  data-testid="button-cancel-sync"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSync}
                  disabled={syncMutation.isPending}
                  data-testid="button-sync-loadright"
                >
                  {syncMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12" data-testid="loading-tenders">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading tenders...</span>
        </div>
      ) : error ? (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive" data-testid="text-error">
              Failed to load tenders: {(error as Error).message}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tendered Loads */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold" data-testid="text-pending-header">
              Tendered Loads ({pendingTenders.length})
            </h2>
            
            {pendingTenders.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground" data-testid="text-no-pending">
                  No tendered loads. Click "Sync LoadRight" to check for new loads.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {pendingTenders.map((tender) => (
                  <Card key={tender.id} data-testid={`card-tender-${tender.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2" data-testid={`text-load-number-${tender.id}`}>
                            <Truck className="h-5 w-5" />
                            {tender.loadNumber}
                          </CardTitle>
                          {tender.customer && (
                            <CardDescription data-testid={`text-customer-${tender.id}`}>
                              {tender.customer}
                            </CardDescription>
                          )}
                        </div>
                        <Badge variant="outline" data-testid={`badge-status-${tender.id}`}>
                          Tendered
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Route Information */}
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-green-600 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium" data-testid={`text-pickup-${tender.id}`}>Pickup</p>
                            <p className="text-sm text-muted-foreground">
                              {tender.pickupLocation}
                            </p>
                            {(tender.pickupCity || tender.pickupState) && (
                              <p className="text-sm text-muted-foreground">
                                {[tender.pickupCity, tender.pickupState].filter(Boolean).join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-red-600 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium" data-testid={`text-delivery-${tender.id}`}>Delivery</p>
                            <p className="text-sm text-muted-foreground">
                              {tender.deliveryLocation}
                            </p>
                            {(tender.deliveryCity || tender.deliveryState) && (
                              <p className="text-sm text-muted-foreground">
                                {[tender.deliveryCity, tender.deliveryState].filter(Boolean).join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Load Details */}
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                        {tender.pickupDate && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">Pickup Date</p>
                              <p className="text-sm font-medium" data-testid={`text-pickup-date-${tender.id}`}>
                                {format(new Date(tender.pickupDate), 'MMM dd, yyyy')}
                              </p>
                            </div>
                          </div>
                        )}
                        {tender.rate && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">Rate</p>
                              <p className="text-sm font-medium" data-testid={`text-rate-${tender.id}`}>
                                ${parseFloat(tender.rate).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        )}
                        {tender.miles && (
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">Miles</p>
                              <p className="text-sm font-medium" data-testid={`text-miles-${tender.id}`}>
                                {parseInt(tender.miles).toLocaleString()} mi
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="default"
                          onClick={() => acceptMutation.mutate(tender.id)}
                          disabled={acceptMutation.isPending || rejectMutation.isPending}
                          data-testid={`button-accept-${tender.id}`}
                        >
                          {acceptMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Accepting...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Accept
                            </>
                          )}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => rejectMutation.mutate(tender.id)}
                          disabled={acceptMutation.isPending || rejectMutation.isPending}
                          data-testid={`button-reject-${tender.id}`}
                        >
                          {rejectMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Rejecting...
                            </>
                          ) : (
                            'Reject'
                          )}
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground text-center" data-testid={`text-synced-${tender.id}`}>
                        Synced {format(new Date(tender.syncedAt), 'MMM dd, yyyy h:mm a')}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Accepted Tenders */}
          {acceptedTenders.length > 0 && (
            <div className="space-y-4 mt-8">
              <h2 className="text-xl font-semibold" data-testid="text-accepted-header">
                Accepted Tenders ({acceptedTenders.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {acceptedTenders.map((tender) => (
                  <Card key={tender.id} className="opacity-60" data-testid={`card-accepted-${tender.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Truck className="h-5 w-5" />
                            {tender.loadNumber}
                          </CardTitle>
                          {tender.customer && (
                            <CardDescription>{tender.customer}</CardDescription>
                          )}
                        </div>
                        <Badge className="bg-green-600">Accepted</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-green-600 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm">{tender.pickupLocation}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-red-600 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm">{tender.deliveryLocation}</p>
                          </div>
                        </div>
                      </div>
                      {tender.acceptedAt && (
                        <p className="text-xs text-muted-foreground text-center mt-4">
                          Accepted {format(new Date(tender.acceptedAt), 'MMM dd, yyyy h:mm a')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
