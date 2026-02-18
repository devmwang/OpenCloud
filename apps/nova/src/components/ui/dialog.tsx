import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

import { getPortalRoot } from "@/lib/portal-root";

type DialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
    return (
        <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
            {children}
        </BaseDialog.Root>
    );
}

type DialogContentProps = {
    children: ReactNode;
    className?: string;
    title: string;
    description?: string;
};

export function DialogContent({ children, className, title, description }: DialogContentProps) {
    return (
        <BaseDialog.Portal container={getPortalRoot()}>
            <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
            <BaseDialog.Popup
                className={`border-border bg-surface fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border shadow-2xl shadow-black/40 transition-all duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 ${className ?? ""}`}
            >
                <div className="space-y-4 p-5">
                    <div className="space-y-1.5">
                        <BaseDialog.Title className="text-text text-lg font-semibold">{title}</BaseDialog.Title>
                        {description ? (
                            <BaseDialog.Description className="text-text-muted text-sm">
                                {description}
                            </BaseDialog.Description>
                        ) : null}
                    </div>
                    {children}
                </div>
            </BaseDialog.Popup>
        </BaseDialog.Portal>
    );
}

export function DialogClose({ children, className }: { children: ReactNode; className?: string }) {
    return <BaseDialog.Close className={className}>{children}</BaseDialog.Close>;
}
