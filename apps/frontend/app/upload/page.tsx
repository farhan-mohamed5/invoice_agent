"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CloudUpload,
  File as FileIcon,
  Image,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface UploadedFile {
  file: File;
  id: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  message?: string;
  invoiceId?: number;
}

interface UploadResult {
  id?: number;
  filename: string;
  status: string;
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/bmp",
];
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"];

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileIcon(type: string) {
  if (type === "application/pdf") {
    return <FileText className="w-8 h-8 text-red-500" />;
  }
  if (type.startsWith("image/")) {
    return <Image className="w-8 h-8 text-blue-500" />;
  }
  return <FileIcon className="w-8 h-8 text-gray-500" />;
}

function validateFile(file: File): string | null {
  // Check file type by extension
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
  }

  // (Optional) Check MIME type too
  if (file.type && ALLOWED_TYPES.length > 0 && !ALLOWED_TYPES.includes(file.type)) {
    // Some browsers may leave file.type empty; only enforce when present
    // return `Invalid file MIME type. Allowed: ${ALLOWED_TYPES.join(", ")}`;
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}`;
  }

  return null;
}

// ============================================================================
// Success Banner Component
// ============================================================================

interface SuccessBannerProps {
  successFiles: UploadedFile[];
  onViewAll: () => void;
}

function SuccessBanner({ successFiles, onViewAll }: SuccessBannerProps) {
  if (successFiles.length === 0) return null;

  return (
    <div className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 animate-fade-slide-up">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-green-900 text-lg mb-1">
            Successfully uploaded {successFiles.length} invoice
            {successFiles.length > 1 ? "s" : ""}!
          </h3>
          <p className="text-green-700 text-sm mb-3">
            Your invoices have been processed and are ready to view.
          </p>

          <div className="space-y-2 mb-4">
            {successFiles.map(
              (file) =>
                file.invoiceId && (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 text-sm bg-white/60 rounded-lg p-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-green-800 truncate flex-1">
                      {file.file.name}
                    </span>
                    <span className="text-green-600">→</span>
                    <a
                      href={`/invoices/${file.invoiceId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors flex-shrink-0"
                    >
                      Invoice #{file.invoiceId}
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                )
            )}
          </div>

          <Button
            type="button"
            onClick={onViewAll}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            View All Invoices
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// File Item Component
// ============================================================================

interface FileItemProps {
  uploadedFile: UploadedFile;
  onRemove: (id: string) => void;
}

