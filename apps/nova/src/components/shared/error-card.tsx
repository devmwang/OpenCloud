import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";

type ErrorCardProps = {
    message: string;
    onRetry?: () => void;
};

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
    return (
        <div className="flex flex-col items-center justify-center px-4 py-14">
            <div className="bg-danger-glow border-danger/20 mb-4 flex h-14 w-14 items-center justify-center rounded-xl border">
                <ExclamationTriangleIcon className="text-danger h-7 w-7" />
            </div>
            <h3 className="text-text mb-1 text-base font-medium">Something went wrong</h3>
            <p className="text-text-muted mb-4 max-w-md text-center text-sm">{message}</p>
            {onRetry ? (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                    Try Again
                </Button>
            ) : null}
        </div>
    );
}
