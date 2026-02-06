type SkeletonProps = {
    className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
    return <div className={`skeleton ${className ?? ""}`} />;
}

export function SkeletonCard() {
    return (
        <div className="border-border bg-surface space-y-3 rounded-xl border p-4">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
        </div>
    );
}

export function SkeletonRow() {
    return (
        <div className="border-border bg-surface flex items-center gap-3 rounded-lg border p-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
            </div>
        </div>
    );
}
