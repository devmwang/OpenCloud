import { useEffect, useRef, type ReactNode } from "react";

import { SelectionContext, SelectionStore, type SelectionItem } from "@/features/folder/hooks/use-selection";

type SelectionProviderProps = {
    orderedIds: string[];
    itemsById: Map<string, SelectionItem>;
    children: ReactNode;
};

export function SelectionProvider({ orderedIds, itemsById, children }: SelectionProviderProps) {
    const storeRef = useRef<SelectionStore | null>(null);

    if (!storeRef.current) {
        storeRef.current = new SelectionStore(orderedIds, itemsById);
    }

    const store = storeRef.current;

    useEffect(() => {
        store.updateSourceData(orderedIds, itemsById);
    }, [store, orderedIds, itemsById]);

    return <SelectionContext.Provider value={store}>{children}</SelectionContext.Provider>;
}
