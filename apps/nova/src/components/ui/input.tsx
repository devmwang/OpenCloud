import { forwardRef, type ComponentProps } from "react";

type InputProps = ComponentProps<"input"> & {
    label?: string;
    error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { label, error, className, id, ...props },
    ref,
) {
    const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

    return (
        <div className="grid gap-1.5">
            {label ? (
                <label htmlFor={inputId} className="text-text-muted text-xs font-medium">
                    {label}
                </label>
            ) : null}
            <input
                ref={ref}
                id={inputId}
                className={`border-border bg-surface text-text placeholder:text-text-dim focus:border-accent w-full rounded-lg border px-3 py-2 text-sm transition-all duration-150 focus:shadow-[0_0_0_3px_var(--color-accent-glow)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${error ? "border-danger focus:border-danger focus:shadow-[0_0_0_3px_var(--color-danger-glow)]" : ""} ${className ?? ""}`}
                {...props}
            />
            {error ? <p className="text-danger text-xs">{error}</p> : null}
        </div>
    );
});

type SelectProps = ComponentProps<"select"> & {
    label?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { label, className, id, children, ...props },
    ref,
) {
    const selectId = id ?? (label ? `select-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

    return (
        <div className="grid gap-1.5">
            {label ? (
                <label htmlFor={selectId} className="text-text-muted text-xs font-medium">
                    {label}
                </label>
            ) : null}
            <select
                ref={ref}
                id={selectId}
                className={`border-border bg-surface text-text focus:border-accent w-full rounded-lg border px-3 py-2 text-sm transition-all duration-150 focus:shadow-[0_0_0_3px_var(--color-accent-glow)] focus:outline-none disabled:opacity-50 ${className ?? ""}`}
                {...props}
            >
                {children}
            </select>
        </div>
    );
});
