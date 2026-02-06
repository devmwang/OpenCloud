import { FolderIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type EmptyStateProps = {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center px-4 py-16">
            <div className="border-border mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed">
                {icon ?? <FolderIcon className="text-text-dim h-8 w-8" />}
            </div>
            <h3 className="text-text mb-1 text-base font-medium">{title}</h3>
            {description ? <p className="text-text-muted max-w-xs text-center text-sm">{description}</p> : null}
            {action ? (
                <Button variant="primary" size="sm" className="mt-4" onClick={action.onClick}>
                    {action.label}
                </Button>
            ) : null}
        </div>
    );
}
