import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

export type SelectionItem = {
    id: string;
    kind: "file" | "folder";
    name: string;
};

export type SelectionInputEvent = {
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
};

export type SelectedItemsSnapshot = {
    selected: Map<string, SelectionItem>;
    selectedFiles: SelectionItem[];
    selectedFolders: SelectionItem[];
    selectionCount: number;
};

export type SelectionActions = {
    handleItemClick: (item: SelectionItem, event: SelectionInputEvent) => void;
    clearSelection: () => void;
    selectAll: (items: SelectionItem[]) => void;
    resolveActionTargets: (fallbackItem: SelectionItem) => SelectionItem[];
    getSelectedItemsSnapshot: () => SelectedItemsSnapshot;
};

const EMPTY_SELECTED_ITEMS_SNAPSHOT: SelectedItemsSnapshot = {
    selected: new Map<string, SelectionItem>(),
    selectedFiles: [],
    selectedFolders: [],
    selectionCount: 0,
};

const EMPTY_COUNT = 0;
const EMPTY_SELECTED = false;
const EMPTY_MULTI_SELECTED = false;

const isSelectionPerfDebugEnabled = () => {
    if (!import.meta.env.DEV || typeof window === "undefined") {
        return false;
    }

    return (window as Window & { __OC_SELECTION_PERF__?: boolean }).__OC_SELECTION_PERF__ === true;
};

export class SelectionStore {
    private orderedIds: string[] = [];
    private orderedIndexById = new Map<string, number>();
    private itemsById = new Map<string, SelectionItem>();

    private selected = new Map<string, SelectionItem>();
    private selectedFiles: SelectionItem[] = [];
    private selectedFolders: SelectionItem[] = [];
    private selectedSnapshot: SelectedItemsSnapshot = EMPTY_SELECTED_ITEMS_SNAPSHOT;

    private lastClickedId: string | null = null;

    private selectionListeners = new Set<() => void>();
    private selectionCountListeners = new Set<() => void>();
    private itemListeners = new Map<string, Set<() => void>>();

    public readonly actions: SelectionActions = {
        handleItemClick: (item, event) => {
            this.runMeasuredAction("handleItemClick", () => {
                this.handleItemClickInternal(item, event);
            });
        },
        clearSelection: () => {
            this.runMeasuredAction("clearSelection", () => {
                this.clearSelectionInternal();
            });
        },
        selectAll: (items) => {
            this.runMeasuredAction("selectAll", () => {
                this.selectAllInternal(items);
            });
        },
        resolveActionTargets: (fallbackItem) => this.resolveActionTargets(fallbackItem),
        getSelectedItemsSnapshot: () => this.getSelectedItemsSnapshot(),
    };

    constructor(orderedIds: string[], itemsById: Map<string, SelectionItem>) {
        this.updateSourceData(orderedIds, itemsById);
    }

    public updateSourceData(orderedIds: string[], itemsById: Map<string, SelectionItem>) {
        this.orderedIds = orderedIds;
        this.itemsById = itemsById;
        this.orderedIndexById = new Map(orderedIds.map((id, index) => [id, index]));

        if (this.lastClickedId && !this.orderedIndexById.has(this.lastClickedId)) {
            this.lastClickedId = null;
        }

        if (this.selected.size === 0) {
            return;
        }

        let changed = false;
        const nextSelected = new Map<string, SelectionItem>();
        const changedIds = new Set<string>();

        for (const [id, item] of this.selected) {
            const resolved = this.itemsById.get(id);
            if (!resolved) {
                changed = true;
                changedIds.add(id);
                continue;
            }

            nextSelected.set(id, resolved);
            if (resolved.kind !== item.kind || resolved.name !== item.name) {
                changed = true;
                changedIds.add(id);
            }
        }

        if (!changed && nextSelected.size === this.selected.size) {
            return;
        }

        this.commitSelected(nextSelected, changedIds);
    }

    public getSelectionCount() {
        return this.selected.size;
    }

    public getSelectedItemsSnapshot() {
        return this.selectedSnapshot;
    }

