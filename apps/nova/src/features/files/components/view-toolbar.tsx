import {
    ArrowDownTrayIcon,
    ArrowsPointingInIcon,
    MagnifyingGlassMinusIcon,
    MagnifyingGlassPlusIcon,
} from "@heroicons/react/24/outline";

type ViewToolbarProps = {
    /** Current zoom scale (1 = 100%). Omit to hide zoom controls. */
    scale?: number;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onReset?: () => void;
    /** Direct download URL for the file. */
    downloadUrl: string;
    /** File name used for the download attribute. */
    fileName?: string;
    /** Minimum scale value — dims the zoom-out button at this limit. */
    minScale?: number;
    /** Maximum scale value — dims the zoom-in button at this limit. */
    maxScale?: number;
};

const toolbarButton =
    "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/10 hover:text-text disabled:pointer-events-none disabled:opacity-30";

export function ViewToolbar({
    scale,
    onZoomIn,
    onZoomOut,
    onReset,
    downloadUrl,
    fileName,
    minScale = 0.25,
    maxScale = 5,
}: ViewToolbarProps) {
    const showZoom = scale !== undefined && onZoomIn && onZoomOut && onReset;

    return (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
            {showZoom ? (
                <>
                    <button
                        type="button"
                        className={toolbarButton}
                        onClick={onZoomOut}
                        disabled={scale <= minScale}
                        aria-label="Zoom out"
                    >
                        <MagnifyingGlassMinusIcon className="h-4.5 w-4.5" />
                    </button>

                    <button
                        type="button"
                        className="text-text-muted hover:text-text flex h-8 min-w-[3.25rem] shrink-0 cursor-pointer items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums transition-colors hover:bg-white/10"
                        onClick={onReset}
                        aria-label="Reset zoom"
                    >
                        {Math.round(scale * 100)}%
                    </button>

                    <button
                        type="button"
                        className={toolbarButton}
                        onClick={onZoomIn}
                        disabled={scale >= maxScale}
                        aria-label="Zoom in"
                    >
                        <MagnifyingGlassPlusIcon className="h-4.5 w-4.5" />
                    </button>

                    {/* Separator */}
                    <div className="mx-0.5 h-4 w-px bg-white/15" aria-hidden="true" />

                    <button type="button" className={toolbarButton} onClick={onReset} aria-label="Fit to view">
                        <ArrowsPointingInIcon className="h-4.5 w-4.5" />
                    </button>

                    {/* Separator */}
                    <div className="mx-0.5 h-4 w-px bg-white/15" aria-hidden="true" />
                </>
            ) : null}

            <a href={downloadUrl} download={fileName ?? true} className={toolbarButton} aria-label="Download file">
                <ArrowDownTrayIcon className="h-4.5 w-4.5" />
            </a>
        </div>
    );
}
