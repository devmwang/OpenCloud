import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SelectionItem } from "@/features/folder/hooks/use-selection";

type RenameItemDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: SelectionItem | null;
    onSubmit: (nextName: string) => Promise<void>;
};

export function RenameItemDialog({ open, onOpenChange, item, onSubmit }: RenameItemDialogProps) {
    const [name, setName] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stableItem, setStableItem] = useState<SelectionItem | null>(item);

    useEffect(() => {
        if (item) {
            setStableItem(item);
        }
    }, [item]);

    useEffect(() => {
        if (!open) {
            setPending(false);
            setError(null);
            setName("");
            return;
        }

        setPending(false);
        setError(null);
        setName(item?.name ?? "");
    }, [open, item]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!item) {
            return;
        }

        const nextName = name.trim();
        if (!nextName) {
            setError("Name cannot be empty");
            return;
        }

        if (nextName === item.name) {
            onOpenChange(false);
            return;
        }

        setPending(true);
        setError(null);

        try {
            await onSubmit(nextName);
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to rename item");
        } finally {
            setPending(false);
        }
    };

    const title = stableItem ? `Rename ${stableItem.kind === "file" ? "File" : "Folder"}` : "Rename Item";
    const description = stableItem ? `Enter a new name for "${stableItem.name}".` : "Enter a new name.";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent title={title} description={description}>
                <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
                    <Input
                        label="Name"
                        placeholder="Enter a new name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        autoFocus
                        error={error ?? undefined}
                    />

                    <div className="flex items-center justify-end gap-2.5">
                        <DialogClose>
                            <Button type="button" variant="ghost" disabled={pending}>
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button type="submit" loading={pending}>
                            Rename
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
