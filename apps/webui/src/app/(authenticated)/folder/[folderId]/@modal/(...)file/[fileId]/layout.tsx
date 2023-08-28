import Modal from "@/components/file-system/file-view/modal";

export default function FileViewModalLayout({ children }: { children: React.ReactNode }) {
    return (
        <Modal>
            <div className="grid grid-rows-file-view-modal h-full w-full rounded-xl bg-zinc-900">{children}</div>
        </Modal>
    );
}
