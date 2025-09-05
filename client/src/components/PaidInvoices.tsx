import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { HelpButton, TruckerTip } from "@/components/HelpTooltip";
import { PrintButton } from "@/components/PrintButton";
import { cn } from "@/lib/utils";

export function PaidInvoices() {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [sortBy, setSortBy] = useState<"date" | "amount" | "customer">("date");

  // Fetch paid loads
  const { data: paidLoads = [], isLoading } = useQuery({
    queryKey: ["/api/loads", { status: "paid" }],
    queryFn: async () => {
      const response = await fetch("/api/loads?status=paid");
      if (!response.ok) throw new Error("Failed to fetch paid loads");
      return response.json();
    },
  });

  // Fetch invoices for paid loads
  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ["/api/invoices"],
  });

  // Filter and sort logic
  const filteredLoads = (paidLoads as any[]).filter((load: any) => {
    // Search filter
    if (searchTerm && !load.number109.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !load.driver?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !load.driver?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !load.location?.name?.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Date range filter
    if (dateRange.from && load.paidAt) {
      const paidDate = new Date(load.paidAt);
      if (paidDate < dateRange.from) return false;
    }
    if (dateRange.to && load.paidAt) {
      const paidDate = new Date(load.paidAt);
      if (paidDate > dateRange.to) return false;
    }

    return true;
  });

  // Sort the filtered loads
  const sortedLoads = [...filteredLoads].sort((a: any, b: any) => {
    switch (sortBy) {
      case "date":
        return new Date(b.paidAt || 0).getTime() - new Date(a.paidAt || 0).getTime();
      case "amount":
        const aInvoice = invoices.find((inv: any) => inv.loadId === a.id);
        const bInvoice = invoices.find((inv: any) => inv.loadId === b.id);
        return (bInvoice?.totalAmount || 0) - (aInvoice?.totalAmount || 0);
      case "customer":
        const aCustomer = a.customer?.name || "";
        const bCustomer = b.customer?.name || "";
        return aCustomer.localeCompare(bCustomer);
      default:
        return 0;
    }
  });

  // Calculate totals
  const totalAmount = sortedLoads.reduce((sum: number, load: any) => {
    const invoice = invoices.find((inv: any) => inv.loadId === load.id);
    return sum + (invoice?.totalAmount || 0);
  }, 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center">Loading paid invoices...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Paid Invoices</CardTitle>
            <HelpButton 
              content="This section shows all completed loads that have been paid. You can search, filter by date, and export reports."
            />
          </div>
          <div className="text-sm text-gray-600">
            Total: ${totalAmount.toFixed(2)} ({sortedLoads.length} loads)
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters Section */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap gap-4">
            {/* Search Input */}
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by load #, driver, or destination..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Date Range Picker */}
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? format(dateRange.from, "PPP") : "From date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => setDateRange({ ...dateRange, from: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !dateRange.to && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.to ? format(dateRange.to, "PPP") : "To date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => setDateRange({ ...dateRange, to: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {(dateRange.from || dateRange.to) && (
                <Button
                  variant="ghost"
                  onClick={() => setDateRange({ from: undefined, to: undefined })}
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Sort Dropdown */}
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Sort by Date</SelectItem>
                <SelectItem value="amount">Sort by Amount</SelectItem>
                <SelectItem value="customer">Sort by Customer</SelectItem>
              </SelectContent>
            </Select>

            {/* Export Button */}
            <Button
              variant="outline"
              onClick={() => {
                // TODO: Implement CSV export
                const csvContent = [
                  ["Load #", "Driver", "Customer", "Destination", "Amount", "Paid Date"],
                  ...sortedLoads.map((load: any) => {
                    const invoice = invoices.find((inv: any) => inv.loadId === load.id);
                    return [
                      load.number109,
                      `${load.driver?.firstName || ""} ${load.driver?.lastName || ""}`.trim(),
                      load.customer?.name || "",
                      load.location?.name || "",
                      invoice?.totalAmount || "0.00",
                      load.paidAt ? new Date(load.paidAt).toLocaleDateString() : "",
                    ];
                  }),
                ].map(row => row.join(",")).join("\n");

                const blob = new Blob([csvContent], { type: "text/csv" });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `paid-invoices-${format(new Date(), "yyyy-MM-dd")}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
              }}
            >
              <i className="fas fa-download mr-2"></i>
              Export CSV
            </Button>
          </div>
        </div>

        {/* Trucker Tip for empty state */}
        {sortedLoads.length === 0 && !searchTerm && !dateRange.from && !dateRange.to && (
          <TruckerTip 
            message="No paid invoices yet! Once you mark invoices as paid, they'll appear here for your records."
            mood="helpful"
          />
        )}

        {/* Results Table */}
        {sortedLoads.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Load #</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Paid Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLoads.map((load: any) => {
                  const invoice = invoices.find((inv: any) => inv.loadId === load.id);
                  return (
                    <TableRow key={load.id} className="hover:bg-green-50">
                      <TableCell>
                        <div>
                          <div className="font-medium">{load.number109}</div>
                          <div className="text-xs text-gray-500">
                            Trip #{load.tripNumber || "N/A"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {load.driver ? (
                          <div className="text-sm">
                            {load.driver.firstName} {load.driver.lastName}
                          </div>
                        ) : (
                          <span className="text-gray-500">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>{load.customer?.name || "N/A"}</TableCell>
                      <TableCell>{load.location?.name || "N/A"}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-green-700">
                          ${invoice?.totalAmount?.toFixed(2) || "0.00"}
                        </div>
                      </TableCell>
                      <TableCell>{invoice?.invoiceNumber || "N/A"}</TableCell>
                      <TableCell>
                        {load.paidAt ? (
                          <div>
                            <div>{format(new Date(load.paidAt), "MMM dd, yyyy")}</div>
                            <div className="text-xs text-gray-500">
                              {format(new Date(load.paidAt), "p")}
                            </div>
                          </div>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {invoice && (
                            <PrintButton
                              invoiceId={invoice.id}
                              loadId={load.id}
                              load={load}
                              invoice={invoice}
                              size="sm"
                              variant="outline"
                            />
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              // TODO: View load details
                            }}
                          >
                            <i className="fas fa-eye"></i>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : searchTerm || dateRange.from || dateRange.to ? (
          <div className="text-center py-8 text-gray-500">
            No paid invoices found matching your filters.
          </div>
        ) : null}

        {/* Summary Statistics */}
        {sortedLoads.length > 0 && (
          <div className="mt-6 p-4 bg-green-50 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Total Loads</div>
                <div className="text-xl font-semibold text-green-700">{sortedLoads.length}</div>
              </div>
              <div>
                <div className="text-gray-600">Total Revenue</div>
                <div className="text-xl font-semibold text-green-700">${totalAmount.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-600">Average per Load</div>
                <div className="text-xl font-semibold text-green-700">
                  ${(totalAmount / sortedLoads.length).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-gray-600">Last Payment</div>
                <div className="text-xl font-semibold text-green-700">
                  {sortedLoads[0]?.paidAt ? format(new Date(sortedLoads[0].paidAt), "MMM dd") : "N/A"}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}