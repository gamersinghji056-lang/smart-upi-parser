import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { ACCEPTED_EXTENSIONS } from "@/lib/statement/parseStatement";
import { cn } from "@/lib/utils";

interface UploadPanelProps {
  onFile: (file: File) => void;
  busy: boolean;
  fileName: string | null;
}

export function UploadPanel({ onFile, busy, fileName }: UploadPanelProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "panel flex flex-col items-center gap-4 px-6 py-12 text-center transition-colors",
        dragging && "border-primary bg-secondary",
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-gradient-teal text-primary-foreground">
        {busy ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
      </div>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          {busy ? "Reading your statement…" : "Drop your bank statement here"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Original bank PDF, XLS, XLSX or CSV — any Indian bank, no template selection needed.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Choose file
      </button>

      {fileName ? (
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="size-3.5" />
          <span className="max-w-[16rem] truncate">{fileName}</span>
        </p>
      ) : null}
    </div>
  );
}
