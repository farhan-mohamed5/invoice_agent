"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";

interface ReviewQuestion {
  field_name: string;
  question: string;
  input_type: string;
  current_value?: any;
  hint?: string;
  options?: { value: any; label: string }[];
}

function parseNumberOrEmpty(raw: string) {
  const v = raw.trim();
  if (v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

function coerceBool(v: string) {
  const s = v.trim().toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return v;
}

export default function InvoicePage({ params }: { params: { id: string } }) {
  const { toast } = useToast();
  const router = useRouter();
  const invoiceId = params.id;

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:8000/invoices/${invoiceId}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          setInvoice(null);
          return;
        }

        const data = await res.json();
        setInvoice(data);

        const initial: Record<string, any> = {};
        if (data.review_questions?.length) {
          data.review_questions.forEach((q: ReviewQuestion) => {
            if (q.current_value !== null && q.current_value !== undefined) {
              initial[q.field_name] = q.current_value;
            }
          });
        }

        setAnswers(initial);
      } catch (err) {
        console.error(err);
        setInvoice(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [invoiceId]);

  const updateAnswer = (field: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitReview = async () => {
    const filledAnswers: Record<string, any> = {};
    Object.entries(answers).forEach(([key, value]) => {
      // Skip null, undefined, and empty string
      if (value !== "" && value !== null && value !== undefined) {
        filledAnswers[key] = value;
      }
      });
    // If vat_inclusive is being sent, include amount for VAT calculation
    if ("vat_inclusive" in filledAnswers && invoice.amount) {
    filledAnswers.amount = invoice.amount;
  }

    if (Object.keys(filledAnswers).length === 0) {
      toast({
        title: "No answers provided",
        description: "Please answer at least one question before submitting.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    console.log("[REVIEW] Submitting answers:", filledAnswers);

    try {
      const res = await fetch(
        `http://localhost:8000/invoices/${invoiceId}/resolve-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: filledAnswers }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        console.error("[REVIEW] Error response:", data);
        throw new Error(data?.detail || "Failed to resolve review");
      }

      setInvoice(data.invoice);
      setAnswers({});

      toast({
        title: "Invoice updated",
        description: "The invoice has been verified and marked as OK.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipReview = async () => {
    setSubmitting(true);

    try {
      const res = await fetch(
        `http://localhost:8000/invoices/${invoiceId}/resolve-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: {} }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || "Failed to approve invoice");
      }

      setInvoice(data.invoice);
      setAnswers({});

      toast({
        title: "Invoice approved",
        description: "Marked as OK without changes.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInvoice = async () => {
    const ok = window.confirm("Delete this invoice? This can't be undone.");
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await fetch(`http://localhost:8000/invoices/${invoiceId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || "Failed to delete invoice");
      }

      toast({
        title: "Invoice deleted",
        description: "The invoice has been removed.",
      });

      router.push("/receipts");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestionInput = (q: ReviewQuestion) => {
    const value = answers[q.field_name] ?? "";

    switch (q.input_type) {
      case "number":
        return (
          <Input
            type="number"
            step="0.01"
            placeholder={q.hint || "Enter amount"}
            value={value}
            onChange={(e) =>
              updateAnswer(q.field_name, parseNumberOrEmpty(e.target.value))
            }
          />
        );

      case "date":
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => updateAnswer(q.field_name, e.target.value)}
          />
        );

      case "select":
        return (
          <Select
            value={String(value)}
            onValueChange={(v) => {
              if (q.field_name === "is_paid")
                return updateAnswer(q.field_name, coerceBool(v));
              return updateAnswer(q.field_name, v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {q.options?.map((opt) => (
                <SelectItem key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "confirm_or_correct":
        return (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={value === q.current_value ? "default" : "outline"}
                size="sm"
                onClick={() => updateAnswer(q.field_name, q.current_value)}
              >
                Confirm ({q.current_value})
              </Button>
              <span className="text-muted-foreground self-center">or</span>
            </div>
            <Input
              type="number"
              step="0.01"
              placeholder="Enter correct value"
              value={value !== q.current_value ? value : ""}
              onChange={(e) =>
                updateAnswer(q.field_name, parseNumberOrEmpty(e.target.value))
              }
            />
          </div>
        );

      default:
        return (
          <Input
            type="text"
            placeholder={q.hint || "Enter value"}
            value={value}
            onChange={(e) => updateAnswer(q.field_name, e.target.value)}
          />
        );
    }
  };

  const formattedDate = useMemo(() => {
    if (!invoice?.date) return "—";
    const d = new Date(invoice.date);
    return Number.isNaN(d.getTime()) ? String(invoice.date) : d.toLocaleDateString();
  }, [invoice?.date]);

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-lg">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading invoice…
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-2">Invoice Not Found</h1>
        <Link href="/receipts" className="text-blue-600 underline">
          Back to Invoices
        </Link>
      </div>
    );
  }

  const needsReview = invoice.status === "needs_review";
  const reviewQuestions: ReviewQuestion[] = invoice.review_questions || [];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <Link href="/receipts" className="text-blue-600 hover:underline">
        ← Back to Invoices
      </Link>

      <h1 className="text-4xl font-bold tracking-tight">Invoice #{invoice.id}</h1>

      {needsReview && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-amber-800 dark:text-amber-200">
                This invoice needs your input
              </CardTitle>
            </div>
            {invoice.review_reason && (
              <CardDescription className="text-amber-700 dark:text-amber-300">
                {invoice.review_reason}
              </CardDescription>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {reviewQuestions.map((q, idx) => (
              <div key={q.field_name} className="space-y-2">
                <Label className="text-base font-medium">
                  {idx + 1}. {q.question}
                </Label>
                {q.hint && <p className="text-sm text-muted-foreground">{q.hint}</p>}
                {renderQuestionInput(q)}
              </div>
            ))}

            {/* VAT Control - Simplified */}
            <Separator />
            <div className="space-y-3">
              <Label className="text-base font-medium">VAT (5% UAE)</Label>

              <Select
                value={
                  answers.vat_inclusive === true
                    ? "inclusive"
                    : answers.vat_inclusive === false
                    ? "exclusive"
                    : ""
                }
                onValueChange={(v) => {
                  if (v === "inclusive") {
                    updateAnswer("vat_inclusive", true);
                  } else if (v === "exclusive") {
                    updateAnswer("vat_inclusive", false);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select VAT option…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inclusive">VAT Inclusive (amount includes 5% VAT)</SelectItem>
                  <SelectItem value="exclusive">VAT Exclusive (5% VAT will be added)</SelectItem>
                </SelectContent>
              </Select>

              <p className="text-xs text-muted-foreground">
                System will automatically calculate VAT at 5% based on your selection.
              </p>
            </div>

            <Separator />

            <div className="flex gap-3">
              <Button onClick={handleSubmitReview} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Submit Answers
                  </>
                )}
              </Button>

              <Button variant="ghost" onClick={handleSkipReview} disabled={submitting}>
                Approve as-is
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{invoice.vendor || "Unknown Vendor"}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">Amount:</span>
            <span className="font-semibold">
              {invoice.amount ?? "—"} {invoice.currency || "AED"}
            </span>
          </div>

          <Separator />

          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">VAT:</span>
            <span>
              {invoice.tax_amount ?? "—"} {invoice.currency || "AED"}
            </span>
          </div>

          <Separator />

          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">Date:</span>
            <span>{formattedDate}</span>
          </div>

          <Separator />

          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">Category:</span>
            <span>{invoice.category || "—"}</span>
          </div>

          <Separator />

          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">Payment:</span>
            <span>{invoice.payment_method || "—"}</span>
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <span className="font-medium text-muted-foreground">Paid:</span>
            <Badge 
              variant={
                invoice.is_paid === true || invoice.is_paid === 1 
                  ? "default" 
                  : "destructive"
              }
              className={
                invoice.is_paid === true || invoice.is_paid === 1
                  ? "bg-green-600 hover:bg-green-700"
                  : ""
              }
            >
              {invoice.is_paid === true || invoice.is_paid === 1 ? "Yes" 
               : invoice.is_paid === false || invoice.is_paid === 0 ? "No" 
               : "Unknown"}
            </Badge>
          </div>

          <Separator />

          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">Type:</span>
            <span className="capitalize">
              {invoice.transaction_type?.replace("_", " ") || "—"}
            </span>
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <span className="font-medium text-muted-foreground">Status:</span>
            <Badge
              variant={invoice.status === "ok" ? "default" : "destructive"}
              className="capitalize"
            >
              {invoice.status}
            </Badge>
          </div>

          {invoice.notes && (
            <div className="mt-6">
              <span className="font-medium">Notes:</span>
              <pre className="mt-2 p-4 bg-muted rounded-lg whitespace-pre-wrap text-sm">
                {invoice.notes}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-4 pt-2">
        <Button variant="destructive" onClick={handleDeleteInvoice} disabled={submitting}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Invoice
        </Button>
      </div>
    </div>
  );
}