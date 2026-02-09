import { useCallback, useEffect, useRef, useState } from "react";

import { ViewToolbar } from "./view-toolbar";

type ImageViewerProps = {
    src: string;
    fileName?: string;
};

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;
const WHEEL_ZOOM_FACTOR = 0.001;

export function ImageViewer({ src, fileName }: ImageViewerProps) {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const positionAtDragStartRef = useRef({ x: 0, y: 0 });

    const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

    const handleZoomIn = useCallback(() => {
        setScale((prev) => clampScale(prev + ZOOM_STEP));
    }, []);

    const handleZoomOut = useCallback(() => {
        setScale((prev) => {
            const next = clampScale(prev - ZOOM_STEP);
            if (next <= 1) {
                setPosition({ x: 0, y: 0 });
            }
            return next;
        });
    }, []);

    const handleReset = useCallback(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, []);

    /* ---- Mouse-wheel zoom (centered on cursor) ---- */
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();

            const rect = container.getBoundingClientRect();
            const cursorX = e.clientX - rect.left - rect.width / 2;
            const cursorY = e.clientY - rect.top - rect.height / 2;

            setScale((prevScale) => {
                const delta = -e.deltaY * WHEEL_ZOOM_FACTOR;
                const nextScale = clampScale(prevScale * (1 + delta));
                const ratio = nextScale / prevScale;

                setPosition((prevPos) => {
                    if (nextScale <= 1) return { x: 0, y: 0 };
                    return {
                        x: cursorX - ratio * (cursorX - prevPos.x),
                        y: cursorY - ratio * (cursorY - prevPos.y),
                    };
                });

                return nextScale;
            });
        };

        container.addEventListener("wheel", onWheel, { passive: false });
        return () => container.removeEventListener("wheel", onWheel);
    }, []);

    /* ---- Pan via mouse drag ---- */
    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (scale <= 1) return;
            e.preventDefault();
            setIsDragging(true);
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            positionAtDragStartRef.current = { ...position };
        },
        [scale, position],
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;
            setPosition({
                x: positionAtDragStartRef.current.x + dx,
                y: positionAtDragStartRef.current.y + dy,
            });
        },
        [isDragging],
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    /* ---- Keyboard shortcuts ---- */
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = (document.activeElement?.tagName ?? "").toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select") return;

            switch (e.key) {
                case "+":
                case "=":
                    e.preventDefault();
                    handleZoomIn();
                    break;
                case "-":
                    e.preventDefault();
                    handleZoomOut();
                    break;
                case "0":
                    e.preventDefault();
                    handleReset();
                    break;
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [handleZoomIn, handleZoomOut, handleReset]);

    const cursor = scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default";

    return (
        <div
            ref={containerRef}
            className={`relative h-full w-full overflow-hidden bg-[#0a0e17] ${cursor}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <img
                src={src}
                alt="File Preview"
                loading="lazy"
                draggable={false}
                className="h-full w-full object-contain select-none"
                style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transition: isDragging ? "none" : "transform 150ms ease-out",
                }}
            />

            <ViewToolbar
                scale={scale}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onReset={handleReset}
                downloadUrl={src}
                fileName={fileName}
                minScale={MIN_SCALE}
                maxScale={MAX_SCALE}
            />
        </div>
    );
}
