"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { CalendarIcon, AlertCircle, FileX, Loader2, Sparkles, TrendingUp, TrendingDown, Clock, CheckCircle2, ChevronLeft, ChevronRight, Tag, Receipt } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

// ============================================================================
// Types
// ============================================================================

interface Invoice {
  id: number;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  date: string;
  status: "ok" | "needs_review";
  is_paid?: boolean | number | null;
  category?: string | null;
  transaction_type?: string | null;
}

interface VATInsightData {
  year: number;
  vat_total: number;
  invoice_count: number;
  invoices_with_vat_count: number;
  missing_vat_count: number;
  estimated_missing_vat_total: number;
  currency: string;
}

type SortOption =
  | "id_desc"
  | "id_asc"
  | "date_desc"
  | "date_asc"
  | "amount_desc"
  | "amount_asc"
  | "vendor_asc"
  | "vendor_desc"
  | "category_asc"
  | "category_desc";

type StatusFilter = "all" | "ok" | "needs_review";
type PaymentFilter = "all" | "paid" | "unpaid" | "unknown";
type CategoryFilter = "all" | string;

interface Filters {
  sort: SortOption;
  search: string;
  status: StatusFilter;
  payment: PaymentFilter;
  category: CategoryFilter;
  vendor: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

interface AIInsight {
  icon: React.ReactNode;
  title: string;
  description: string;
  type: "info" | "warning" | "success" | "trend";
}

// ============================================================================
// Constants
// ============================================================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// UAE expense categories (must match backend)
const UAE_CATEGORIES = [
  "Occupancy & Facilities",
  "Telecom & Connectivity",
  "Travel & Transport",
  "IT, Software & Cloud",
  "Professional, Banking & Insurance",
  "Office Supplies",
  "Marketing & Advertising",
  "Other Business Expenses",
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "id_desc", label: "ID (Newest First)" },
  { value: "id_asc", label: "ID (Oldest First)" },
  { value: "date_desc", label: "Date (Newest)" },
  { value: "date_asc", label: "Date (Oldest)" },
  { value: "amount_desc", label: "Amount (High → Low)" },
  { value: "amount_asc", label: "Amount (Low → High)" },
  { value: "vendor_asc", label: "Vendor A → Z" },
  { value: "vendor_desc", label: "Vendor Z → A" },
  { value: "category_asc", label: "Category A → Z" },
  { value: "category_desc", label: "Category Z → A" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const DEFAULT_FILTERS: Filters = {
  sort: "id_desc",
  search: "",
  status: "all",
  payment: "all",
  category: "all",
  vendor: "",
  dateFrom: undefined,
  dateTo: undefined,
};

// ============================================================================
// AI Insights Generator
// ============================================================================

function generateAIInsights(invoices: Invoice[], vatData: VATInsightData | null): AIInsight[] {
  if (invoices.length === 0) return [];

  const insights: AIInsight[] = [];
  const now = new Date();
  const thisMonth = startOfMonth(now);
  const lastMonth = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const totalSpend = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const unpaidInvoices = invoices.filter((inv) => inv.is_paid === false);
  const unpaidTotal = unpaidInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const needsReviewCount = invoices.filter((inv) => inv.status === "needs_review").length;

  const thisMonthInvoices = invoices.filter((inv) => {
    const date = new Date(inv.date);
    return date >= thisMonth;
  });
  const lastMonthInvoices = invoices.filter((inv) => {
    const date = new Date(inv.date);
    return isWithinInterval(date, { start: lastMonth, end: lastMonthEnd });
  });

  const thisMonthSpend = thisMonthInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const lastMonthSpend = lastMonthInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

  const vendorTotals: Record<string, { count: number; total: number }> = {};
  invoices.forEach((inv) => {
    if (inv.vendor) {
      if (!vendorTotals[inv.vendor]) {
        vendorTotals[inv.vendor] = { count: 0, total: 0 };
      }
      vendorTotals[inv.vendor].count++;
      vendorTotals[inv.vendor].total += inv.amount || 0;
    }
  });

  const topVendorBySpend = Object.entries(vendorTotals)
    .sort(([, a], [, b]) => b.total - a.total)[0];

  const categoryTotals: Record<string, number> = {};
  invoices.forEach((inv) => {
    const cat = inv.category || "Uncategorized";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (inv.amount || 0);
  });
  const topCategory = Object.entries(categoryTotals)
    .filter(([cat]) => cat !== "Uncategorized")
    .sort(([, a], [, b]) => b - a)[0];

  const avgAmount = totalSpend / invoices.length;

  const largestInvoice = invoices.reduce((max, inv) => 
    (inv.amount || 0) > (max.amount || 0) ? inv : max
  , invoices[0]);

  // VAT Insight - Show total VAT for current year
  if (vatData && vatData.invoice_count > 0) {
    insights.push({
      icon: <Receipt className="w-5 h-5 text-indigo-600" />,
      title: `${vatData.year} VAT Summary`,
      description: `AED ${vatData.vat_total.toLocaleString("en-AE", { minimumFractionDigits: 2 })} total VAT across ${vatData.invoice_count} invoices`,
      type: "info",
    });
  }

  // Month-over-month trend
  if (lastMonthSpend > 0) {
    const percentChange = ((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100;
    const isUp = percentChange > 0;
    
    if (Math.abs(percentChange) > 5) {
      insights.push({
        icon: isUp ? <TrendingUp className="w-5 h-5 text-orange-500" /> : <TrendingDown className="w-5 h-5 text-green-500" />,
        title: isUp ? "Spending is up this month" : "Spending is down this month",
        description: `You've spent ${Math.abs(percentChange).toFixed(0)}% ${isUp ? "more" : "less"} than last month (AED ${thisMonthSpend.toLocaleString()} vs AED ${lastMonthSpend.toLocaleString()})`,
        type: isUp ? "warning" : "success",
      });
    }
  }

  // Unpaid invoices alert
  if (unpaidInvoices.length > 0) {
    insights.push({
      icon: <Clock className="w-5 h-5 text-amber-500" />,
      title: `${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length > 1 ? "s" : ""}`,
      description: `Outstanding amount: AED ${unpaidTotal.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`,
      type: "warning",
    });
  }

  // Needs review alert
  if (needsReviewCount > 0) {
    insights.push({
      icon: <AlertCircle className="w-5 h-5 text-orange-500" />,
      title: `${needsReviewCount} invoice${needsReviewCount > 1 ? "s" : ""} need${needsReviewCount === 1 ? "s" : ""} review`,
      description: "Some invoices have missing or uncertain data that needs your attention",
      type: "warning",
    });
  }

  // Top vendor insight
  if (topVendorBySpend) {
    const [vendor, stats] = topVendorBySpend;
    const percentage = ((stats.total / totalSpend) * 100).toFixed(0);
    insights.push({
      icon: <Sparkles className="w-5 h-5 text-purple-500" />,
      title: `${vendor} accounts for your highest spend`,
      description: `${percentage}% of total spend (AED ${stats.total.toLocaleString("en-AE", { minimumFractionDigits: 2 })}) across ${stats.count} invoice${stats.count > 1 ? "s" : ""}`,
      type: "info",
    });
  }

  // Category insight
  if (topCategory) {
    const [category, amount] = topCategory;
    const percentage = ((amount / totalSpend) * 100).toFixed(0);
    insights.push({
      icon: <Tag className="w-5 h-5 text-blue-500" />,
      title: `Top category: ${category}`,
      description: `${percentage}% of your expenses (AED ${amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })})`,
      type: "info",
    });
  }

  // All caught up!
  if (needsReviewCount === 0 && unpaidInvoices.length === 0 && (!vatData || vatData.missing_vat_count === 0)) {
    insights.push({
      icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
      title: "All caught up!",
      description: "No pending reviews, unpaid invoices, or missing VAT data. Great job staying on top of things!",
      type: "success",
    });
  }

  // Quick stats
  insights.push({
    icon: <Sparkles className="w-5 h-5 text-indigo-500" />,
    title: "Quick stats",
    description: `${invoices.length} invoices processed • AED ${avgAmount.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} avg per invoice • Largest: AED ${(largestInvoice.amount || 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`,
    type: "info",
  });

return insights.slice(0, 3);

}

// ============================================================================
// Loading Skeleton Component
// ============================================================================

function TableSkeleton() {
  return (
    <div className="w-full max-w-7xl mt-6 px-0">
      <div className="border border-gray-200 rounded-xl shadow-md overflow-hidden">
        <div className="bg-gray-50/70 h-12 border-b border-gray-200" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 border-b border-gray-100 animate-pulse"
          >
            <div className="h-4 w-12 bg-gray-200 rounded" />
            <div className="h-4 w-64 bg-gray-200 rounded" />
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-24 bg-gray-200 rounded ml-auto" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-6 w-16 bg-gray-200 rounded-full" />
            <div className="flex gap-2">
              <div className="h-8 w-14 bg-gray-200 rounded" />
              <div className="h-8 w-18 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Empty State Component
// ============================================================================

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="w-full max-w-7xl mt-6 px-0">
      <div className="border border-gray-200 rounded-xl shadow-md p-12 text-center bg-white">
        <FileX className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-700 mb-2">
          {hasFilters ? "No matching invoices" : "No invoices yet"}
        </h3>
        <p className="text-gray-500 mb-4">
          {hasFilters
            ? "Try adjusting your filters to see more results."
            : "Upload your first invoice to get started."}
        </p>
        {hasFilters && (
          <Button variant="outline" onClick={onClear}>
            Clear all filters
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Error State Component
// ============================================================================

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="w-full max-w-7xl mt-6 px-0">
      <div className="border border-red-200 rounded-xl shadow-md p-12 text-center bg-red-50">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-red-700 mb-2">
          Failed to load invoices
        </h3>
        <p className="text-red-600 mb-4">{message}</p>
        <Button variant="outline" onClick={onRetry} className="border-red-300 text-red-700 hover:bg-red-100">
          Try again
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// AI Insights Component
// ============================================================================

function AIInsights({ invoices, vatData }: { invoices: Invoice[]; vatData: VATInsightData | null }) {
  const insights = useMemo(() => generateAIInsights(invoices, vatData), [invoices, vatData]);

  if (insights.length === 0) return null;

  const getBgColor = (type: AIInsight["type"]) => {
    switch (type) {
      case "warning":
        return "bg-amber-50 border-amber-200";
      case "success":
        return "bg-green-50 border-green-200";
      case "trend":
        return "bg-blue-50 border-blue-200";
      default:
        return "bg-white border-gray-200";
    }
  };

  return (
    <div className="w-full px-2 mt-3 animate-fade-slide-up">
      <div className="bg-white border border-gray-200 p-6 rounded-xl shadow-sm max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-gray-800">AI Insights</h3>
          <span className="text-xs text-gray-500 ml-2">Updated just now</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {insights.map((insight, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${getBgColor(insight.type)} transition-all hover:shadow-md`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{insight.icon}</div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-800 text-sm">{insight.title}</h4>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    {insight.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Pagination Component
// ============================================================================

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function Pagination({ 
  currentPage, 
  totalPages, 
  pageSize, 
  totalItems,
  onPageChange, 
  onPageSizeChange 
}: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="w-full max-w-7xl mt-4 px-0">
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4">
        {/* Left: Page size selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="w-20 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-gray-600">per page</span>
        </div>

        {/* Center: Page info */}
        <div className="text-sm text-gray-600">
          Showing <span className="font-medium">{startItem}</span> to{" "}
          <span className="font-medium">{endItem}</span> of{" "}
          <span className="font-medium">{totalItems}</span> invoices
        </div>

        {/* Right: Page navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-9"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                  className={`w-9 h-9 p-0 ${
                    currentPage === pageNum
                      ? "bg-indigo-600 hover:bg-indigo-700"
                      : ""
                  }`}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-9"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Filter Bar Component
// ============================================================================

interface FilterBarProps {
  filters: Filters;
  onFilterChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onClearFilters: () => void;
  resultCount: number;
  totalCount: number;
}

function FilterBar({ filters, onFilterChange, onClearFilters, resultCount, totalCount }: FilterBarProps) {
  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.payment !== "all" ||
    filters.category !== "all" ||
    filters.vendor !== "" ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined;

  return (
    <div className="w-full flex justify-center mt-3 px-2 animate-fade-slide-up">
      <div className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-7xl">
        <div className="flex flex-wrap items-center gap-4 w-full">
          {/* Sort */}
          <Select
            value={filters.sort}
            onValueChange={(value) => onFilterChange("sort", value as SortOption)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <Input
            placeholder="Search invoices…"
            className="w-48"
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
          />

          {/* Category Filter */}
          <Select
            value={filters.category}
            onValueChange={(value) => onFilterChange("category", value as CategoryFilter)}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {UAE_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={filters.status}
            onValueChange={(value) => onFilterChange("status", value as StatusFilter)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="needs_review">Needs Review</SelectItem>
            </SelectContent>
          </Select>

          {/* Payment Filter */}
          <Select
            value={filters.payment}
            onValueChange={(value) => onFilterChange("payment", value as PaymentFilter)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>

          {/* Vendor Filter */}
          <Input
            placeholder="Vendor…"
            className="w-36"
            value={filters.vendor}
            onChange={(e) => onFilterChange("vendor", e.target.value)}
          />

          {/* Date From */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-36 justify-start text-sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateFrom ? format(filters.dateFrom, "MM/dd/yy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-2">
              <Calendar
                mode="single"
                selected={filters.dateFrom}
                onSelect={(date) => onFilterChange("dateFrom", date)}
              />
            </PopoverContent>
          </Popover>

          {/* Date To */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-36 justify-start text-sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateTo ? format(filters.dateTo, "MM/dd/yy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-2">
              <Calendar
                mode="single"
                selected={filters.dateTo}
                onSelect={(date) => onFilterChange("dateTo", date)}
              />
            </PopoverContent>
          </Popover>

          {/* Clear Filters */}
          <Button
            variant="secondary"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
          >
            Clear
          </Button>

          {/* Result Count */}
          <div className="ml-auto text-sm text-gray-500">
            {resultCount === totalCount ? (
              <span>{totalCount} invoices</span>
            ) : (
              <span>
                <strong>{resultCount}</strong> of {totalCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Category Badge Component
// ============================================================================

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) {
    return <span className="text-gray-400 text-sm">—</span>;
  }

  return (
    <span 
      className="
        inline-flex items-center
        bg-gray-50 text-gray-700 border border-gray-200
        px-2 py-1 text-xs rounded-md font-medium
        whitespace-nowrap
      "
    >
      {category}
    </span>
  );
}

// ============================================================================
// Invoice Table Row Component
// ============================================================================

interface InvoiceRowProps {
  invoice: Invoice;
  index: number;
  onPaymentUpdate: (id: number, isPaid: boolean) => Promise<void>;
}

function InvoiceRow({ invoice, index, onPaymentUpdate }: InvoiceRowProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handlePaymentClick = async (e: React.MouseEvent, isPaid: boolean) => {
    e.stopPropagation();
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      await onPaymentUpdate(invoice.id, isPaid);
    } finally {
      setIsUpdating(false);
    }
  };

  const navigateToInvoice = () => {
    window.location.href = `/invoices/${invoice.id}`;
  };

  return (
    <TableRow
      className="
        transition-all cursor-pointer border-b border-gray-100
        hover:bg-blue-50/50
        hover:shadow-md
      "
      style={{ animationDelay: `${index * 40}ms` }}
      onClick={navigateToInvoice}
    >
      {/* ID */}
      <TableCell className="py-3 px-3 font-mono text-gray-600">
        {invoice.id}
      </TableCell>

      {/* Vendor */}
      <TableCell className="px-3 text-gray-800">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center min-h-[3.2rem]">
              <div
                className="line-clamp-2 overflow-hidden text-ellipsis"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {invoice.vendor || "—"}
              </div>
            </div>
          </TooltipTrigger>
          {invoice.vendor && (
            <TooltipContent side="left" className="max-w-xs text-sm">
              {invoice.vendor}
            </TooltipContent>
          )}
        </Tooltip>
      </TableCell>

      {/* Category */}
      <TableCell className="px-3 py-3">
        <div className="pointer-events-none">
          <CategoryBadge category={invoice.category} />
        </div>
      </TableCell>

      {/* Amount */}
      <TableCell className="text-right font-medium text-gray-800 py-3 px-3 tabular-nums">
        {invoice.amount != null 
          ? `${invoice.amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })} ${invoice.currency || ""}`
          : "—"
        }
      </TableCell>

      {/* Date */}
      <TableCell className="w-[130px] text-left pl-6 py-3 px-3 text-gray-600">
        {invoice.date}
      </TableCell>

      {/* Status */}
      <TableCell className="w-[150px] text-center py-3 px-3">
        <div className="flex justify-center items-center">
          {invoice.status === "ok" ? (
            <Badge className="bg-green-100 text-green-700 border border-green-300 px-2 py-[1px] text-xs rounded-full shadow-[0_0_8px_rgba(34,197,94,0.55)] transition hover:bg-green-200 hover:shadow-[0_0_12px_rgba(34,197,94,0.75)]">
              ✔ OK
            </Badge>
          ) : (
            <Badge
              className="
                bg-orange-100 text-orange-700 border border-orange-300
                px-2 py-[2px] text-xs rounded-full
                shadow-[0_0_6px_rgba(251,146,60,0.45)]
                leading-tight transition
                hover:bg-orange-200 hover:shadow-[0_0_10px_rgba(251,146,60,0.65)]
                w-[75px] flex flex-col items-center justify-center
              "
            >
              ⚠ Needs
              <br />
              Review
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Payment Actions */}
      <TableCell className="w-[150px] text-center py-3 px-3">
        <div className="flex gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            className={`
              border transition-all
              ${invoice.is_paid === true || invoice.is_paid === 1
                ? "bg-green-500 text-white border-green-600 hover:bg-green-600"
                : "bg-green-100 text-green-700 border-green-300 hover:bg-green-200"
              }
            `}
            disabled={isUpdating}
            onClick={(e) => handlePaymentClick(e, true)}
          >
            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Paid"}
          </Button>

          <Button
            size="sm"
            className={`
              border transition-all
              ${invoice.is_paid === false || invoice.is_paid === 0
                ? "bg-red-500 text-white border-red-600 hover:bg-red-600"
                : "bg-red-100 text-red-700 border-red-300 hover:bg-red-200"
              }
            `}
            disabled={isUpdating}
            onClick={(e) => handlePaymentClick(e, false)}
          >
            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Not Paid"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

function InvoicesPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vatData, setVatData] = useState<VATInsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize filters from URL params
  const [filters, setFilters] = useState<Filters>(() => {
    const status = searchParams.get("status");
    const payment = searchParams.get("payment");
    const category = searchParams.get("category");
    const vendor = searchParams.get("vendor");
    const search = searchParams.get("search");
    
    return {
      sort: "id_desc",
      search: search || "",
      status: (status === "ok" || status === "needs_review") ? status : "all",
      payment: (payment === "paid" || payment === "unpaid" || payment === "unknown") ? payment : "all",
      category: category && UAE_CATEGORIES.includes(category) ? category : "all",
      vendor: vendor || "",
      dateFrom: undefined,
      dateTo: undefined,
    };
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.payment !== "all") params.set("payment", filters.payment);
    if (filters.category !== "all") params.set("category", filters.category);
    if (filters.vendor) params.set("vendor", filters.vendor);
    if (filters.search) params.set("search", filters.search);
    
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [filters.status, filters.payment, filters.category, filters.vendor, filters.search, router]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/invoices/`);
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json();
      setInvoices(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error occurred";
      setError(message);
      console.error("Failed to load invoices:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVATInsight = useCallback(async () => {
    try {
      const currentYear = new Date().getFullYear();
      const res = await fetch(`${API_URL}/invoices/insights/vat?year=${currentYear}`);
      if (res.ok) {
        const data = await res.json();
        setVatData(data);
      }
    } catch (err) {
      console.error("Failed to load VAT insights:", err);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchVATInsight();
  }, [fetchInvoices, fetchVATInsight]);

  const handlePaymentUpdate = useCallback(async (id: number, isPaid: boolean) => {
    try {
      const res = await fetch(`${API_URL}/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_paid: isPaid }),
      });

      if (!res.ok) {
        throw new Error("Failed to update payment status");
      }

      setInvoices((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, is_paid: isPaid } : inv))
      );
    } catch (err) {
      console.error("Payment update failed:", err);
    }
  }, []);

  const handleFilterChange = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
    router.replace(window.location.pathname, { scroll: false });
  }, [router]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== "" ||
      filters.status !== "all" ||
      filters.payment !== "all" ||
      filters.category !== "all" ||
      filters.vendor !== "" ||
      filters.dateFrom !== undefined ||
      filters.dateTo !== undefined
    );
  }, [filters]);

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((inv) => {
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          const matchesVendor = inv.vendor?.toLowerCase().includes(searchLower);
          const matchesId = String(inv.id).includes(filters.search);
          const matchesCategory = inv.category?.toLowerCase().includes(searchLower);
          if (!matchesVendor && !matchesId && !matchesCategory) return false;
        }

        if (filters.status !== "all" && inv.status !== filters.status) {
          return false;
        }

        if (filters.payment !== "all") {
          if (filters.payment === "paid" && inv.is_paid !== true && inv.is_paid !== 1) return false;
          if (filters.payment === "unpaid" && inv.is_paid !== false && inv.is_paid !== 0) return false;
          if (filters.payment === "unknown" && inv.is_paid !== null && inv.is_paid !== undefined) return false;
        }

        if (filters.category !== "all" && inv.category !== filters.category) {
          return false;
        }

        if (filters.vendor && !inv.vendor?.toLowerCase().includes(filters.vendor.toLowerCase())) {
          return false;
        }

        if (filters.dateFrom && new Date(inv.date) < filters.dateFrom) {
          return false;
        }

        if (filters.dateTo && new Date(inv.date) > filters.dateTo) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (filters.sort) {
          case "id_desc":
            return b.id - a.id;
          case "id_asc":
            return a.id - b.id;
          case "date_desc":
            return new Date(b.date).getTime() - new Date(a.date).getTime();
          case "date_asc":
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          case "amount_desc":
            return (b.amount ?? 0) - (a.amount ?? 0);
          case "amount_asc":
            return (a.amount ?? 0) - (b.amount ?? 0);
          case "vendor_asc":
            return (a.vendor || "").localeCompare(b.vendor || "");
          case "vendor_desc":
            return (b.vendor || "").localeCompare(a.vendor || "");
          case "category_asc":
            return (a.category || "").localeCompare(b.category || "");
          case "category_desc":
            return (b.category || "").localeCompare(a.category || "");
          default:
            return 0;
        }
      });
  }, [invoices, filters]);

  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredInvoices.slice(startIndex, startIndex + pageSize);
  }, [filteredInvoices, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredInvoices.length / pageSize);

  if (loading) {
    return (
      <TooltipProvider>
        <div className="min-h-screen pt-0 animate-fade-in pl-[20px] pr-10">
          <PageHeader />
          <TableSkeleton />
        </div>
      </TooltipProvider>
    );
  }

  if (error) {
    return (
      <TooltipProvider>
        <div className="min-h-screen pt-0 animate-fade-in pl-[20px] pr-10">
          <PageHeader />
          <ErrorState message={error} onRetry={fetchInvoices} />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen pt-0 animate-fade-in pl-[20px] pr-10">
        <PageHeader />

        {invoices.length > 0 && <AIInsights invoices={invoices} vatData={vatData} />}

        <FilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={clearFilters}
          resultCount={filteredInvoices.length}
          totalCount={invoices.length}
        />

        {filteredInvoices.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} />
        ) : (
          <>
            <div className="w-full max-w-7xl mt-6 animate-fade-in overflow-visible px-0">
              <Table className="w-full border border-gray-200 rounded-xl shadow-md relative z-10">
                <TableHeader className="bg-gray-50">
                  <TableRow className="border-b border-gray-200">
                    <TableHead className="w-[60px] py-2 px-3 text-sm font-semibold text-gray-700">
                      ID
                    </TableHead>
                    <TableHead className="w-[300px] py-2 px-3 text-sm font-semibold text-gray-700">
                      Vendor
                    </TableHead>
                    <TableHead className="w-[220px] py-2 px-3 text-sm font-semibold text-gray-700">
                      Category
                    </TableHead>
                    <TableHead className="w-[140px] py-2 px-3 text-sm font-semibold text-gray-700 text-right">
                      Amount
                    </TableHead>
                    <TableHead className="w-[130px] py-2 px-3 text-sm font-semibold text-gray-700 text-left pl-6">
                      Date
                    </TableHead>
                    <TableHead className="w-[150px] py-2 px-3 text-sm font-semibold text-gray-700 text-center">
                      Status
                    </TableHead>
                    <TableHead className="w-[150px] py-2 px-3 text-sm font-semibold text-gray-700 text-center">
                      Payment
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedInvoices.map((invoice, index) => (
                    <InvoiceRow
                      key={invoice.id}
                      invoice={invoice}
                      index={index}
                      onPaymentUpdate={handlePaymentUpdate}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredInvoices.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Page Header Component
// ============================================================================

function PageHeader() {
  return (
    <div className="w-full px-2 mt-0 animate-fade-slide-up">
      <div className="text-sm text-gray-500 mb-2">
        <span
          className="hover:text-gray-700 cursor-pointer transition-colors"
          onClick={() => (window.location.href = "/dashboard")}
        >
          Dashboard
        </span>
        <span className="mx-1 select-none">→</span>
        <span className="font-medium text-gray-700">Invoices</span>
      </div>

      <h2 className="text-5xl font-extrabold text-gray-900 tracking-tight">
        Invoices
      </h2>

      <p className="text-lg text-gray-600 mt-1">
        Your AI-powered invoice center
      </p>

      <div className="mt-4 h-px w-full bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200" />
    </div>
  );
}

// ============================================================================
// Main Export with Suspense wrapper for useSearchParams
// ============================================================================

export default function ReceiptsPage() {
  return (
    <Suspense fallback={
      <TooltipProvider>
        <div className="min-h-screen pt-0 animate-fade-in pl-[20px] pr-10">
          <PageHeader />
          <TableSkeleton />
        </div>
      </TooltipProvider>
    }>
      <InvoicesPageContent />
    </Suspense>
  );
}