type LoadingStateProps = {
    message?: string;
};

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
    return (
        <div className="flex flex-col items-center justify-center px-4 py-14" role="status" aria-live="polite">
            <div className="relative mb-4 h-10 w-10">
                <div className="border-border absolute inset-0 rounded-full border-2" />
                <div className="border-t-accent absolute inset-0 animate-spin rounded-full border-2 border-transparent" />
            </div>
            <p className="text-text-muted text-sm">{message}</p>
        </div>
    );
}
