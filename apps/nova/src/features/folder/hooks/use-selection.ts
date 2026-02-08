import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type SelectionItem = {
    id: string;
    kind: "file" | "folder";
    name: string;
};

type SelectionContextValue = {
    selected: Map<string, SelectionItem>;
    isSelected: (id: string) => boolean;
    selectionCount: number;
    handleItemClick: (item: SelectionItem, event: React.MouseEvent) => void;
    clearSelection: () => void;
    selectAll: (items: SelectionItem[]) => void;
    selectedFiles: SelectionItem[];
    selectedFolders: SelectionItem[];
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelection(): SelectionContextValue {
    const ctx = useContext(SelectionContext);
    if (!ctx) {
        throw new Error("useSelection must be used within a SelectionProvider");
    }
    return ctx;
}

export { SelectionContext };

/**
 * Core selection state management.
 *
 * @param orderedIds Flat array of all item IDs in render order (folders first, then files).
 * @param itemsById Lookup map so shift-range selection can resolve SelectionItem metadata.
 */
export function useSelectionState(orderedIds: string[], itemsById: Map<string, SelectionItem>) {
    const [selected, setSelected] = useState<Map<string, SelectionItem>>(() => new Map());
    const lastClickedIdRef = useRef<string | null>(null);

    // Keep stable refs so the handleItemClick callback doesn't need these as deps
    const orderedIdsRef = useRef(orderedIds);
    orderedIdsRef.current = orderedIds;
    const itemsByIdRef = useRef(itemsById);
    itemsByIdRef.current = itemsById;

    useEffect(() => {
        const availableIds = new Set(orderedIds);

        setSelected((previous) => {
            if (previous.size === 0) {
                return previous;
            }

            let changed = false;
            const next = new Map<string, SelectionItem>();

            for (const [id, item] of previous) {
                const resolved = availableIds.has(id) ? itemsById.get(id) : undefined;
                if (!resolved) {
                    changed = true;
                    continue;
                }

                next.set(id, resolved);
                if (resolved.kind !== item.kind || resolved.name !== item.name) {
                    changed = true;
                }
            }

            if (!changed && next.size === previous.size) {
                return previous;
            }

            return next;
        });

        if (lastClickedIdRef.current && !availableIds.has(lastClickedIdRef.current)) {
            lastClickedIdRef.current = null;
        }
    }, [orderedIds, itemsById]);

    const isSelected = useCallback((id: string) => selected.has(id), [selected]);
    const selectionCount = selected.size;

    const clearSelection = useCallback(() => {
        setSelected(new Map());
        lastClickedIdRef.current = null;
    }, []);

    const selectAll = useCallback((items: SelectionItem[]) => {
        const next = new Map<string, SelectionItem>();
        for (const item of items) {
            next.set(item.id, item);
        }
        setSelected(next);
        lastClickedIdRef.current = null;
    }, []);

    const handleItemClick = useCallback((item: SelectionItem, event: React.MouseEvent) => {
        const isMeta = event.metaKey || event.ctrlKey;
        const isShift = event.shiftKey;

        if (isShift && lastClickedIdRef.current) {
            const ids = orderedIdsRef.current;
            const lookup = itemsByIdRef.current;
            const anchorIndex = ids.indexOf(lastClickedIdRef.current);
            const targetIndex = ids.indexOf(item.id);

            if (anchorIndex >= 0 && targetIndex >= 0) {
                const start = Math.min(anchorIndex, targetIndex);
                const end = Math.max(anchorIndex, targetIndex);

                setSelected((prev) => {
                    const next = isMeta ? new Map(prev) : new Map<string, SelectionItem>();
                    for (let i = start; i <= end; i++) {
                        const id = ids[i];
                        if (id !== undefined) {
                            const resolved = lookup.get(id);
                            if (resolved) {
                                next.set(id, resolved);
                            }
                        }
                    }
                    return next;
                });
            }
            // Don't update lastClickedId on shift-click — keep the anchor
            return;
        }

        if (isMeta) {
            setSelected((prev) => {
                const next = new Map(prev);
                if (next.has(item.id)) {
                    next.delete(item.id);
                } else {
                    next.set(item.id, item);
                }
                return next;
            });
        } else {
            const next = new Map<string, SelectionItem>();
            next.set(item.id, item);
            setSelected(next);
        }

        lastClickedIdRef.current = item.id;
    }, []);

    const selectedFiles = useMemo(() => [...selected.values()].filter((i) => i.kind === "file"), [selected]);
    const selectedFolders = useMemo(() => [...selected.values()].filter((i) => i.kind === "folder"), [selected]);

    return useMemo(
        () => ({
            selected,
            isSelected,
            selectionCount,
            handleItemClick,
            clearSelection,
            selectAll,
            selectedFiles,
            selectedFolders,
        }),
        [
            selected,
            isSelected,
            selectionCount,
            handleItemClick,
            clearSelection,
            selectAll,
            selectedFiles,
            selectedFolders,
        ],
    );
}
