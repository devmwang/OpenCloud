import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";

type Toast = {
    id: string;
    message: string;
    type: ToastType;
};

type ToastContextValue = {
    toasts: Toast[];
    addToast: (message: string, type?: ToastType) => void;
    removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType = "info") => {
        const id = crypto.randomUUID();
        setToasts((prev) => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
}

const typeStyles: Record<ToastType, string> = {
    success: "border-success/30 bg-success-glow",
    error: "border-danger/30 bg-danger-glow",
    info: "border-accent/30 bg-accent-glow",
};

const typeIcons: Record<ToastType, string> = {
    success: "text-success",
    error: "text-danger",
    info: "text-accent",
};

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
    if (toasts.length === 0) return null;

    return (
        <div
            className="fixed right-4 bottom-4 z-[200] flex max-w-sm flex-col gap-2"
            role="region"
            aria-label="Notifications"
            aria-live="polite"
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`flex animate-[slide-up_150ms_ease-out] items-center gap-3 rounded-lg border px-4 py-3 shadow-lg shadow-black/30 backdrop-blur-sm ${typeStyles[toast.type]}`}
                >
                    <span className={`shrink-0 text-sm font-medium ${typeIcons[toast.type]}`}>
                        {toast.type === "success" ? "\u2713" : toast.type === "error" ? "\u2717" : "\u2139"}
                    </span>
                    <p className="text-text flex-1 text-sm">{toast.message}</p>
                    <button
                        type="button"
                        onClick={() => onRemove(toast.id)}
                        className="text-text-dim hover:text-text shrink-0 cursor-pointer transition-colors"
                        aria-label="Dismiss"
                    >
                        <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 14 14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M1 1l12 12M13 1L1 13" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
}
