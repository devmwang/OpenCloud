import type { ReactNode } from "react";

type PageHeaderProps = {
    title: string;
    description?: string;
    icon?: ReactNode;
    actions?: ReactNode;
    breadcrumb?: ReactNode;
};

export function PageHeader({ title, description, icon, actions, breadcrumb }: PageHeaderProps) {
    return (
        <div className="space-y-3 pb-6">
            {breadcrumb ? <div className="pb-1">{breadcrumb}</div> : null}
            <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    {icon ? (
                        <div className="bg-surface-raised border-border text-text-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border [&>svg]:h-5 [&>svg]:w-5">
                            {icon}
                        </div>
                    ) : null}
                    <div className="min-w-0">
                        <h1 className="text-text truncate text-xl font-semibold tracking-tight">{title}</h1>
                        {description ? <p className="text-text-muted mt-0.5 text-sm">{description}</p> : null}
                    </div>
                </div>
                {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
        </div>
    );
}
