import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type CreateFolderDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (folderName: string) => Promise<void>;
};

export function CreateFolderDialog({ open, onOpenChange, onSubmit }: CreateFolderDialogProps) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const name = inputRef.current?.value.trim();
        if (!name) return;

        setPending(true);
        setError(null);

        try {
            await onSubmit(name);
            onOpenChange(false);
            if (inputRef.current) inputRef.current.value = "";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create folder");
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent title="Create New Folder" description="Enter a name for the new folder.">
                <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
                    <Input
                        ref={inputRef}
                        label="Folder Name"
                        placeholder="My Folder"
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
                            Create Folder
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
