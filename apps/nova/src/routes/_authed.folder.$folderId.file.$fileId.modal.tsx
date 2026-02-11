import { XMarkIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import { getFileDetails, normalizeFileId } from "@/features/files/api";
import { PreviewPane } from "@/features/files/components/preview-pane";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authed/folder/$folderId/file/$fileId/modal")({
    component: FileModalRoute,
});

const canNavigateBackInApp = () => {
    if (typeof window === "undefined") {
        return false;
    }

    const historyState = window.history.state as { __TSR_index?: unknown } | null;
    return typeof historyState?.__TSR_index === "number" && historyState.__TSR_index > 0;
};

const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

function FileModalRoute() {
    const { folderId, fileId } = Route.useParams();
    const router = useRouter();
    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    const normalizedFileId = normalizeFileId(fileId);

    const detailsQuery = useQuery({
        queryKey: queryKeys.fileDetails(normalizedFileId),
        queryFn: () => getFileDetails(normalizedFileId),
    });

    const closeModal = useCallback(async () => {
        if (canNavigateBackInApp()) {
            router.history.back();
            return;
        }

        await router.navigate({
            to: "/folder/$folderId",
            params: { folderId },
            replace: true,
        });
    }, [router, folderId]);

    useEffect(() => {
        const modal = modalRef.current;
        if (!modal) {
            return;
        }

        const previousFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        const getFocusableElements = () =>
            Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
                (element) => element.getAttribute("aria-hidden") !== "true",
            );

        const setInitialFocus = () => {
            closeButtonRef.current?.focus();
        };

        setInitialFocus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                void closeModal();
                return;
            }

            if (event.key !== "Tab") {
                return;
            }

            const focusableElements = getFocusableElements();
            if (focusableElements.length === 0) {
                event.preventDefault();
                modal.focus();
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement;

            if (event.shiftKey) {
                if (activeElement === firstElement || !modal.contains(activeElement)) {
                    event.preventDefault();
                    lastElement?.focus();
                }
                return;
            }

            if (activeElement === lastElement || !modal.contains(activeElement)) {
                event.preventDefault();
                firstElement?.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            previousFocused?.focus();
        };
    }, [closeModal]);

    return (
        <div
            className="fixed inset-0 z-50 flex animate-[fade-in_150ms_ease-out] items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-7"
            onClick={() => void closeModal()}
            role="dialog"
            aria-modal="true"
            aria-label={detailsQuery.data?.name ?? "File preview"}
        >
            <div
                ref={modalRef}
                className="border-border bg-surface relative flex h-full max-h-[90vh] w-full max-w-5xl animate-[modal-enter_150ms_ease-out] flex-col overflow-hidden rounded-xl border shadow-2xl shadow-black/50"
                onClick={(event) => {
                    event.stopPropagation();
                }}
                tabIndex={-1}
            >
                {/* Header */}
                <header className="border-border flex shrink-0 items-center justify-between border-b px-5 py-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-text truncate text-sm font-semibold">
                            {detailsQuery.data?.name ?? "File"}
                        </h2>
                        {detailsQuery.data?.mimeType ? (
                            <span className="text-text-dim text-sm">{detailsQuery.data.mimeType}</span>
                        ) : null}
                    </div>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        className="text-text-muted hover:text-text hover:bg-surface-raised -mr-1 ml-6 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors"
                        onClick={() => void closeModal()}
                        aria-label="Close preview"
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </header>

                {/* Content */}
                <div className="min-h-0 flex-1">
                    {detailsQuery.isPending ? (
                        <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
                            <div className="flex flex-col items-center gap-3">
                                <div className="relative h-10 w-10">
                                    <div className="border-border absolute inset-0 rounded-full border-2" />
                                    <div className="border-t-accent absolute inset-0 animate-spin rounded-full border-2 border-transparent" />
                                </div>
                                <p className="text-text-muted text-sm">Loading file...</p>
                            </div>
                        </div>
                    ) : null}

                    {detailsQuery.error ? (
                        <div className="flex h-full items-center justify-center p-5">
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-danger text-sm">{getErrorMessage(detailsQuery.error)}</p>
                            </div>
                        </div>
                    ) : null}

                    {detailsQuery.data ? (
                        <div className="h-full">
                            <PreviewPane
                                fileRouteId={fileId}
                                fileName={detailsQuery.data.name}
                                fileType={detailsQuery.data.mimeType}
                                fileAccess={detailsQuery.data.access}
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