    public isSelected(id: string) {
        return this.selected.has(id);
    }

    public isItemInMultiSelection(id: string) {
        return this.selected.size > 1 && this.selected.has(id);
    }

    public subscribeSelection(listener: () => void) {
        this.selectionListeners.add(listener);
        return () => {
            this.selectionListeners.delete(listener);
        };
    }

    public subscribeSelectionCount(listener: () => void) {
        this.selectionCountListeners.add(listener);
        return () => {
            this.selectionCountListeners.delete(listener);
        };
    }

    public subscribeItem(id: string, listener: () => void) {
        let listeners = this.itemListeners.get(id);
        if (!listeners) {
            listeners = new Set<() => void>();
            this.itemListeners.set(id, listeners);
        }

        listeners.add(listener);

        return () => {
            const current = this.itemListeners.get(id);
            if (!current) {
                return;
            }

            current.delete(listener);

            if (current.size === 0) {
                this.itemListeners.delete(id);
            }
        };
    }

    private handleItemClickInternal(item: SelectionItem, event: SelectionInputEvent) {
        const isMeta = event.metaKey || event.ctrlKey;
        const isShift = event.shiftKey;

        if (isShift && this.lastClickedId) {
            const anchorIndex = this.orderedIndexById.get(this.lastClickedId);
            const targetIndex = this.orderedIndexById.get(item.id);

            if (anchorIndex !== undefined && targetIndex !== undefined) {
                const start = Math.min(anchorIndex, targetIndex);
                const end = Math.max(anchorIndex, targetIndex);

                const next = isMeta ? new Map(this.selected) : new Map<string, SelectionItem>();

                for (let i = start; i <= end; i++) {
                    const id = this.orderedIds[i];
                    if (!id) {
                        continue;
                    }

                    const resolved = this.itemsById.get(id);
                    if (resolved) {
                        next.set(id, resolved);
                    }
                }

                this.commitSelected(next);
            }

            // Keep anchor stable for shift-range additions.
            return;
        }

        if (isMeta) {
            const next = new Map(this.selected);
            if (next.has(item.id)) {
                next.delete(item.id);
            } else {
                next.set(item.id, item);
            }
            this.commitSelected(next);
        } else {
            const next = new Map<string, SelectionItem>();
            next.set(item.id, item);
            this.commitSelected(next);
        }

        this.lastClickedId = item.id;
    }

    private clearSelectionInternal() {
        if (this.selected.size > 0) {
            this.commitSelected(new Map<string, SelectionItem>());
        }

        this.lastClickedId = null;
    }

    private selectAllInternal(items: SelectionItem[]) {
        const next = new Map<string, SelectionItem>();
        for (const item of items) {
            next.set(item.id, item);
        }

        this.commitSelected(next);
        this.lastClickedId = null;
    }

    private resolveActionTargets(fallbackItem: SelectionItem) {
        if (this.selected.size > 1 && this.selected.has(fallbackItem.id)) {
            return [...this.selected.values()];
        }

        return [fallbackItem];
    }

    private commitSelected(nextSelected: Map<string, SelectionItem>, knownChangedIds?: Set<string>) {
        const previousSelected = this.selected;

        if (this.areSelectionsEquivalent(previousSelected, nextSelected)) {
            return;
        }

        this.selected = nextSelected;
        this.rebuildDerivedSelection();
        this.notifySelectionListeners(previousSelected, nextSelected, knownChangedIds);
    }

    private rebuildDerivedSelection() {
        const nextFiles: SelectionItem[] = [];
        const nextFolders: SelectionItem[] = [];

        for (const item of this.selected.values()) {
            if (item.kind === "file") {
                nextFiles.push(item);
            } else {
                nextFolders.push(item);
            }
        }

        this.selectedFiles = nextFiles;
        this.selectedFolders = nextFolders;
        this.selectedSnapshot = {
            selected: this.selected,
            selectedFiles: this.selectedFiles,
            selectedFolders: this.selectedFolders,
            selectionCount: this.selected.size,
        };
    }

