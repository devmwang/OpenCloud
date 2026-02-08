import { CloudArrowUpIcon } from "@heroicons/react/24/outline";
import { useCallback, useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";

type UploadDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpload: (file: File) => Promise<void>;
};

export function UploadDialog({ open, onOpenChange, onUpload }: UploadDialogProps) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const uploadInFlightRef = useRef(false);

    const handleFile = useCallback(
        async (file: File) => {
            if (uploadInFlightRef.current) {
                return;
            }

            uploadInFlightRef.current = true;
            setPending(true);
            setError(null);

            try {
                await onUpload(file);
                onOpenChange(false);
                setSelectedFile(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Upload failed");
            } finally {
                uploadInFlightRef.current = false;
                setPending(false);
            }
        },
        [onUpload, onOpenChange],
    );

    const handleDrop = (event: DragEvent) => {
        event.preventDefault();
        if (pending) {
            return;
        }
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file) {
            setSelectedFile(file);
            void handleFile(file);
        }
    };

    const handleFileSelect = () => {
        if (pending) {
            return;
        }

        const file = inputRef.current?.files?.[0];
        if (file) {
            setSelectedFile(file);
            void handleFile(file);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent title="Upload File" description="Drag and drop a file or click to browse.">
                <div className="space-y-4">
                    {/* Drop zone */}
                    <div
                        className={`relative cursor-pointer rounded-lg border-2 border-dashed transition-all duration-150 ${
                            dragOver
                                ? "border-accent bg-accent-glow"
                                : "border-border hover:border-border-bright hover:bg-surface-raised/30"
                        } ${pending ? "cursor-not-allowed opacity-80" : ""}`}
                        onDragOver={(e) => {
                            if (pending) {
                                return;
                            }
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => {
                            if (pending) {
                                return;
                            }
                            setDragOver(false);
                        }}
                        onDrop={handleDrop}
                        onClick={() => {
                            if (pending) {
                                return;
                            }
                            inputRef.current?.click();
                        }}
                        onKeyDown={(e) => {
                            if (pending) {
                                return;
                            }
                            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label="Upload file"
                        aria-disabled={pending}
                    >
                        <div className="flex flex-col items-center justify-center px-4 py-7">
                            {pending ? (
                                <>
                                    <div className="relative mb-3 h-10 w-10">
                                        <div className="border-border absolute inset-0 rounded-full border-2" />
                                        <div className="border-t-accent absolute inset-0 animate-spin rounded-full border-2 border-transparent" />
                                    </div>
                                    <p className="text-text-muted text-sm">Uploading {selectedFile?.name}...</p>
                                </>
                            ) : (
                                <>
                                    <CloudArrowUpIcon className="text-text-dim mb-3 h-10 w-10" />
                                    <p className="text-text text-sm">
                                        {selectedFile ? selectedFile.name : "Drop file here or click to browse"}
                                    </p>
                                    <p className="text-text-dim mt-1 text-xs">Any file type supported</p>
                                </>
                            )}
                        </div>
                        <input
                            ref={inputRef}
                            type="file"
                            className="hidden"
                            onChange={handleFileSelect}
                            disabled={pending}
                        />
                    </div>

                    {error ? (
                        <div className="border-danger/30 bg-danger-glow text-danger rounded-md border px-3 py-2 text-sm">
                            {error}
                        </div>
                    ) : null}

                    <div className="flex items-center justify-end gap-2.5">
                        <DialogClose>
                            <Button type="button" variant="ghost" disabled={pending}>
                                Cancel
                            </Button>
                        </DialogClose>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
