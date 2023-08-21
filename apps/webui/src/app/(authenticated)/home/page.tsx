import { getServerSession } from "@/components/auth/server-session";

import { FolderViewComponent } from "@/app/(authenticated)/folder/[folderId]/page";

export default async function Home() {
    const session = await getServerSession();

    return (
        <>
            <FolderViewComponent params={{ folderId: session.data.user.rootFolderId }} />
        </>
    );
}