    private notifySelectionListeners(
        previousSelected: Map<string, SelectionItem>,
        nextSelected: Map<string, SelectionItem>,
        knownChangedIds?: Set<string>,
    ) {
        for (const listener of this.selectionListeners) {
            listener();
        }

        if (previousSelected.size !== nextSelected.size) {
            for (const listener of this.selectionCountListeners) {
                listener();
            }
        }

        const idsToNotify = knownChangedIds
            ? new Set(knownChangedIds)
            : this.computeChangedIds(previousSelected, nextSelected);

        if (previousSelected.size === 1 || nextSelected.size === 1) {
            for (const id of previousSelected.keys()) {
                idsToNotify.add(id);
            }
            for (const id of nextSelected.keys()) {
                idsToNotify.add(id);
            }
        }

        for (const id of idsToNotify) {
            const listeners = this.itemListeners.get(id);
            if (!listeners) {
                continue;
            }

            for (const listener of listeners) {
                listener();
            }
        }
    }

    private computeChangedIds(previous: Map<string, SelectionItem>, next: Map<string, SelectionItem>) {
        const changedIds = new Set<string>();

        for (const [id, item] of previous) {
            const nextItem = next.get(id);
            if (!nextItem) {
                changedIds.add(id);
                continue;
            }

            if (nextItem.kind !== item.kind || nextItem.name !== item.name) {
                changedIds.add(id);
            }
        }

        for (const id of next.keys()) {
            if (!previous.has(id)) {
                changedIds.add(id);
            }
        }

        return changedIds;
    }

    private areSelectionsEquivalent(previous: Map<string, SelectionItem>, next: Map<string, SelectionItem>) {
        if (previous.size !== next.size) {
            return false;
        }

        for (const [id, previousItem] of previous) {
            const nextItem = next.get(id);
            if (!nextItem) {
                return false;
            }

            if (nextItem.kind !== previousItem.kind || nextItem.name !== previousItem.name) {
                return false;
            }
        }

        return true;
    }

    private runMeasuredAction(label: string, action: () => void) {
        if (!isSelectionPerfDebugEnabled()) {
            action();
            return;
        }

        const start = performance.now();
        action();

        requestAnimationFrame(() => {
            const elapsed = performance.now() - start;
            console.debug(`[selection-perf] ${label}: ${elapsed.toFixed(1)}ms`, {
                selectionCount: this.selected.size,
            });
        });
    }
}

const SelectionContext = createContext<SelectionStore | null>(null);

function useSelectionStore() {
    const store = useContext(SelectionContext);
    if (!store) {
        throw new Error("Selection hooks must be used within a SelectionProvider");
    }

    return store;
}

export function useSelectionActions() {
    return useSelectionStore().actions;
}

export function useSelectionCount() {
    const store = useSelectionStore();

    return useSyncExternalStore(
        useCallback((listener: () => void) => store.subscribeSelectionCount(listener), [store]),
        useCallback(() => store.getSelectionCount(), [store]),
        () => EMPTY_COUNT,
    );
}

export function useSelectedItems() {
    const store = useSelectionStore();

    return useSyncExternalStore(
        useCallback((listener: () => void) => store.subscribeSelection(listener), [store]),
        useCallback(() => store.getSelectedItemsSnapshot(), [store]),
        () => EMPTY_SELECTED_ITEMS_SNAPSHOT,
    );
}

export function useIsItemSelected(id: string) {
    const store = useSelectionStore();

    return useSyncExternalStore(
        useCallback((listener: () => void) => store.subscribeItem(id, listener), [store, id]),
        useCallback(() => store.isSelected(id), [store, id]),
        () => EMPTY_SELECTED,
    );
}

export function useIsItemInMultiSelection(id: string) {
    const store = useSelectionStore();

    return useSyncExternalStore(
        useCallback((listener: () => void) => store.subscribeItem(id, listener), [store, id]),
        useCallback(() => store.isItemInMultiSelection(id), [store, id]),
        () => EMPTY_MULTI_SELECTED,
    );
}

export { SelectionContext };
