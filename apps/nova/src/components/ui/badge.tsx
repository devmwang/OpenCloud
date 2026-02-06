import type { ReactNode } from "react";

type BadgeVariant = "default" | "accent" | "success" | "danger" | "warning";

type BadgeProps = {
    variant?: BadgeVariant;
    children: ReactNode;
    className?: string;
};

const variantClasses: Record<BadgeVariant, string> = {
    default: "bg-surface-raised text-text-muted border-border",
    accent: "bg-accent-glow text-accent border-accent/20",
    success: "bg-success-glow text-success border-success/20",
    danger: "bg-danger-glow text-danger border-danger/20",
    warning: "bg-[rgba(245,158,11,0.15)] text-warning border-warning/20",
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
    return (
        <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className ?? ""}`}
        >
            {children}
        </span>
    );
}
