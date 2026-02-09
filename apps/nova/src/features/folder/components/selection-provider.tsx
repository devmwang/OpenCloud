import type { ReactNode } from "react";

import { SelectionContext, useSelectionState, type SelectionItem } from "@/features/folder/hooks/use-selection";

type SelectionProviderProps = {
    orderedIds: string[];
    itemsById: Map<string, SelectionItem>;
    children: ReactNode;
};

export function SelectionProvider({ orderedIds, itemsById, children }: SelectionProviderProps) {
    const selection = useSelectionState(orderedIds, itemsById);

    return <SelectionContext.Provider value={selection}>{children}</SelectionContext.Provider>;
}
