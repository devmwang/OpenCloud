import type { ComponentProps } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ComponentProps<"button"> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
    primary:
        "bg-accent text-white hover:bg-accent-hover shadow-[0_0_12px_var(--color-accent-glow)] hover:shadow-[0_0_20px_var(--color-accent-glow)]",
    secondary: "bg-surface-raised text-text border border-border hover:border-border-bright hover:bg-surface-raised/80",
    danger: "bg-danger text-white hover:bg-danger-hover shadow-[0_0_12px_var(--color-danger-glow)] hover:shadow-[0_0_20px_var(--color-danger-glow)]",
    ghost: "bg-transparent text-text-muted hover:text-text hover:bg-surface-raised",
};

const sizeClasses: Record<ButtonSize, string> = {
    sm: "px-2.5 py-1 text-sm rounded-md gap-1.5",
    md: "px-3 py-1.5 text-sm rounded-lg gap-2",
    lg: "px-4 py-2 text-sm rounded-lg gap-2",
};

export function Button({
    variant = "primary",
    size = "md",
    loading,
    className,
    children,
    disabled,
    ...props
}: ButtonProps) {
    return (
        <button
            className={`focus-ring inline-flex cursor-pointer items-center justify-center font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${variantClasses[variant]} ${sizeClasses[size]} ${className ?? ""}`}
            disabled={disabled || loading}
            {...props}
        >
            {loading ? (
                <svg className="-ml-0.5 h-4.5 w-4.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
            ) : null}
            {children}
        </button>
    );
}
