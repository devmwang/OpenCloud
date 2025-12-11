import Modal from "@/components/file-system/file-view/modal";

export default function FileViewModalLayout({ children }: { children: React.ReactNode }) {
    return (
        <Modal>
            <div className="grid h-full w-full grid-rows-file-view-modal rounded-xl bg-zinc-50 dark:bg-zinc-900">
                {children}
            </div>
        </Modal>
    );
}
