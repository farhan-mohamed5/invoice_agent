"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ViewModal({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const fileUrl = `http://127.0.0.1:8000/files/${invoiceId}`;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Invoice Preview</DialogTitle>
        </DialogHeader>

        {/* PDF or image auto-preview */}
        <iframe
          src={fileUrl}
          className="w-full h-[80vh] rounded border"
        />
      </DialogContent>
    </Dialog>
  );
}
