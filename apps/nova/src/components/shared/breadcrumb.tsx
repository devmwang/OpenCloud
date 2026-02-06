import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { Link } from "@tanstack/react-router";

type BreadcrumbItem = {
    id: string;
    name: string;
};

type BreadcrumbProps = {
    trail: BreadcrumbItem[];
    currentName: string;
};

export function Breadcrumb({ trail, currentName }: BreadcrumbProps) {
    return (
        <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
            {trail.map((entry) => (
                <span key={entry.id} className="flex items-center gap-1">
                    <Link
                        to="/folder/$folderId"
                        params={{ folderId: entry.id }}
                        className="text-text-muted hover:text-text no-underline transition-colors"
                    >
                        {entry.name}
                    </Link>
                    <ChevronRightIcon className="text-text-dim h-3.5 w-3.5 shrink-0" />
                </span>
            ))}
            <span className="text-text truncate font-medium">{currentName}</span>
        </nav>
    );
}
