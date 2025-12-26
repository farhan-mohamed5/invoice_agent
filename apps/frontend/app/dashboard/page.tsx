"use client";

import { useEffect, useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Building2,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Upload,
  Zap,
  PieChart,
  BarChart3,
  CreditCard,
  CalendarClock,
  Repeat,
  BellRing,
  Receipt,
  TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  format,
  subMonths,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  getDate,
  addMonths,
} from "date-fns";

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
  is_paid?: boolean | null;
  category?: string | null;
  created_at?: string | null;
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

interface RecurringExpense {
  vendor: string;
  avgAmount: number;
  dayOfMonth: number;
  frequency: number;
  lastDate: string;
  category?: string;
  nextExpected: Date;
  type?: string;
}

// ============================================================================
// Constants
// ============================================================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ============================================================================
// Recurring Expense Analyzer
// ============================================================================

// Known types for labeling only (not for detection)
const UTILITY_KEYWORDS = ["dewa", "sewa", "fewa", "addc", "electricity", "water", "power"];
const TELECOM_KEYWORDS = ["etisalat", "virgin mobile"];
const SUBSCRIPTION_KEYWORDS = ["microsoft 365", "microsoft", "google workspace", "adobe", "slack", "zoom", "aws", "azure", "dropbox", "notion", "figma", "github", "atlassian", "jira", "hubspot", "salesforce", "spotify", "netflix", "office 365"];
const INSURANCE_KEYWORDS = ["insurance", "takaful"];
const RENT_KEYWORDS = ["rent", "lease", "tenancy"];

// Excluded vendors - government/one-time payments
const EXCLUDE_KEYWORDS = ["gdrfa", "amer", "tas-heel", "tasheel", "dha", "rta", "traffic", "fine", "penalty", "visa", "emirates id", "license", "registration", "government", "ministry", "municipality", "court", "legal"];

function getExpenseType(vendor: string, category?: string): string | undefined {
  const text = `${vendor} ${category || ""}`.toLowerCase();
  
  if (UTILITY_KEYWORDS.some(k => text.includes(k))) return "utility";
  if (TELECOM_KEYWORDS.some(k => text.includes(k)) || /\bdu\s/i.test(text) || /\sdu\b/i.test(text) || text === "du") return "telecom";
  if (SUBSCRIPTION_KEYWORDS.some(k => text.includes(k))) return "subscription";
  if (INSURANCE_KEYWORDS.some(k => text.includes(k))) return "insurance";
  if (RENT_KEYWORDS.some(k => text.includes(k))) return "rent";
  
  return undefined;
}

function isExcluded(vendor: string): boolean {
  const text = vendor.toLowerCase();
  return EXCLUDE_KEYWORDS.some(k => text.includes(k));
}

