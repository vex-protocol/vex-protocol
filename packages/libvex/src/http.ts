/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

export interface FetchHttpClientDefaults {
    headers: {
        common: {
            [name: string]: string | undefined;
            Authorization?: string;
        };
    };
}

export interface FetchHttpClientOptions {
    readonly responseType?: HttpResponseType;
    readonly signal?: AbortSignal;
}

export interface HttpErrorOptions {
    readonly cause?: unknown;
    readonly code?: string;
    readonly config: HttpRequestRecord;
    readonly response?: HttpResponse<unknown>;
}

export type HttpHeadersInit = Readonly<Record<string, string | undefined>>;

export interface HttpProgressEvent {
    readonly loaded: number;
    readonly total?: number;
}

export interface HttpRequestConfig {
    readonly headers?: HttpHeadersInit;
    readonly onDownloadProgress?: (event: HttpProgressEvent) => void;
    readonly onUploadProgress?: (event: HttpProgressEvent) => void;
    readonly responseType?: HttpResponseType;
    readonly signal?: AbortSignal;
    readonly timeout?: number;
    readonly validateStatus?: (status: number) => boolean;
}

export interface HttpRequestRecord {
    readonly headers: Readonly<Record<string, string>>;
    readonly method: string;
    readonly url: string;
}

export interface HttpResponse<T = ArrayBuffer> {
    readonly config: HttpRequestRecord;
    readonly data: T;
    readonly headers: Readonly<Record<string, string>>;
    readonly status: number;
    readonly statusText: string;
}

export type HttpResponseType = "arraybuffer" | "json" | "text";

interface ReadableResponseBody {
    getReader: () => ReadableStreamDefaultReader<Uint8Array>;
}

export class FetchHttpClient {
    public readonly defaults: FetchHttpClientDefaults = {
        headers: { common: {} },
    };

    private readonly defaultResponseType: HttpResponseType;
    private readonly defaultSignal?: AbortSignal;

    public constructor(options: FetchHttpClientOptions = {}) {
        this.defaultResponseType = options.responseType ?? "arraybuffer";
        if (options.signal !== undefined) {
            this.defaultSignal = options.signal;
        }
    }

    public async delete(
        url: string,
        config?: HttpRequestConfig,
    ): Promise<HttpResponse<unknown>> {
        return await this.request("DELETE", url, undefined, config);
    }

    public async get(
        url: string,
        config: HttpRequestConfig & { readonly responseType: "json" },
    ): Promise<HttpResponse<unknown>>;
    public async get(
        url: string,
        config: HttpRequestConfig & { readonly responseType: "text" },
    ): Promise<HttpResponse<string>>;
    public async get(
        url: string,
        config?: HttpRequestConfig,
    ): Promise<HttpResponse>;
    public async get(
        url: string,
        config?: HttpRequestConfig,
    ): Promise<HttpResponse<unknown>> {
        return await this.request("GET", url, undefined, config);
    }

    public async patch(
        url: string,
        data?: unknown,
        config?: HttpRequestConfig,
    ): Promise<HttpResponse<unknown>> {
        return await this.request("PATCH", url, data, config);
    }

    public async post(
        url: string,
        data: unknown,
        config: HttpRequestConfig & { readonly responseType: "json" },
    ): Promise<HttpResponse<unknown>>;
    public async post(
        url: string,
        data: unknown,
        config: HttpRequestConfig & { readonly responseType: "text" },
    ): Promise<HttpResponse<string>>;
    public async post(
        url: string,
        data?: unknown,
        config?: HttpRequestConfig,
    ): Promise<HttpResponse>;
    public async post(
        url: string,
        data?: unknown,
        config?: HttpRequestConfig,
    ): Promise<HttpResponse<unknown>> {
        return await this.request("POST", url, data, config);
    }

