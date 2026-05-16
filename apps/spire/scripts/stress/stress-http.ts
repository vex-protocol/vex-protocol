/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

export interface StressHttpConfig {
    readonly headers?: Readonly<Record<string, string | undefined>>;
    readonly timeout?: number;
    readonly validateStatus?: (status: number) => boolean;
}

export interface StressHttpRequestRecord {
    readonly headers: Readonly<Record<string, string>>;
    readonly method: string;
    readonly url: string;
}

export interface StressHttpResponse<T = unknown> {
    readonly config: StressHttpRequestRecord;
    readonly data: T;
    readonly status: number;
    readonly statusText: string;
}

interface StressHttpErrorOptions {
    readonly code?: string;
    readonly config: StressHttpRequestRecord;
    readonly response?: StressHttpResponse;
}

export class StressHttpError extends Error {
    public readonly code?: string;
    public readonly config: StressHttpRequestRecord;
    public readonly isStressHttpError = true;
    public readonly response?: StressHttpResponse;

    public constructor(message: string, options: StressHttpErrorOptions) {
        super(message);
        this.name = "StressHttpError";
        this.config = options.config;
        if (options.code !== undefined) {
            this.code = options.code;
        }
        if (options.response !== undefined) {
            this.response = options.response;
        }
    }
}

export function isStressHttpError(err: unknown): err is StressHttpError {
    return (
        typeof err === "object" &&
        err !== null &&
        (err as { readonly isStressHttpError?: unknown }).isStressHttpError ===
            true
    );
}

export async function stressHttpGet(
    url: string,
    config: StressHttpConfig = {},
): Promise<StressHttpResponse> {
    return await stressHttpRequest("GET", url, undefined, config);
}

export async function stressHttpPost(
    url: string,
    data: unknown,
    config: StressHttpConfig = {},
): Promise<StressHttpResponse> {
    return await stressHttpRequest("POST", url, data, config);
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function headersFrom(
    input: Readonly<Record<string, string | undefined>> | undefined,
): Headers {
    const headers = new Headers();
    if (input === undefined) {
        return headers;
    }
    for (const key of Object.keys(input)) {
        const value = input[key];
        if (value !== undefined) {
            headers.set(key, value);
        }
    }
    return headers;
}

function headersToRecord(headers: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
        out[key] = value;
    });
    return out;
}

function makeBody(data: unknown, headers: Headers): string | undefined {
    if (data === undefined) {
        return undefined;
    }
    if (typeof data === "string") {
        return data;
    }
    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    return JSON.stringify(data);
}

async function readBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) {
        return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (
        contentType.toLowerCase().includes("json") ||
        text.trim().startsWith("{") ||
        text.trim().startsWith("[")
    ) {
        try {
            const data: unknown = JSON.parse(text);
            return data;
        } catch {
            return text;
        }
    }
    return text;
}

async function stressHttpRequest(
    method: string,
    url: string,
    data: unknown,
    config: StressHttpConfig,
): Promise<StressHttpResponse> {
    const headers = headersFrom(config.headers);
    const body = makeBody(data, headers);
    const requestRecord: StressHttpRequestRecord = {
        headers: headersToRecord(headers),
        method,
        url,
    };
    const abort = timeoutSignal(config.timeout);

    try {
        const requestInit: RequestInit = { headers, method };
        if (body !== undefined) {
            requestInit.body = body;
        }
        if (abort.signal !== undefined) {
            requestInit.signal = abort.signal;
        }
        const response = await fetch(url, requestInit);
        const httpResponse: StressHttpResponse = {
            config: requestRecord,
            data: await readBody(response),
            status: response.status,
            statusText: response.statusText,
        };
        const validateStatus =
            config.validateStatus ??
            ((status: number) => status >= 200 && status < 300);
        if (!validateStatus(response.status)) {
            throw new StressHttpError(
                `HTTP request failed with status ${String(response.status)}`,
                { config: requestRecord, response: httpResponse },
            );
        }
        return httpResponse;
    } catch (err: unknown) {
        if (isStressHttpError(err)) {
            throw err;
        }
        const options: StressHttpErrorOptions = abort.didTimeout()
            ? { code: "ETIMEDOUT", config: requestRecord }
            : { config: requestRecord };
        throw new StressHttpError(errorMessage(err), options);
    } finally {
        abort.cleanup();
    }
}

function timeoutSignal(timeout: number | undefined): {
    readonly cleanup: () => void;
    readonly didTimeout: () => boolean;
    readonly signal?: AbortSignal;
} {
    if (timeout === undefined) {
        return {
            cleanup: () => {},
            didTimeout: () => false,
        };
    }
    const controller = new AbortController();
    let timedOut = false;
    const timeoutID = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeout);
    return {
        cleanup: () => {
            clearTimeout(timeoutID);
        },
        didTimeout: () => timedOut,
        signal: controller.signal,
    };
}
