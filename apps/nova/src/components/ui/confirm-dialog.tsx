import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type ConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel?: string;
    variant?: "danger" | "primary";
    onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = "Confirm",
    variant = "danger",
    onConfirm,
}: ConfirmDialogProps) {
    const [pending, setPending] = useState(false);

    const handleConfirm = async () => {
        setPending(true);
        try {
            await onConfirm();
            onOpenChange(false);
        } catch {
            // Callers handle and surface their own mutation errors.
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent title={title} description={description}>
                <div className="flex items-center justify-end gap-2.5 pt-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                        Cancel
                    </Button>
                    <Button variant={variant} loading={pending} onClick={() => void handleConfirm()}>
                        {confirmLabel}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
