export default function RootUnauthenticatedLayout({ children }: { children: React.ReactNode }) {
    return <body className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-white">{children}</body>;
}
