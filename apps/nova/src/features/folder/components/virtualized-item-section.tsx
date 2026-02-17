import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { DisplayType } from "@/features/folder/api";

type VirtualizedItemSectionProps<TItem> = {
    items: TItem[];
    getItemId: (item: TItem) => string;
    renderItem: (item: TItem) => ReactNode;
    displayType: DisplayType;
    gridMinColumnWidth: number;
    gridGapPx: number;
    gridEstimateHeight: number;
    listEstimateHeight: number;
    listGapPx?: number;
    overscan?: number;
    layoutKey?: string | number | boolean;
};

export function VirtualizedItemSection<TItem>({
    items,
    getItemId,
    renderItem,
    displayType,
    gridMinColumnWidth,
    gridGapPx,
    gridEstimateHeight,
    listEstimateHeight,
    listGapPx = 2,
    overscan = 8,
    layoutKey,
}: VirtualizedItemSectionProps<TItem>) {
    const sectionRef = useRef<HTMLDivElement | null>(null);
    const [columnCount, setColumnCount] = useState(1);
    const [scrollMargin, setScrollMargin] = useState(0);

    const measureLayout = useCallback(() => {
        const section = sectionRef.current;
        if (!section || typeof window === "undefined") {
            return;
        }

        const nextScrollMargin = section.getBoundingClientRect().top + window.scrollY;
        setScrollMargin((previous) => (Math.abs(previous - nextScrollMargin) < 1 ? previous : nextScrollMargin));

        const width = section.clientWidth;
        const nextColumnCount = Math.max(1, Math.floor((width + gridGapPx) / (gridMinColumnWidth + gridGapPx)));
        setColumnCount((previous) => (previous === nextColumnCount ? previous : nextColumnCount));
    }, [gridGapPx, gridMinColumnWidth]);

    useEffect(() => {
        measureLayout();
    }, [measureLayout, items.length, displayType, layoutKey]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const onWindowResize = () => {
            measureLayout();
        };

        window.addEventListener("resize", onWindowResize);

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined" && sectionRef.current) {
            resizeObserver = new ResizeObserver(() => {
                measureLayout();
            });
            resizeObserver.observe(sectionRef.current);
        }

        return () => {
            window.removeEventListener("resize", onWindowResize);
            resizeObserver?.disconnect();
        };
    }, [measureLayout]);

    const rowCount = useMemo(() => {
        if (displayType === "GRID") {
            return Math.ceil(items.length / Math.max(columnCount, 1));
        }

        return items.length;
    }, [displayType, items.length, columnCount]);

    const estimateSize = useCallback(() => {
        if (displayType === "GRID") {
            return gridEstimateHeight + gridGapPx;
        }

        return listEstimateHeight + listGapPx;
    }, [displayType, gridEstimateHeight, gridGapPx, listEstimateHeight, listGapPx]);

    const virtualizer = useWindowVirtualizer({
        count: rowCount,
        estimateSize,
        overscan,
        scrollMargin,
    });

    const virtualRows = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();

    return (
        <div ref={sectionRef} className="relative w-full">
            <div className="relative w-full" style={{ height: `${totalSize}px` }}>
                {virtualRows.map((virtualRow) => {
                    const baseStyle: CSSProperties = {
                        transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                    };

                    if (displayType === "GRID") {
                        const start = virtualRow.index * columnCount;
                        const end = Math.min(start + columnCount, items.length);
                        const rowItems = items.slice(start, end);
                        const isLastRow = virtualRow.index === rowCount - 1;

                        return (
                            <div key={virtualRow.key} className="absolute top-0 left-0 w-full" style={baseStyle}>
                                <div
                                    className="grid"
                                    style={{
                                        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                                        columnGap: `${gridGapPx}px`,
                                        paddingBottom: isLastRow ? 0 : `${gridGapPx}px`,
                                    }}
                                >
                                    {rowItems.map((item) => (
                                        <div key={getItemId(item)}>{renderItem(item)}</div>
                                    ))}
                                </div>
                            </div>
                        );
                    }

                    const item = items[virtualRow.index];
                    if (!item) {
                        return null;
                    }

                    const isLastItem = virtualRow.index === items.length - 1;

                    return (
                        <div key={virtualRow.key} className="absolute top-0 left-0 w-full" style={baseStyle}>
                            <div style={{ paddingBottom: isLastItem ? 0 : `${listGapPx}px` }}>{renderItem(item)}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
