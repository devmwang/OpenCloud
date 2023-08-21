import { getServerSession } from "@/components/auth/server-session";

export default async function Home() {
    const session = await getServerSession();

    return (
        <>
            <div className="m-6">Home View Placeholder Content. Root Folder ID: {session.data.user.rootFolderId}</div>
        </>
    );
}
