import { useQuery } from "@tanstack/react-query";
import { useMainAuth } from "@/hooks/useMainAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Header } from "@/components/Header";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, AlertCircle, Clock } from "lucide-react";

interface AgingReportData {
  current: any[];
  days30: any[];
  days60: any[];
  days90plus: any[];
  totals: {
    current: number;
    days30: number;
    days60: number;
    days90plus: number;
    total: number;
  };
  byCustomer: Record<string, {
    customerName: string;
    current: number;
    days30: number;
    days60: number;
    days90plus: number;
    total: number;
  }>;
}

export default function AgingReport() {
  const { isAuthenticated, isLoading: authLoading } = useMainAuth();

  const { data: agingData, isLoading } = useQuery<AgingReportData>({
    queryKey: ["/api/reports/aging"],
    enabled: isAuthenticated && !authLoading,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto p-6">
          <Skeleton className="h-10 w-64 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900" data-testid="heading-aging-report">
            Accounts Receivable Aging Report
          </h1>
          <p className="text-gray-600 mt-2">
            Track unpaid invoices by age to manage collections effectively
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current (0-30)</CardTitle>
              <Clock className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="total-current">
                {formatCurrency(agingData?.totals.current || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {agingData?.current.length || 0} invoices
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">31-60 Days</CardTitle>
              <TrendingUp className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="total-31-60">
                {formatCurrency(agingData?.totals.days30 || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {agingData?.days30.length || 0} invoices
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">61-90 Days</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600" data-testid="total-61-90">
                {formatCurrency(agingData?.totals.days60 || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {agingData?.days60.length || 0} invoices
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">90+ Days</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600" data-testid="total-90-plus">
                {formatCurrency(agingData?.totals.days90plus || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {agingData?.days90plus.length || 0} invoices
              </p>
            </CardContent>
          </Card>

          <Card className="bg-primary text-primary-foreground">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
              <DollarSign className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="total-outstanding">
                {formatCurrency(agingData?.totals.total || 0)}
              </div>
              <p className="text-xs opacity-80">
                {(agingData?.current.length || 0) + 
                 (agingData?.days30.length || 0) + 
                 (agingData?.days60.length || 0) + 
                 (agingData?.days90plus.length || 0)} total invoices
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Breakdown by Customer */}
        <Card>
          <CardHeader>
            <CardTitle>Aging by Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Current (0-30)</TableHead>
                  <TableHead className="text-right">31-60 Days</TableHead>
                  <TableHead className="text-right">61-90 Days</TableHead>
                  <TableHead className="text-right">90+ Days</TableHead>
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agingData && Object.entries(agingData.byCustomer).map(([customerId, data]) => (
                  <TableRow key={customerId} data-testid={`row-customer-${customerId}`}>
                    <TableCell className="font-medium">{data.customerName}</TableCell>
                    <TableCell className="text-right text-green-600">
                      {data.current > 0 ? formatCurrency(data.current) : '-'}
                    </TableCell>
                    <TableCell className="text-right text-yellow-600">
                      {data.days30 > 0 ? formatCurrency(data.days30) : '-'}
                    </TableCell>
                    <TableCell className="text-right text-orange-600">
                      {data.days60 > 0 ? formatCurrency(data.days60) : '-'}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {data.days90plus > 0 ? formatCurrency(data.days90plus) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(data.total)}
                    </TableCell>
                  </TableRow>
                ))}
                {(!agingData || Object.keys(agingData.byCustomer).length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No unpaid invoices found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detail Tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* 90+ Days Detail */}
          {agingData && agingData.days90plus.length > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600">⚠️ 90+ Days Overdue</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingData.days90plus.map((invoice: any) => (
                      <TableRow key={invoice.invoiceId} data-testid={`invoice-90plus-${invoice.invoiceId}`}>
                        <TableCell>{invoice.invoiceNumber}</TableCell>
                        <TableCell>{invoice.customerName}</TableCell>
                        <TableCell className="text-right">{invoice.daysOld}</TableCell>
                        <TableCell className="text-right font-bold">
                          {formatCurrency(invoice.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* 61-90 Days Detail */}
          {agingData && agingData.days60.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader>
                <CardTitle className="text-orange-600">61-90 Days</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingData.days60.map((invoice: any) => (
                      <TableRow key={invoice.invoiceId} data-testid={`invoice-61-90-${invoice.invoiceId}`}>
                        <TableCell>{invoice.invoiceNumber}</TableCell>
                        <TableCell>{invoice.customerName}</TableCell>
                        <TableCell className="text-right">{invoice.daysOld}</TableCell>
                        <TableCell className="text-right font-bold">
                          {formatCurrency(invoice.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