function analyzeRecurringExpenses(invoices: Invoice[]): RecurringExpense[] {
  const vendorInvoices: Record<string, Invoice[]> = {};
  
  invoices.forEach((inv) => {
    if (!inv.vendor || !inv.date || !inv.amount) return;
    const vendor = inv.vendor.toLowerCase().trim();
    if (!vendorInvoices[vendor]) vendorInvoices[vendor] = [];
    vendorInvoices[vendor].push(inv);
  });

  const recurring: RecurringExpense[] = [];
  const now = new Date();

  Object.entries(vendorInvoices).forEach(([vendor, invs]) => {
    // Need at least 2 invoices
    if (invs.length < 2) return;

    const sorted = invs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const displayVendor = sorted[0].vendor || vendor;
    
    if (isExcluded(displayVendor)) return;

    // STEP 1: Group invoices by day of month (±1 day tolerance)
    const dayGroups: Record<number, Invoice[]> = {};
    
    sorted.forEach((inv) => {
      const day = getDate(new Date(inv.date));
      
      let matchedDay: number | null = null;
      for (const existingDay of Object.keys(dayGroups).map(Number)) {
        if (Math.abs(existingDay - day) <= 1) {
          matchedDay = existingDay;
          break;
        }
      }
      
      if (matchedDay !== null) {
        dayGroups[matchedDay].push(inv);
      } else {
        dayGroups[day] = [inv];
      }
    });

    // STEP 2: Find groups with at least 2 invoices on same day (±1)
    const validGroups = Object.entries(dayGroups)
      .filter(([, group]) => group.length >= 2)
      .sort(([, a], [, b]) => b.length - a.length);

    if (validGroups.length === 0) return;

    const [dayStr, group] = validGroups[0];
    const avgDay = parseInt(dayStr);
    
    // Sort by date
    const groupSorted = group.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // STEP 3: THE MOST IMPORTANT CHECK - Must be consecutive months
    // Each invoice must be ~1 month apart (25-38 days)
    let isMonthlyConsistent = true;
    
    for (let i = 1; i < groupSorted.length; i++) {
      const prevDate = new Date(groupSorted[i - 1].date);
      const currDate = new Date(groupSorted[i].date);
      const daysDiff = Math.ceil((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Must be roughly one month apart (25-38 days)
      // This accounts for months with 28-31 days
      if (daysDiff < 25 || daysDiff > 38) {
        isMonthlyConsistent = false;
        break;
      }
    }

    // If not monthly consistent, it's NOT recurring - skip it
    if (!isMonthlyConsistent) return;

    // Calculate average amount
    const amounts = groupSorted.map((inv) => inv.amount || 0);
    const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

    // Get type label (for display only)
    const type = getExpenseType(displayVendor, groupSorted[0].category);

    // Calculate next expected date
    let nextExpected = new Date(now.getFullYear(), now.getMonth(), avgDay);
    if (nextExpected <= now) {
      nextExpected = addMonths(nextExpected, 1);
    }

    recurring.push({
      vendor: displayVendor,
      avgAmount,
      dayOfMonth: avgDay,
      frequency: groupSorted.length,
      lastDate: groupSorted[groupSorted.length - 1].date,
      category: groupSorted[0].category || undefined,
      nextExpected,
      type,
    });
  });

  return recurring.sort((a, b) => a.nextExpected.getTime() - b.nextExpected.getTime());
}

// ============================================================================
// Stat Card Component
// ============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; isUp: boolean };
  onClick?: () => void;
  highlight?: "warning" | "danger" | "success";
}

function StatCard({ title, value, subtitle, icon, trend, onClick, highlight }: StatCardProps) {
  const highlightClasses = {
    warning: "border-amber-200 bg-amber-50/50",
    danger: "border-red-200 bg-red-50/50",
    success: "border-green-200 bg-green-50/50",
  };

  return (
    <div
      className={`
        bg-white rounded-xl border p-5 transition-all
        ${highlight ? highlightClasses[highlight] : "border-gray-200 hover:border-gray-300"}
        ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${trend.isUp ? "text-red-600" : "text-green-600"}`}>
              {trend.isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{Math.abs(trend.value).toFixed(0)}% vs last month</span>
            </div>
          )}
        </div>
        <div className="p-2.5 rounded-lg bg-gray-100 text-gray-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// VAT Insights Component
// ============================================================================

function VATInsights({ vatData }: { vatData: VATInsightData | null }) {
  if (!vatData || vatData.invoice_count === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100">
              <Receipt className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="font-semibold text-gray-900">VAT Summary</h3>
          </div>
        </div>
        <p className="text-gray-500 text-sm text-center py-6">
          No VAT data available yet. Upload invoices to see insights.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100">
            <Receipt className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">VAT Summary</h3>
            <p className="text-xs text-gray-500">{vatData.year} Year-to-Date</p>
          </div>
        </div>
        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Total VAT Card - LARGER */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-8">
        <p className="text-sm font-medium text-gray-600 mb-3">Total VAT Collected</p>
        <p className="text-4xl font-bold text-gray-900 mb-4">
          {vatData.vat_total.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {vatData.currency}
        </p>
        <p className="text-sm text-gray-500">
          Across {vatData.invoice_count} invoice{vatData.invoice_count !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Recurring Expenses Component
// ============================================================================

function RecurringExpenses({ invoices }: { invoices: Invoice[] }) {
  const recurring = useMemo(() => analyzeRecurringExpenses(invoices), [invoices]);
  const now = new Date();

  if (recurring.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-purple-100">
            <Repeat className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Recurring Expenses</h3>
            <p className="text-sm text-gray-500">AI-detected monthly patterns</p>
          </div>
        </div>
        <p className="text-gray-500 text-sm text-center py-6">
          Not enough data yet to detect recurring patterns. Keep uploading invoices!
        </p>
      </div>
    );
  }

  const totalMonthlyRecurring = recurring.reduce((sum, r) => sum + r.avgAmount, 0);
  const upcomingThisMonth = recurring.filter((r) => {
    const daysUntil = Math.ceil((r.nextExpected.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil <= 30;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100">
            <Repeat className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Recurring Expenses</h3>
            <p className="text-sm text-gray-500">AI-detected monthly patterns</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900">
            {totalMonthlyRecurring.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} AED
          </p>
          <p className="text-xs text-gray-500">est. monthly total</p>
        </div>
      </div>

      {upcomingThisMonth.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 text-amber-800">
            <BellRing className="w-4 h-4" />
            <span className="text-sm font-medium">
              {upcomingThisMonth.length} expense{upcomingThisMonth.length > 1 ? "s" : ""} expected in the next 30 days
            </span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {recurring.slice(0, 5).map((expense, i) => {
          const daysUntil = Math.ceil((expense.nextExpected.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const isUpcoming = daysUntil <= 7;
          
          // Type badge colors
          const typeColors: Record<string, string> = {
            utility: "bg-blue-100 text-blue-700",
            telecom: "bg-purple-100 text-purple-700",
            subscription: "bg-green-100 text-green-700",
            insurance: "bg-orange-100 text-orange-700",
            rent: "bg-pink-100 text-pink-700",
            unknown: "bg-gray-100 text-gray-600",
          };

          return (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                isUpcoming ? "border-amber-200 bg-amber-50/50" : "border-gray-100 bg-gray-50/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                  isUpcoming ? "bg-amber-200 text-amber-700" : "bg-gray-200 text-gray-600"
                }`}>
                  {expense.dayOfMonth}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">{expense.vendor}</p>
                    {expense.type && expense.type !== "unknown" && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColors[expense.type] || typeColors.unknown}`}>
                        {expense.type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {expense.frequency} consecutive months
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">
                  ~{expense.avgAmount.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} AED
                </p>
                <p className={`text-xs ${isUpcoming ? "text-amber-600 font-medium" : "text-gray-500"}`}>
                  {isUpcoming ? `Due in ${daysUntil} days` : `Next: ${format(expense.nextExpected, "MMM d")}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {recurring.length > 5 && (
        <p className="text-center text-sm text-gray-500 mt-3">
          +{recurring.length - 5} more recurring expenses
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Category Breakdown Component
// ============================================================================

function CategoryBreakdown({ invoices }: { invoices: Invoice[] }) {
  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};
    invoices.forEach((inv) => {
      const cat = inv.category || "Uncategorized";
      totals[cat] = (totals[cat] || 0) + (inv.amount || 0);
    });

    const total = Object.values(totals).reduce((sum, v) => sum + v, 0);

    const capitalize = (str: string) => {
      return str
        .split(" ")
        .map((word) => {
          if (word === word.toUpperCase() && word.length <= 4) return word;
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(" ");
    };

    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, amount]) => ({
        name: capitalize(name),
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }));
  }, [invoices]);

  const colors = ["bg-indigo-500", "bg-purple-500", "bg-blue-500", "bg-cyan-500", "bg-teal-500"];

  if (categoryData.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Spending by Category</h3>
        <PieChart className="w-5 h-5 text-gray-400" />
      </div>

      <div className="space-y-4">
        {categoryData.map((cat, i) => (
          <div key={cat.name}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-700 font-medium truncate">{cat.name}</span>
              <span className="text-gray-500 ml-2">
                {cat.amount.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} AED
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${colors[i]} rounded-full transition-all duration-500`}
                style={{ width: `${cat.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Monthly Trend Chart
// ============================================================================

function MonthlyTrendChart({ invoices }: { invoices: Invoice[] }) {
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { month: string; amount: number; count: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i));
      const monthEnd = endOfMonth(subMonths(now, i));
      const monthLabel = format(monthStart, "MMM");

      const monthInvoices = invoices.filter((inv) => {
        try {
          const date = new Date(inv.date);
          return isWithinInterval(date, { start: monthStart, end: monthEnd });
        } catch {
          return false;
        }
      });

      const amount = monthInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
      months.push({ month: monthLabel, amount, count: monthInvoices.length });
    }

    return months;
  }, [invoices]);

  const maxAmount = Math.max(...monthlyData.map((d) => d.amount), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-gray-900">Monthly Spending</h3>
        <BarChart3 className="w-5 h-5 text-gray-400" />
      </div>

      <div className="flex items-end justify-between gap-3 h-40">
        {monthlyData.map((month) => (
          <div key={month.month} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex flex-col items-center">
              <span className="text-xs text-gray-500 mb-1">
                {month.amount > 0 ? `${(month.amount / 1000).toFixed(0)}k` : "0"}
              </span>
              <div
                className="w-full max-w-[40px] bg-gradient-to-t from-indigo-500 to-indigo-400 rounded-t transition-all hover:from-indigo-600 hover:to-indigo-500"
                style={{ height: `${Math.max((month.amount / maxAmount) * 120, 4)}px` }}
              />
            </div>
            <span className="text-xs text-gray-600 font-medium">{month.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Payment Status Component
// ============================================================================

function PaymentStatus({ invoices }: { invoices: Invoice[] }) {
  const stats = useMemo(() => {
    const paid = invoices.filter((inv) => inv.is_paid === true);
    const unpaid = invoices.filter((inv) => inv.is_paid === false);
    const unknown = invoices.filter((inv) => inv.is_paid === null || inv.is_paid === undefined);

    return {
      paid: { count: paid.length, amount: paid.reduce((sum, inv) => sum + (inv.amount || 0), 0) },
      unpaid: { count: unpaid.length, amount: unpaid.reduce((sum, inv) => sum + (inv.amount || 0), 0) },
      unknown: { count: unknown.length, amount: unknown.reduce((sum, inv) => sum + (inv.amount || 0), 0) },
    };
  }, [invoices]);

  const total = stats.paid.count + stats.unpaid.count + stats.unknown.count;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Payment Status</h3>
        <CreditCard className="w-5 h-5 text-gray-400" />
      </div>

      <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex mb-4">
        {stats.paid.count > 0 && (
          <div className="bg-green-500 h-full" style={{ width: `${(stats.paid.count / total) * 100}%` }} />
        )}
        {stats.unpaid.count > 0 && (
          <div className="bg-red-500 h-full" style={{ width: `${(stats.unpaid.count / total) * 100}%` }} />
        )}
        {stats.unknown.count > 0 && (
          <div className="bg-gray-300 h-full" style={{ width: `${(stats.unknown.count / total) * 100}%` }} />
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />
            <span className="text-xs font-medium text-gray-600">Paid</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{stats.paid.count}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
            <span className="text-xs font-medium text-gray-600">Unpaid</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{stats.unpaid.count}</p>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 bg-gray-300 rounded-full" />
            <span className="text-xs font-medium text-gray-600">Unknown</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{stats.unknown.count}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Recent Activity Component
// ============================================================================

function RecentActivity({ invoices }: { invoices: Invoice[] }) {
  const recentInvoices = useMemo(() => {
    return [...invoices]
      .sort((a, b) => {
        const dateA = a.created_at || a.date;
        const dateB = b.created_at || b.date;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .slice(0, 5);
  }, [invoices]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Recent Activity</h3>
        <a href="/invoices" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
          View all
        </a>
      </div>

      <div className="space-y-2">
        {recentInvoices.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No invoices yet</p>
        ) : (
          recentInvoices.map((inv) => (
            <a
              key={inv.id}
              href={`/invoices/${inv.id}`}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg ${inv.status === "needs_review" ? "bg-orange-100" : "bg-green-100"}`}>
                  {inv.status === "needs_review" ? (
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{inv.vendor || "Unknown"}</p>
                  <p className="text-xs text-gray-500">{inv.date}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {inv.amount?.toLocaleString("en-AE", { minimumFractionDigits: 2 })} {inv.currency || "AED"}
              </p>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Top Vendors Component
// ============================================================================

function TopVendors({ invoices }: { invoices: Invoice[] }) {
  const vendors = useMemo(() => {
    const totals: Record<string, { count: number; amount: number }> = {};
    invoices.forEach((inv) => {
      if (!inv.vendor) return;
      if (!totals[inv.vendor]) totals[inv.vendor] = { count: 0, amount: 0 };
      totals[inv.vendor].count++;
      totals[inv.vendor].amount += inv.amount || 0;
    });

    return Object.entries(totals)
      .sort(([, a], [, b]) => b.amount - a.amount)
      .slice(0, 5)
      .map(([name, stats]) => ({ name, ...stats }));
  }, [invoices]);

  if (vendors.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Top Vendors</h3>
        <Building2 className="w-5 h-5 text-gray-400" />
      </div>

      <div className="space-y-3">
        {vendors.map((vendor, i) => (
          <div key={vendor.name} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                {i + 1}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 truncate max-w-[140px]">{vendor.name}</p>
                <p className="text-xs text-gray-500">{vendor.count} invoices</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {vendor.amount.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} AED
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Quick Actions Component
// ============================================================================

function QuickActions({ reviewCount, unpaidCount }: { reviewCount: number; unpaidCount: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
      <div className="space-y-2">
        <a
          href="/upload"
          className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
        >
          <Upload className="w-5 h-5 text-indigo-600" />
          <span className="text-sm font-medium text-indigo-700">Upload Invoice</span>
        </a>
        <a
          href="/invoices?status=needs_review"
          className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <span className="text-sm font-medium text-gray-700">Review Pending</span>
          </div>
          {reviewCount > 0 && (
            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
              {reviewCount}
            </span>
          )}
        </a>
        <a
          href="/invoices?payment=unpaid"
          className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium text-gray-700">View Unpaid</span>
          </div>
          {unpaidCount > 0 && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
              {unpaidCount}
            </span>
          )}
        </a>
        <a
          href="/invoices"
          className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <FileText className="w-5 h-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">All Invoices</span>
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="animate-pulse p-6">
      <div className="h-8 w-48 bg-gray-200 rounded mb-2" />
      <div className="h-5 w-64 bg-gray-100 rounded mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-64 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    </div>
  );
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vatData, setVatData] = useState<VATInsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchInvoices = async () => {
    try {
      const res = await fetch(`${API_URL}/invoices/`);
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Dashboard load error:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVATInsight = async () => {
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
  };

  useEffect(() => {
    fetchInvoices();
    fetchVATInsight();
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const stats = useMemo(() => {
    const totalInvoices = invoices.length;
    const totalSpend = invoices.reduce((sum, i) => sum + (i.amount || 0), 0);
    const reviewCount = invoices.filter((i) => i.status === "needs_review").length;
    const unpaidCount = invoices.filter((i) => i.is_paid === false).length;
    const unpaidAmount = invoices.filter((i) => i.is_paid === false).reduce((sum, i) => sum + (i.amount || 0), 0);

    const now = new Date();
    const thisMonth = startOfMonth(now);
    const lastMonth = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const thisMonthSpend = invoices
      .filter((inv) => {
        try { return new Date(inv.date) >= thisMonth; } catch { return false; }
      })
      .reduce((sum, inv) => sum + (inv.amount || 0), 0);

    const lastMonthSpend = invoices
      .filter((inv) => {
        try {
          const date = new Date(inv.date);
          return isWithinInterval(date, { start: lastMonth, end: lastMonthEnd });
        } catch { return false; }
      })
      .reduce((sum, inv) => sum + (inv.amount || 0), 0);

    const spendTrend = lastMonthSpend > 0 ? ((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100 : 0;

    return { totalInvoices, totalSpend, reviewCount, unpaidCount, unpaidAmount, thisMonthSpend, spendTrend };
  }, [invoices]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}, Client</h1>
            <p className="text-gray-500 mt-1">
              Here's your invoice overview for {format(new Date(), "MMMM yyyy")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Updated {format(lastUpdated, "h:mm a")}</span>
            <Button variant="outline" size="sm" onClick={() => { fetchInvoices(); fetchVATInsight(); }} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Invoices"
          value={stats.totalInvoices}
          subtitle="All time"
          icon={<FileText className="w-5 h-5" />}
          onClick={() => (window.location.href = "/invoices")}
        />
        <StatCard
          title="This Month"
          value={`${stats.thisMonthSpend.toLocaleString("en-AE", { maximumFractionDigits: 0 })} AED`}
          trend={stats.spendTrend !== 0 ? { value: stats.spendTrend, isUp: stats.spendTrend > 0 } : undefined}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatCard
          title="Needs Review"
          value={stats.reviewCount}
          subtitle={stats.reviewCount > 0 ? "Action required" : "All clear"}
          icon={<AlertCircle className="w-5 h-5" />}
          highlight={stats.reviewCount > 0 ? "warning" : undefined}
          onClick={() => (window.location.href = "/invoices?status=needs_review")}
        />
        <StatCard
          title="Unpaid"
          value={stats.unpaidCount}
          subtitle={stats.unpaidCount > 0 ? `${stats.unpaidAmount.toLocaleString()} AED outstanding` : "All paid up"}
          icon={<Clock className="w-5 h-5" />}
          highlight={stats.unpaidCount > 0 ? "danger" : undefined}
          onClick={() => (window.location.href = "/invoices?payment=unpaid")}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 space-y-6">
          <MonthlyTrendChart invoices={invoices} />
          <RecurringExpenses invoices={invoices} />
        </div>

        <div className="space-y-6">
          <QuickActions reviewCount={stats.reviewCount} unpaidCount={stats.unpaidCount} />
          <PaymentStatus invoices={invoices} />
        </div>
      </div>

      {/* Bottom Grid - Now includes VAT Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <VATInsights vatData={vatData} />
        <CategoryBreakdown invoices={invoices} />
        <TopVendors invoices={invoices} />
      </div>

      {/* Recent Activity - Full width below */}
      <div className="mt-6">
        <RecentActivity invoices={invoices} />
      </div>
    </div>
  );
}