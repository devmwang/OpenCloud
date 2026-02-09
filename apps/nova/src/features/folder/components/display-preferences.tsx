import {
    ArrowDownIcon,
    ArrowUpIcon,
    CalendarDaysIcon,
    ListBulletIcon,
    Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import type { DisplayType, SortOrder, SortType } from "@/features/folder/api";

type DisplayPreferencesProps = {
    displayType: DisplayType;
    sortOrder: SortOrder;
    sortType: SortType;
    onDisplayTypeChange: (displayType: DisplayType) => void;
    onSortOrderChange: (sortOrder: SortOrder) => void;
    onSortTypeChange: (sortType: SortType) => void;
    disabled?: boolean;
};

const sortTypeLabels: Record<SortType, string> = {
    NAME: "Name",
    DATE_CREATED: "Date",
    SIZE: "Size",
};

const sortTypes: SortType[] = ["NAME", "DATE_CREATED", "SIZE"];

export function DisplayPreferences({
    displayType,
    sortOrder,
    sortType,
    onDisplayTypeChange,
    onSortOrderChange,
    onSortTypeChange,
    disabled,
}: DisplayPreferencesProps) {
    const toggleDisplayType = useCallback(() => {
        onDisplayTypeChange(displayType === "GRID" ? "LIST" : "GRID");
    }, [displayType, onDisplayTypeChange]);

    const toggleSortOrder = useCallback(() => {
        onSortOrderChange(sortOrder === "ASC" ? "DESC" : "ASC");
    }, [sortOrder, onSortOrderChange]);

    const cycleSortType = useCallback(() => {
        const currentIndex = sortTypes.indexOf(sortType);
        const nextIndex = (currentIndex + 1) % sortTypes.length;
        onSortTypeChange(sortTypes[nextIndex]!);
    }, [sortType, onSortTypeChange]);

    return (
        <div className="flex items-center gap-1">
            {/* Sort type button */}
            <Button
                variant="ghost"
                size="sm"
                onClick={cycleSortType}
                disabled={disabled}
                title={`Sort by: ${sortTypeLabels[sortType]}`}
            >
                <CalendarDaysIcon className="h-4.5 w-4.5" />
                <span className="text-text-muted text-xs">{sortTypeLabels[sortType]}</span>
            </Button>

            {/* Sort direction toggle */}
            <Button
                variant="ghost"
                size="sm"
                onClick={toggleSortOrder}
                disabled={disabled}
                title={sortOrder === "ASC" ? "Ascending" : "Descending"}
            >
                {sortOrder === "ASC" ? (
                    <ArrowUpIcon className="h-4.5 w-4.5" />
                ) : (
                    <ArrowDownIcon className="h-4.5 w-4.5" />
                )}
            </Button>

            {/* Separator */}
            <div className="bg-border mx-0.5 h-5 w-px" />

            {/* Display type toggle */}
            <Button
                variant="ghost"
                size="sm"
                onClick={toggleDisplayType}
                disabled={disabled}
                title={displayType === "GRID" ? "Switch to list view" : "Switch to grid view"}
            >
                {displayType === "GRID" ? (
                    <ListBulletIcon className="h-4.5 w-4.5" />
                ) : (
                    <Squares2X2Icon className="h-4.5 w-4.5" />
                )}
            </Button>
        </div>
    );
}
