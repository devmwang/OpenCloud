import { FolderGridCell, FileGridCell } from "@/components/file-system/grid/grid-cell";

export function GridLayout({
    folders,
    files,
}: {
    folders: { id: string; folderName: string }[];
    files: { id: string; fileName: string }[];
}) {
    return (
        <>
            <div className="mb-2 text-xl font-medium">Folders</div>
            <div className="mb-6 grid grid-cols-fs-grid-view gap-4">
                {folders.map((folder) => {
                    return (
                        <div key={folder.id}>
                            <FolderGridCell folderId={folder.id} folderName={folder.folderName} />
                        </div>
                    );
                })}
            </div>

            <div className="mb-2 text-xl font-medium">Files</div>
            <div className="mb-6 grid grid-cols-fs-grid-view gap-4">
                {files.map((file) => {
                    return (
                        <div key={file.id}>
                            <FileGridCell fileId={file.id} fileName={file.fileName} />
                        </div>
                    );
                })}
            </div>
        </>
    );
}
