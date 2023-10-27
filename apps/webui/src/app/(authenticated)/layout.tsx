import Sidebar from "@/app/(authenticated)/sidebar";
import StatusBar from "@/app/(authenticated)/status-bar";

export default function RootAuthenticatedLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="absolute grid h-full w-full grid-cols-core-layout grid-rows-core-layout">
            <div className="col-span-2 row-start-1 row-end-1">
                <StatusBar />
            </div>

            <div className="col-span-1 row-start-2 row-end-2">
                <Sidebar />
            </div>

            <div className="col-start-2 row-start-2 row-end-2 overflow-y-auto">
                <div className="flex h-full w-full grow">{children}</div>
            </div>
        </div>
    );
}
