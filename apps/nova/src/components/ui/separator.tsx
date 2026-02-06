type SeparatorProps = {
    className?: string;
    orientation?: "horizontal" | "vertical";
};

export function Separator({ className, orientation = "horizontal" }: SeparatorProps) {
    if (orientation === "vertical") {
        return <div className={`bg-border w-px self-stretch ${className ?? ""}`} role="separator" />;
    }

    return <div className={`bg-border h-px w-full ${className ?? ""}`} role="separator" />;
}
