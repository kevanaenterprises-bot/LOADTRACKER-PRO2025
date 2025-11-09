import { useMainAuth } from "@/hooks/useMainAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Play, 
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  FileText
} from "lucide-react";

interface TestRun {
  id: number;
  startedAt: string;
  completedAt: string | null;
  totalTests: number | null;
  passedTests: number | null;
  failedTests: number | null;
  status: string;
  aiAnalysis: string | null;
  alertsSent: boolean;
}

interface TestResult {
  id: number;
  testRunId: number;
  testName: string;
  status: string;
  errorMessage: string | null;
  duration: number | null;
  metadata: any;
}

export default function AdminTestDashboard() {
  const { user, isAuthenticated, isLoading, authType } = useMainAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch latest test run
  const { data: latestTest, isLoading: isLoadingLatest, isError: isErrorLatest, error: errorLatest } = useQuery<TestRun>({
    queryKey: ['/api/ai-testing/latest'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch test history
  const { data: testHistory, isLoading: isLoadingHistory, isError: isErrorHistory, error: errorHistory } = useQuery<TestRun[]>({
    queryKey: ['/api/ai-testing/history'],
  });

  // Manual test run mutation
  const runTestMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/ai-testing/run', 'POST');
    },
    onSuccess: () => {
      toast({
        title: "Tests Started",
        description: "AI testing suite is now running. This may take a few minutes.",
      });
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/ai-testing/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-testing/history'] });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed to Start",
        description: error.message || "Unable to start test run",
        variant: "destructive",
      });
    },
  });

  const handleLogout = async () => {
    try {
      if (authType === 'admin') {
        await fetch("/api/auth/admin-logout", {
          method: "POST",
          credentials: "include"
        });
      }
      setLocation("/");
    } catch (error) {
      setLocation("/");
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'passed':
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Passed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'running':
        return <Badge className="bg-blue-500"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Unknown</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Not Authenticated</h1>
          <Button onClick={() => setLocation("/")}>Go to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-blue-600">🤖 AI Testing Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setLocation("/dashboard")}
                data-testid="button-dashboard"
              >
                Main Dashboard
              </Button>
              <span className="text-sm font-medium text-gray-700">
                {user?.firstName} {user?.lastName}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLogout}
                data-testid="button-logout"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900">AI Testing Assistant</h2>
          <p className="text-gray-600 mt-2">
            Automated quality assurance running every 12 hours. Test critical workflows and catch bugs before users do.
          </p>
        </div>

        {/* Latest Test Results Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">Latest Test Run</CardTitle>
                <CardDescription>
                  {latestTest?.startedAt 
                    ? `Last run: ${new Date(latestTest.startedAt).toLocaleString()}`
                    : 'No tests run yet'}
                </CardDescription>
              </div>
              <Button
                onClick={() => runTestMutation.mutate()}
                disabled={runTestMutation.isPending || latestTest?.status === 'running'}
                data-testid="button-run-tests"
                className="bg-purple-600 hover:bg-purple-700"
              >
                {runTestMutation.isPending || latestTest?.status === 'running' ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Running Tests...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run Tests Now
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingLatest ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading test results...</p>
              </div>
            ) : isErrorLatest ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <div className="text-sm text-red-800">
                    <strong>Failed to load test results</strong>
                    <p className="mt-1">{errorLatest?.message || 'Unable to fetch latest test data'}</p>
                  </div>
                </div>
              </div>
            ) : latestTest ? (
              <div className="space-y-4">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {getStatusBadge(latestTest.status)}
                    <span className="text-sm text-gray-600">
                      Duration: {formatDuration(
                        latestTest.completedAt && latestTest.startedAt
                          ? new Date(latestTest.completedAt).getTime() - new Date(latestTest.startedAt).getTime()
                          : null
                      )}
                    </span>
                  </div>
                </div>

                {/* Test Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Total Tests</div>
                    <div className="text-2xl font-bold">{latestTest.totalTests ?? 0}</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-sm text-green-700 mb-1">Passed</div>
                    <div className="text-2xl font-bold text-green-600">{latestTest.passedTests ?? 0}</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="text-sm text-red-700 mb-1">Failed</div>
                    <div className="text-2xl font-bold text-red-600">{latestTest.failedTests ?? 0}</div>
                  </div>
                </div>

                {/* AI Analysis */}
                {latestTest.aiAnalysis && latestTest.failedTests && latestTest.failedTests > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-amber-900 mb-2">AI Analysis & Recommendations</h4>
                        <div className="text-sm text-amber-800 whitespace-pre-wrap">
                          {latestTest.aiAnalysis}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Success Message */}
                {latestTest.status === 'passed' && latestTest.failedTests === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <div className="text-sm text-green-800">
                        All tests passed successfully! Your system is operating normally.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>No test runs yet. Click "Run Tests Now" to start.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test History */}
        <Card>
          <CardHeader>
            <CardTitle>Test History</CardTitle>
            <CardDescription>Recent automated and manual test runs</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading history...</p>
              </div>
            ) : isErrorHistory ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <div className="text-sm text-red-800">
                    <strong>Failed to load test history</strong>
                    <p className="mt-1">{errorHistory?.message || 'Unable to fetch test history data'}</p>
                  </div>
                </div>
              </div>
            ) : testHistory && testHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Started</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Tests</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Duration</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testHistory.map((run) => (
                      <tr 
                        key={run.id} 
                        className="border-b hover:bg-gray-50"
                        data-testid={`test-run-${run.id}`}
                      >
                        <td className="py-3 px-4 text-sm">
                          {new Date(run.startedAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          {getStatusBadge(run.status)}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <span className="text-green-600 font-medium">{run.passedTests ?? 0}</span>
                          {' / '}
                          <span className="text-red-600 font-medium">{run.failedTests ?? 0}</span>
                          {' / '}
                          <span className="text-gray-600">{run.totalTests ?? 0}</span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {formatDuration(
                            run.completedAt && run.startedAt
                              ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
                              : null
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {run.alertsSent ? (
                            <Badge variant="outline" className="text-xs">
                              <FileText className="w-3 h-3 mr-1" />
                              Sent
                            </Badge>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No test history available.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <div className="bg-blue-500 rounded-full p-2">
                <RefreshCw className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-blue-900 mb-1">Automated Testing Schedule</h4>
                <p className="text-sm text-blue-800">
                  Tests run automatically every 12 hours to ensure system reliability. 
                  You'll receive email alerts if any critical issues are detected.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
