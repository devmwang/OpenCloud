import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";

type ContextMenuProps = {
    children: ReactNode;
    trigger: ReactNode;
};

export function ContextMenu({ children, trigger }: ContextMenuProps) {
    return (
        <BaseContextMenu.Root>
            <BaseContextMenu.Trigger className="contents">{trigger}</BaseContextMenu.Trigger>
            <Menu.Portal>
                <Menu.Positioner className="z-[100]" sideOffset={6}>
                    <Menu.Popup className="border-border-bright bg-surface/95 min-w-[200px] origin-[var(--transform-origin)] rounded-lg border p-1 shadow-2xl shadow-black/50 backdrop-blur-xl transition-all duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
                        {children}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </BaseContextMenu.Root>
    );
}

type ContextMenuItemProps = {
    children: ReactNode;
    icon?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: "default" | "danger";
    className?: string;
};

export function ContextMenuItem({
    children,
    icon,
    onClick,
    disabled,
    variant = "default",
    className,
}: ContextMenuItemProps) {
    const variantClasses =
        variant === "danger"
            ? "text-danger data-[highlighted]:bg-danger-glow"
            : "text-text data-[highlighted]:bg-surface-raised";

    return (
        <Menu.Item
            className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-75 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 ${variantClasses} ${className ?? ""}`}
            onClick={onClick}
            disabled={disabled}
        >
            {icon ? <span className="h-5 w-5 shrink-0 [&>svg]:h-5 [&>svg]:w-5">{icon}</span> : null}
            {children}
        </Menu.Item>
    );
}

export function ContextMenuSeparator() {
    return <Menu.Separator className="bg-border my-1 h-px" />;
}

type ContextMenuLabelProps = {
    children: ReactNode;
};

export function ContextMenuLabel({ children }: ContextMenuLabelProps) {
    return (
        <Menu.Group>
            <Menu.GroupLabel className="text-text-dim px-3 py-1 text-xs font-medium">{children}</Menu.GroupLabel>
        </Menu.Group>
    );
}