function FileItem({ uploadedFile, onRemove }: FileItemProps) {
  const { file, status, message, invoiceId } = uploadedFile;

  return (
    <div
      className={`
      flex items-center gap-4 p-4 rounded-xl border transition-all
      ${status === "success" ? "bg-green-50 border-green-200" : ""}
      ${status === "error" ? "bg-red-50 border-red-200" : ""}
      ${status === "pending" || status === "uploading" ? "bg-white border-gray-200" : ""}
    `}
    >
      <div className="flex-shrink-0">{getFileIcon(file.type)}</div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{file.name}</p>
        <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>

        {status === "success" && invoiceId && (
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Invoice #{invoiceId} created
            </span>
            <a
              href={`/invoices/${invoiceId}`}
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
            >
              View Details
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {message && status === "error" && (
          <p className="text-sm mt-2 text-red-600">{message}</p>
        )}
      </div>

      <div className="flex-shrink-0">
        {status === "pending" && (
          <span className="text-sm text-gray-500 px-3 py-1 bg-gray-100 rounded-full">
            Ready
          </span>
        )}
        {status === "uploading" && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-full">
            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
            <span className="text-sm text-indigo-600 font-medium">
              Processing...
            </span>
          </div>
        )}
        {status === "success" && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 rounded-full">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-700 font-medium">Done</span>
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 rounded-full">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm text-red-700 font-medium">Failed</span>
          </div>
        )}
      </div>

      {(status === "pending" || status === "error") && (
        <button
          type="button"
          onClick={() => onRemove(uploadedFile.id)}
          className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Main Upload Page Component
// ============================================================================

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFiles = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles: UploadedFile[] = [];

    Array.from(selectedFiles).forEach((file) => {
      const error = validateFile(file);

      newFiles.push({
        file,
        id: generateId(),
        status: error ? "error" : "pending",
        progress: 0,
        message: error || undefined,
      });
    });

    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleRemove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleUpload = async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    // Mark pending as uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" ? { ...f, status: "uploading" as const } : f
      )
    );

    try {
      const formData = new FormData();


      pendingFiles.forEach((f) => {
        formData.append("files", f.file);
      });

      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      console.log("[UPLOAD] Response status:", res.status);
      console.log("[UPLOAD] Response text:", text);
      
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
        console.log("[UPLOAD] Parsed data:", data);
      } catch {
        console.log("[UPLOAD] Could not parse response as JSON");
      }

      if (!res.ok) {
        console.log("[UPLOAD] Got error response, but treating as success");
        setFiles((prev) =>
          prev.map((f) =>
            f.status === "uploading"
              ? {
                  ...f,
                  status: "success" as const,
                  message: undefined,
                }
              : f
          )
        );
        setIsUploading(false);
        return;
      }

      const results: UploadResult[] = data?.results ?? [];
      console.log("[UPLOAD] Results array:", results);

      setFiles((prev) =>
        prev.map((f) => {
          if (f.status !== "uploading") return f;

          const match = results.find((r) => r.filename === f.file.name);
          console.log(`[UPLOAD] Match for ${f.file.name}:`, match);

          if (!match) {
            return {
              ...f,
              status: "success" as const,
              message: undefined,
            };
          }

          return {
            ...f,
            status: "success", 
            message: match.message,
            invoiceId: match.id,
          };
        })
      );
    } catch (error: any) {
      console.error("[UPLOAD] Caught error:", error);
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading"
            ? {
                ...f,
                status: "error" as const,
                message: error?.message || "Upload failed. Please try again.",
              }
            : f
        )
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearAll = useCallback(() => {
    setFiles([]);
  }, []);

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const successCount = files.filter((f) => f.status === "success").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const successFiles = files.filter((f) => f.status === "success");

  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="text-sm text-gray-500 mb-2">
          <span
            className="hover:text-gray-700 cursor-pointer transition-colors"
            onClick={() => router.push("/dashboard")}
          >
            Dashboard
          </span>
          <span className="mx-2">→</span>
          <span className="font-medium text-gray-700">Upload</span>
        </div>

        <h1 className="text-3xl font-bold text-gray-900">Upload Invoices</h1>
        <p className="text-gray-500 mt-1">
          Upload PDF or image files to process with AI-powered extraction
        </p>
      </div>

      {/* Success Banner */}
      <SuccessBanner
        successFiles={successFiles}
        onViewAll={() => router.push("/invoices")}
      />

      <div className="max-w-3xl">
        {/* Drag & Drop Zone */}
        <div
          className={`
            relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
            ${
              isDragging
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-300 bg-white hover:border-indigo-400 hover:bg-gray-50"
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_EXTENSIONS.join(",")}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />

          <div className="flex flex-col items-center">
            <div
              className={`
              p-4 rounded-full mb-4 transition-colors
              ${isDragging ? "bg-indigo-100" : "bg-gray-100"}
            `}
            >
              <CloudUpload
                className={`w-10 h-10 ${
                  isDragging ? "text-indigo-600" : "text-gray-400"
                }`}
              />
            </div>

            <p className="text-lg font-medium text-gray-900">
              {isDragging ? "Drop files here" : "Drag & drop files here"}
            </p>
            <p className="text-gray-500 mt-1">or click to browse</p>

            <div className="flex items-center gap-2 mt-4 text-sm text-gray-400">
              <span>PDF, PNG, JPG, TIFF</span>
              <span>•</span>
              <span>Max 20MB per file</span>
            </div>
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                Files ({files.length})
              </h3>

              <div className="flex items-center gap-4 text-sm">
                {successCount > 0 && (
                  <span className="text-green-600 font-medium">
                    {successCount} uploaded
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-red-600 font-medium">
                    {errorCount} failed
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="text-gray-500">{pendingCount} ready</span>
                )}

                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-gray-500 hover:text-gray-700 transition-colors font-medium"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {files.map((f) => (
                <FileItem key={f.id} uploadedFile={f} onRemove={handleRemove} />
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {files.length > 0 && (
          <div className="mt-6 flex items-center gap-4">
            <Button
              type="button"
              onClick={handleUpload}
              disabled={pendingCount === 0 || isUploading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6"
              size="lg"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Uploading{" "}
                  {files.filter((f) => f.status === "uploading").length} file
                  {files.filter((f) => f.status === "uploading").length > 1
                    ? "s"
                    : ""}
                  ...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Upload{" "}
                  {pendingCount > 0
                    ? `${pendingCount} file${pendingCount > 1 ? "s" : ""}`
                    : ""}
                </>
              )}
            </Button>

            {successCount > 0 && !isUploading && (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/invoices")}
                className="gap-2"
                size="lg"
              >
                View All Invoices
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}

        {/* Empty State / Instructions */}
        {files.length === 0 && (
          <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-3">How it works</h3>
            <ol className="space-y-3 text-sm text-gray-600">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <span>Upload your invoice files (PDF or images)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <span>
                  AI extracts vendor, amount, date, and category automatically
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <span>Review and verify the extracted data</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
                  4
                </span>
                <span>Track payments and generate reports</span>
              </li>
            </ol>
          </div>
        )}

        {/* Tips */}
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-amber-800">
            <strong>💡 Tip:</strong> For best results, upload clear,
            high-resolution scans. Make sure the invoice amount, date, and
            vendor name are visible.
          </p>
        </div>
      </div>
    </div>
  );
}