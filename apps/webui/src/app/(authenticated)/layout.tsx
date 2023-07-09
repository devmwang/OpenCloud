import Sidebar from "@/app/(authenticated)/sidebar";
import StatusBar from "@/app/(authenticated)/status-bar";

export default function RootAuthenticatedLayout({ children }: { children: React.ReactNode }) {
    return (
        <body className="absolute grid h-full w-full grid-cols-core-layout grid-rows-core-layout bg-zinc-50 dark:bg-zinc-900">
            <div className="col-span-2 row-start-1 row-end-1">
                <StatusBar />
            </div>

            <div className="col-span-1 row-start-2 row-end-2">
                <Sidebar />
            </div>

            <div className="col-start-2 row-start-2 row-end-2 overflow-y-auto">
                <div className="flex grow">{children}</div>
            </div>
        </body>
    );
}
