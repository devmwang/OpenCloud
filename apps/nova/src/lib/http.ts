import { getGlobalStartContext } from "@tanstack/react-start";
import { z } from "zod";

import { env } from "@/env";
import type { NovaRequestContext } from "@/global-middleware";

export type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue>;

type RequestOptions = Omit<RequestInit, "body"> & {
    query?: QueryParams;
    body?: BodyInit | null;
    forwardServerCookies?: boolean;
};

type RequestJsonOptions = Omit<RequestOptions, "body"> & {
    body?: unknown;
};

const errorPayloadSchema = z
    .object({
        error: z.string().optional(),
        message: z.string().optional(),
    })
    .passthrough();

export type ApiErrorShape = {
    status: number;
    message: string;
    code?: string;
};

export class ApiError extends Error {
    status: number;
    code?: string;

    constructor({ status, message, code }: ApiErrorShape) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}

export const buildApiUrl = (path: string, query?: QueryParams) => {
    const sanitizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(sanitizedPath, env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL);

    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === "") {
                continue;
            }
            url.searchParams.set(key, String(value));
        }
    }

    return url;
};

const getServerCookieHeader = () => {
    if (!import.meta.env.SSR) {
        return undefined;
    }

    const context = getGlobalStartContext() as NovaRequestContext | undefined;
    return context?.requestCookieHeader;
};

const normalizeApiError = async (response: Response) => {
    let message = `${response.status} ${response.statusText}`;
    let code: string | undefined;

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
        try {
            const payload = errorPayloadSchema.safeParse(await response.json());
            if (payload.success) {
                message = payload.data.message ?? payload.data.error ?? message;
                code = payload.data.error;
            }
        } catch {
            // Ignore parse failures and keep default message.
        }
    }

    return new ApiError({
        status: response.status,
        message,
        code,
    });
};

const request = async (path: string, options: RequestOptions = {}) => {
    const { query, headers, forwardServerCookies, ...rest } = options;
    const url = buildApiUrl(path, query);

    const requestHeaders = new Headers(headers ?? undefined);

    if (forwardServerCookies) {
        const cookieHeader = getServerCookieHeader();
        if (cookieHeader) {
            requestHeaders.set("Cookie", cookieHeader);
        }
    }

    const response = await fetch(url.toString(), {
        credentials: "include",
        ...rest,
        headers: requestHeaders,
    });

    if (!response.ok) {
        throw await normalizeApiError(response);
    }

    return response;
};

const parseJsonResponse = async <T>(response: Response, schema: z.ZodType<T>) => {
    return schema.parse(await response.json());
};

export const getJson = async <T>(
    path: string,
    schema: z.ZodType<T>,
    options: Omit<RequestOptions, "method" | "body"> = {},
) => {
    const response = await request(path, {
        ...options,
        method: "GET",
    });

    return parseJsonResponse(response, schema);
};

export const postJson = async <T>(path: string, schema: z.ZodType<T>, options: RequestJsonOptions = {}) => {
    const { body, headers, ...rest } = options;

    const response = await request(path, {
        ...rest,
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    return parseJsonResponse(response, schema);
};

export const postMultipart = async <T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}) => {
    const response = await request(path, {
        ...options,
        method: "POST",
    });

    return parseJsonResponse(response, schema);
};

export const deleteJson = async <T>(
    path: string,
    schema: z.ZodType<T>,
    options: Omit<RequestOptions, "method" | "body"> = {},
) => {
    const response = await request(path, {
        ...options,
        method: "DELETE",
    });

    return parseJsonResponse(response, schema);
};
