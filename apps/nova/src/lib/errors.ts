import { ApiError } from "@/lib/http";

export const getErrorMessage = (error: unknown) => {
    if (error instanceof ApiError) {
        return `${error.status}: ${error.message}`;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "Unexpected error";
};
