import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, 
  FileText, 
  MessageSquare, 
  Mail, 
  Database, 
  Headphones,
  DollarSign,
  AlertTriangle,
  TrendingUp
} from "lucide-react";

export default function UsageDashboard() {
  const { data: usage, isLoading } = useQuery({
    queryKey: ["/api/usage/current"],
  });

  const { data: subscription } = useQuery({
    queryKey: ["/api/subscription/current"],
  });

  if (isLoading || !usage || !subscription) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tier = (subscription as any).tier || {};
  const currentUsage = (usage as any).usage || {};
  const overages = (usage as any).overages || { overageCostCents: 0, overageCostDollars: "0.00", overages: {} };

  return (
    <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2" data-testid="heading-usage-dashboard">
            Usage Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400" data-testid="text-billing-period">
            Billing Period: {new Date((subscription as any).currentPeriodStart).toLocaleDateString()} - {new Date((subscription as any).currentPeriodEnd).toLocaleDateString()}
          </p>
          <Badge className="mt-2" variant={(subscription as any).status === "active" ? "default" : "destructive"} data-testid="badge-subscription-status">
            {tier.displayName} Plan • ${tier.monthlyPrice}/month
          </Badge>
        </div>

        {/* Overage Alert */}
        {overages.overageCostCents > 0 && (
          <Card className="mb-6 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20" data-testid="card-overage-alert">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-400">
                <AlertTriangle className="w-5 h-5" />
                Usage Overages Detected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    You've exceeded your plan limits. Overage charges will be added to your next invoice.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-overage-cost">
                    +${overages.overageCostDollars}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">overage charges</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Usage Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <UsageCard
            title="HERE Maps API"
            icon={<MapPin className="w-6 h-6 text-blue-600" />}
            current={currentUsage.here_maps}
            limit={tier.includedHereMapsTransactions}
            unit="transactions"
            overage={overages.overages.here_maps}
            overageCost={(overages.overages.here_maps * 0.75 / 1000).toFixed(2)}
            testId="here-maps"
          />

          <UsageCard
            title="Document AI OCR"
            icon={<FileText className="w-6 h-6 text-green-600" />}
            current={currentUsage.document_ai}
            limit={tier.includedDocumentAiScans}
            unit="scans"
            overage={overages.overages.document_ai}
            overageCost={(overages.overages.document_ai * 0.10).toFixed(2)}
            testId="document-ai"
          />

          <UsageCard
            title="SMS Messages"
            icon={<MessageSquare className="w-6 h-6 text-purple-600" />}
            current={currentUsage.sms}
            limit={tier.includedSmsMessages}
            unit="messages"
            overage={overages.overages.sms}
            overageCost={(overages.overages.sms * 0.004).toFixed(2)}
            testId="sms"
          />

          <UsageCard
            title="Email Delivery"
            icon={<Mail className="w-6 h-6 text-red-600" />}
            current={currentUsage.email}
            limit={tier.includedEmails}
            unit="emails"
            overage={overages.overages.email}
            overageCost={(overages.overages.email * 0.90 / 1000).toFixed(2)}
            testId="email"
          />

          <UsageCard
            title="Cloud Storage"
            icon={<Database className="w-6 h-6 text-indigo-600" />}
            current={(usage as any).storageGB || 0}
            limit={tier.includedStorageGB || 0}
            unit="GB"
            overage={Math.max(0, ((usage as any).storageGB || 0) - (tier.includedStorageGB || 0))}
            overageCost={(Math.max(0, ((usage as any).storageGB || 0) - (tier.includedStorageGB || 0)) * 0.02).toFixed(2)}
            testId="storage"
          />

          <UsageCard
            title="Road Tour (TTS)"
            icon={<Headphones className="w-6 h-6 text-orange-600" />}
            current={currentUsage.elevenlabs}
            limit={tier.includedElevenlabsCharacters}
            unit="characters"
            overage={overages.overages.elevenlabs}
            overageCost={(overages.overages.elevenlabs * 0.003 / 100).toFixed(2)}
            testId="elevenlabs"
          />
        </div>

        {/* Monthly Cost Summary */}
        <Card className="mt-8" data-testid="card-cost-summary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Monthly Cost Summary
            </CardTitle>
            <CardDescription>Breakdown of your current month's charges</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-4 border-b">
                <span className="text-gray-700 dark:text-gray-300">Base Plan ({tier.displayName})</span>
                <span className="font-semibold" data-testid="text-base-cost">${tier.monthlyPrice}</span>
              </div>
              
              {overages.overageCostCents > 0 && (
                <div className="flex justify-between items-center pb-4 border-b">
                  <div>
                    <span className="text-gray-700 dark:text-gray-300">Usage Overages</span>
                    <p className="text-xs text-gray-500">Charged at cost + $25 admin fee</p>
                  </div>
                  <span className="font-semibold text-orange-600 dark:text-orange-400" data-testid="text-overage-charges">
                    +${overages.overageCostDollars}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <span className="text-lg font-bold text-gray-900 dark:text-white">Estimated Total</span>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-estimated-total">
                  ${(parseFloat(tier.monthlyPrice) + parseFloat(overages.overageCostDollars)).toFixed(2)}
                </span>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-blue-800 dark:text-blue-400">Cost Savings</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Compared to $700/month competitors, you're saving <strong className="text-blue-600">${(700 - (parseFloat(tier.monthlyPrice) + parseFloat(overages.overageCostDollars))).toFixed(2)}/month</strong> ({Math.round(((700 - (parseFloat(tier.monthlyPrice) + parseFloat(overages.overageCostDollars))) / 700) * 100)}% savings)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface UsageCardProps {
  title: string;
  icon: React.ReactNode;
  current: number;
  limit: number;
  unit: string;
  overage: number;
  overageCost: string;
  testId: string;
}

function UsageCard({ title, icon, current, limit, unit, overage, overageCost, testId }: UsageCardProps) {
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isOverage = current > limit;

  return (
    <Card data-testid={`card-usage-${testId}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {isOverage && (
            <Badge variant="destructive" className="text-xs" data-testid={`badge-overage-${testId}`}>
              Overage
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600 dark:text-gray-400" data-testid={`text-current-${testId}`}>
                {current.toLocaleString()} {unit}
              </span>
              <span className="text-gray-500 dark:text-gray-500" data-testid={`text-limit-${testId}`}>
                {limit.toLocaleString()} included
              </span>
            </div>
            <Progress value={percentage} className="h-2" data-testid={`progress-${testId}`} />
            <p className="text-xs text-gray-500 mt-1">
              {percentage.toFixed(0)}% used
            </p>
          </div>

          {isOverage && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded p-2 border border-red-200 dark:border-red-800">
              <p className="text-xs text-red-800 dark:text-red-400" data-testid={`text-overage-detail-${testId}`}>
                <strong>{overage.toLocaleString()}</strong> over limit
              </p>
              <p className="text-xs text-red-600 dark:text-red-500 mt-1" data-testid={`text-overage-cost-${testId}`}>
                +${overageCost} overage charge
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
