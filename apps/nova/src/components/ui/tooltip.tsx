import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

import { getPortalRoot } from "@/lib/portal-root";

type TooltipProps = {
    children: ReactNode;
    content: string;
    side?: "top" | "bottom" | "left" | "right";
};

export function Tooltip({ children, content, side = "top" }: TooltipProps) {
    return (
        <BaseTooltip.Provider>
            <BaseTooltip.Root>
                <BaseTooltip.Trigger className="contents" render={<span />}>
                    {children}
                </BaseTooltip.Trigger>
                <BaseTooltip.Portal container={getPortalRoot()}>
                    <BaseTooltip.Positioner side={side} sideOffset={8}>
                        <BaseTooltip.Popup className="bg-surface-raised border-border-bright text-text rounded-lg border px-3 py-2 text-xs shadow-lg shadow-black/30 transition-opacity duration-100 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
                            {content}
                        </BaseTooltip.Popup>
                    </BaseTooltip.Positioner>
                </BaseTooltip.Portal>
            </BaseTooltip.Root>
        </BaseTooltip.Provider>
    );
}