    private async request(
        method: string,
        url: string,
        data: unknown,
        config: HttpRequestConfig = {},
    ): Promise<HttpResponse<unknown>> {
        const headers = new Headers();
        appendHeaders(headers, this.defaults.headers.common);
        appendHeaders(headers, config.headers);

        const body = makeBody(data, headers);
        maybeReportUploadProgress(data, config.onUploadProgress);

        const requestRecord: HttpRequestRecord = {
            headers: headersToSafeRecord(headers),
            method,
            url,
        };
        const abort = composeAbortSignal(
            [this.defaultSignal, config.signal],
            config.timeout,
        );

        try {
            const requestInit: RequestInit = { headers, method };
            if (body !== undefined) {
                requestInit.body = body;
            }
            if (abort.signal !== undefined) {
                requestInit.signal = abort.signal;
            }
            const response = await fetch(url, requestInit);
            const responseType =
                config.responseType ?? this.defaultResponseType;
            const validateStatus =
                config.validateStatus ??
                ((status: number) => status >= 200 && status < 300);
            if (!validateStatus(response.status)) {
                const { cause, data: responseData } =
                    await readErrorResponseData(
                        response,
                        responseType,
                        config.onDownloadProgress,
                    );
                const httpResponse: HttpResponse<unknown> = {
                    config: requestRecord,
                    data: responseData,
                    headers: headersToRecord(response.headers),
                    status: response.status,
                    statusText: response.statusText,
                };
                const errorOptions: HttpErrorOptions =
                    cause === undefined
                        ? { config: requestRecord, response: httpResponse }
                        : {
                              cause,
                              config: requestRecord,
                              response: httpResponse,
                          };
                throw new HttpError(
                    `Request failed with status code ${String(response.status)}`,
                    errorOptions,
                );
            }
            const responseData = await readResponseData(
                response,
                responseType,
                config.onDownloadProgress,
            );
            const httpResponse: HttpResponse<unknown> = {
                config: requestRecord,
                data: responseData,
                headers: headersToRecord(response.headers),
                status: response.status,
                statusText: response.statusText,
            };
            return httpResponse;
        } catch (err: unknown) {
            if (isHttpError(err)) {
                throw err;
            }
            const code = abort.didTimeout()
                ? "ETIMEDOUT"
                : abort.signal?.aborted === true
                  ? "ERR_CANCELED"
                  : undefined;
            const errorOptions: HttpErrorOptions =
                code === undefined
                    ? { cause: err, config: requestRecord }
                    : { cause: err, code, config: requestRecord };
            throw new HttpError(errorMessage(err), errorOptions);
        } finally {
            abort.cleanup();
        }
    }
}

export class HttpError extends Error {
    public readonly code?: string;
    public readonly config: HttpRequestRecord;
    public readonly isHttpError = true;
    public readonly response?: HttpResponse<unknown>;

    public constructor(message: string, options: HttpErrorOptions) {
        super(message);
        this.name = "HttpError";
        this.config = options.config;
        if (options.code !== undefined) {
            this.code = options.code;
        }
        if (options.cause !== undefined) {
            Object.defineProperty(this, "cause", {
                configurable: true,
                value: options.cause,
                writable: true,
            });
        }
        if (options.response !== undefined) {
            this.response = options.response;
        }
    }
}

export function createFetchHttpClient(
    options?: FetchHttpClientOptions,
): FetchHttpClient {
    return new FetchHttpClient(options);
}

export function isHttpError(err: unknown): err is HttpError {
    return (
        typeof err === "object" &&
        err !== null &&
        (err as { readonly isHttpError?: unknown }).isHttpError === true
    );
}

function appendHeaders(target: Headers, source: HttpHeadersInit | undefined) {
    if (source === undefined) {
        return;
    }
    const headerRecord: Readonly<Record<string, string | undefined>> = source;
    for (const key of Object.keys(headerRecord)) {
        const value = headerRecord[key];
        if (value !== undefined) {
            target.set(key, value);
        }
    }
}

function bodyLength(data: unknown): number | undefined {
    if (typeof data === "string") {
        return new TextEncoder().encode(data).byteLength;
    }
    if (data instanceof ArrayBuffer) {
        return data.byteLength;
    }
    if (ArrayBuffer.isView(data)) {
        return data.byteLength;
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
        return data.size;
    }
    if (isFormDataValue(data)) {
        return formDataPayloadLength(data);
    }
    return undefined;
}

function composeAbortSignal(
    signals: readonly (AbortSignal | undefined)[],
    timeout: number | undefined,
): {
    readonly cleanup: () => void;
    readonly didTimeout: () => boolean;
    readonly signal?: AbortSignal;
} {
    const activeSignals = signals.filter(
        (s): s is AbortSignal => s !== undefined,
    );
    if (activeSignals.length === 0 && timeout === undefined) {
        return {
            cleanup: () => {},
            didTimeout: () => false,
        };
    }

    const controller = new AbortController();
    const cleanups: (() => void)[] = [];
    let timedOut = false;

    for (const signal of activeSignals) {
        if (signal.aborted) {
            controller.abort(signal.reason);
            continue;
        }
        const onAbort = () => {
            controller.abort(signal.reason);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        cleanups.push(() => {
            signal.removeEventListener("abort", onAbort);
        });
    }

    if (timeout !== undefined) {
        const timeoutID = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeout);
        cleanups.push(() => {
            clearTimeout(timeoutID);
        });
    }

    return {
        cleanup: () => {
            for (const cleanup of cleanups) {
                cleanup();
            }
        },
        didTimeout: () => timedOut,
        signal: controller.signal,
    };
}

function errorMessage(err: unknown): string {
    if (err instanceof Error) {
        return err.message;
    }
    return String(err);
}

function formDataPayloadLength(data: FormData): number {
    let total = 0;
    data.forEach((value: unknown) => {
        total += formDataValueLength(value);
    });
    return total;
}

function formDataValueLength(value: unknown): number {
    if (typeof value === "string") {
        return new TextEncoder().encode(value).byteLength;
    }
    if (typeof Blob !== "undefined" && value instanceof Blob) {
        return value.size;
    }
    return 0;
}

function headersToRecord(headers: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
        out[key] = value;
    });
    return out;
}

function headersToSafeRecord(headers: Headers): Record<string, string> {
    const sensitive = new Set([
        "authorization",
        "cookie",
        "proxy-authorization",
        "x-api-key",
        "x-device-token",
    ]);
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
        out[key] = sensitive.has(key.toLowerCase()) ? "[REDACTED]" : value;
    });
    return out;
}

function isFormDataValue(value: unknown): value is FormData {
    return typeof FormData !== "undefined" && value instanceof FormData;
}

function isJsonBodyCandidate(value: unknown): boolean {
    if (value === null || typeof value !== "object") {
        return false;
    }
    if (isFormDataValue(value)) {
        return false;
    }
    if (typeof Blob !== "undefined" && value instanceof Blob) {
        return false;
    }
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        return false;
    }
    if (
        typeof URLSearchParams !== "undefined" &&
        value instanceof URLSearchParams
    ) {
        return false;
    }
    return true;
}

function isReadableResponseBody(value: unknown): value is ReadableResponseBody {
    return (
        typeof value === "object" &&
        value !== null &&
        "getReader" in value &&
        typeof value.getReader === "function"
    );
}

function makeBody(data: unknown, headers: Headers): BodyInit | undefined {
    if (data === undefined) {
        return undefined;
    }
    if (isFormDataValue(data)) {
        const contentType = headers.get("Content-Type");
        if (
            contentType?.toLowerCase().startsWith("multipart/form-data") ===
            true
        ) {
            headers.delete("Content-Type");
        }
        return data;
    }
    if (isJsonBodyCandidate(data)) {
        if (!headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }
        return JSON.stringify(data);
    }
    if (typeof data === "string") {
        return data;
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
        return data;
    }
    if (data instanceof ArrayBuffer) {
        return data;
    }
    if (ArrayBuffer.isView(data)) {
        if (data.buffer instanceof ArrayBuffer) {
            return new Uint8Array(
                data.buffer,
                data.byteOffset,
                data.byteLength,
            );
        }
        throw new TypeError("SharedArrayBuffer HTTP bodies are not supported");
    }
    if (
        typeof URLSearchParams !== "undefined" &&
        data instanceof URLSearchParams
    ) {
        return data;
    }
    throw new TypeError("Unsupported HTTP request body type");
}

function maybeReportUploadProgress(
    data: unknown,
    onUploadProgress: ((event: HttpProgressEvent) => void) | undefined,
): void {
    if (onUploadProgress === undefined) {
        return;
    }
    const total = bodyLength(data);
    if (total !== undefined) {
        onUploadProgress({ loaded: total, total });
    }
}

function progressEvent(
    loaded: number,
    total: number | undefined,
): HttpProgressEvent {
    return total === undefined ? { loaded } : { loaded, total };
}

async function readArrayBuffer(
    response: Response,
    onDownloadProgress: ((event: HttpProgressEvent) => void) | undefined,
): Promise<ArrayBuffer> {
    const rawTotal = response.headers.get("content-length");
    const parsedTotal = rawTotal === null ? Number.NaN : Number(rawTotal);
    const total = Number.isFinite(parsedTotal) ? parsedTotal : undefined;
    const body: unknown = response.body;

    if (onDownloadProgress === undefined || !isReadableResponseBody(body)) {
        const data = await response.arrayBuffer();
        if (onDownloadProgress !== undefined) {
            onDownloadProgress(progressEvent(data.byteLength, total));
        }
        return data;
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;
    const reader = body.getReader();

    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        chunks.push(value);
        loaded += value.byteLength;
        onDownloadProgress(progressEvent(loaded, total));
    }

    const out = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out.buffer;
}

async function readErrorResponseData(
    response: Response,
    responseType: HttpResponseType,
    onDownloadProgress: ((event: HttpProgressEvent) => void) | undefined,
): Promise<{ readonly cause?: unknown; readonly data: unknown }> {
    try {
        if (responseType === "json") {
            const text = await response.text();
            if (text.length === 0) {
                return { data: null };
            }
            try {
                const data: unknown = JSON.parse(text);
                return { data };
            } catch {
                return { data: text };
            }
        }
        return {
            data: await readResponseData(
                response,
                responseType,
                onDownloadProgress,
            ),
        };
    } catch (cause: unknown) {
        return { cause, data: null };
    }
}

async function readResponseData(
    response: Response,
    responseType: HttpResponseType,
    onDownloadProgress: ((event: HttpProgressEvent) => void) | undefined,
): Promise<unknown> {
    if (responseType === "json") {
        const data: unknown = await response.json();
        return data;
    }
    if (responseType === "text") {
        return await response.text();
    }
    return await readArrayBuffer(response, onDownloadProgress);
}
