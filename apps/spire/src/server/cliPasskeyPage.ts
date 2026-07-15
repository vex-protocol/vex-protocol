/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import express from "express";

const CSP = [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self' http://localhost:* http://127.0.0.1:*",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
].join("; ");

const CLI_PASSKEY_PAGE = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vex Passkey</title>
    <style>
        :root {
            color-scheme: dark;
            --bg: #141519;
            --panel: #202126;
            --border: #2b2d33;
            --border-strong: #41434b;
            --text: #f2f3f5;
            --text-secondary: #dbdee1;
            --muted: #b5bac1;
            --faint: #80848e;
            --accent: #e5484d;
            --accent-hover: #f05b60;
            --accent-soft: rgba(229, 72, 77, 0.16);
            --danger: #f23f42;
            --success: #3ba55c;
        }

        * {
            box-sizing: border-box;
        }

        html {
            min-height: 100%;
        }

        body {
            align-items: center;
            background: var(--bg);
            color: var(--text);
            display: flex;
            font-family:
                Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            justify-content: center;
            margin: 0;
            min-height: 100vh;
            padding: 20px;
        }

        main {
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: 0 18px 56px rgba(0, 0, 0, 0.34);
            max-width: 420px;
            overflow: hidden;
            width: 100%;
        }

        .titlebar {
            align-items: center;
            border-bottom: 1px solid var(--border);
            display: flex;
            min-height: 52px;
            padding: 0 20px;
        }

        .wordmark {
            color: var(--text);
            font-family: "Space Grotesk", Inter, ui-sans-serif, system-ui, sans-serif;
            font-size: 17px;
            font-weight: 700;
            line-height: 1;
        }

        .titlebar-divider {
            background: var(--border-strong);
            height: 18px;
            margin: 0 11px;
            width: 1px;
        }

        .titlebar-context {
            color: var(--muted);
            font-size: 13px;
            font-weight: 600;
        }

        .secure-context {
            align-items: center;
            color: var(--faint);
            display: inline-flex;
            font-size: 12px;
            gap: 5px;
            margin-left: auto;
        }

        .secure-context svg {
            height: 14px;
            width: 14px;
        }

        .content {
            padding: 26px 26px 24px;
        }

        .passkey-icon {
            align-items: center;
            background: var(--accent-soft);
            border: 1px solid rgba(229, 72, 77, 0.28);
            border-radius: 8px;
            color: var(--accent-hover);
            display: flex;
            height: 48px;
            justify-content: center;
            margin-bottom: 20px;
            width: 48px;
        }

        .passkey-icon svg {
            height: 24px;
            width: 24px;
        }

        .eyebrow {
            color: var(--faint);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.3;
            margin: 0 0 7px;
            text-transform: uppercase;
        }

        h1 {
            font-family: "Space Grotesk", Inter, ui-sans-serif, system-ui, sans-serif;
            font-size: 23px;
            font-weight: 700;
            letter-spacing: 0;
            line-height: 1.2;
            margin: 0 0 9px;
        }

        .description {
            color: var(--muted);
            font-size: 14px;
            line-height: 1.5;
            margin: 0;
        }

        button {
            align-items: center;
            appearance: none;
            background: var(--accent);
            border: 1px solid var(--accent);
            border-radius: 8px;
            color: #ffffff;
            cursor: pointer;
            display: inline-flex;
            font: inherit;
            font-size: 14px;
            font-weight: 650;
            gap: 9px;
            justify-content: center;
            margin-top: 22px;
            min-height: 44px;
            padding: 0 18px;
            transition:
                background 120ms ease,
                border-color 120ms ease;
            width: 100%;
        }

        button:hover:not(:disabled) {
            background: var(--accent-hover);
            border-color: var(--accent-hover);
        }

        button:focus-visible {
            outline: 2px solid var(--text);
            outline-offset: 3px;
        }

        button:disabled {
            cursor: wait;
            opacity: 0.78;
        }

        .spinner {
            animation: spin 760ms linear infinite;
            border: 2px solid rgba(255, 255, 255, 0.4);
            border-radius: 50%;
            border-top-color: #ffffff;
            display: none;
            height: 15px;
            width: 15px;
        }

        button[data-busy="true"] .spinner {
            display: block;
        }

        .helper {
            color: var(--faint);
            font-size: 12px;
            line-height: 1.45;
            margin: 11px 2px 0;
            text-align: center;
        }

        .status {
            align-items: flex-start;
            border-top: 1px solid var(--border);
            color: var(--muted);
            display: flex;
            font-size: 12px;
            gap: 9px;
            line-height: 1.45;
            margin-top: 20px;
            min-height: 20px;
            padding-top: 16px;
            word-break: break-word;
        }

        .status-indicator {
            background: var(--faint);
            border-radius: 2px;
            flex: 0 0 auto;
            height: 7px;
            margin-top: 5px;
            width: 7px;
        }

        main[data-state="busy"] .status-indicator {
            animation: pulse 1.1s ease-in-out infinite;
            background: var(--accent-hover);
        }

        main[data-state="error"] .status {
            color: var(--danger);
        }

        main[data-state="error"] .status-indicator {
            background: var(--danger);
        }

        main[data-state="success"] .status {
            color: var(--text-secondary);
        }

        main[data-state="success"] .status-indicator {
            background: var(--success);
        }

        .completion {
            align-items: center;
            color: var(--text-secondary);
            display: flex;
            font-size: 13px;
            gap: 9px;
            line-height: 1.4;
            margin-top: 22px;
        }

        .completion svg {
            color: var(--success);
            flex: 0 0 auto;
            height: 20px;
            width: 20px;
        }

        [hidden] {
            display: none !important;
        }

        @keyframes spin {
            to {
                transform: rotate(360deg);
            }
        }

        @keyframes pulse {
            50% {
                opacity: 0.4;
            }
        }

        @media (max-width: 460px) {
            body {
                padding: 12px;
            }

            .content {
                padding: 24px 22px 22px;
            }

            .titlebar {
                padding: 0 18px;
            }
        }

        @media (max-height: 620px) {
            body {
                align-items: flex-start;
            }

            .content {
                padding-bottom: 20px;
                padding-top: 22px;
            }

            .passkey-icon {
                margin-bottom: 16px;
            }

            button {
                margin-top: 18px;
            }

            .status {
                margin-top: 16px;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                scroll-behavior: auto !important;
                transition-duration: 0.01ms !important;
            }
        }
    </style>
</head>
<body>
    <main id="surface" data-state="ready">
        <header class="titlebar">
            <span class="wordmark">vex</span>
            <span class="titlebar-divider" aria-hidden="true"></span>
            <span class="titlebar-context" id="titlebar-context">Passkey</span>
            <span class="secure-context">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Secure
            </span>
        </header>
        <section class="content">
            <div class="passkey-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="7.5" cy="15.5" r="5.5"></circle>
                    <path d="m21 2-9.6 9.6"></path>
                    <path d="m15.5 7.5 3 3L22 7l-3-3"></path>
                </svg>
            </div>
            <p class="eyebrow" id="eyebrow">Secure sign in</p>
            <h1 id="title">Continue with your passkey</h1>
            <p class="description" id="copy">Use a passkey saved in this browser or on a nearby device to continue in Vex.</p>
            <button id="action" type="button" data-busy="false">
                <span class="spinner" aria-hidden="true"></span>
                <span id="action-label">Continue with passkey</span>
            </button>
            <p class="helper" id="helper">Your password remains available as a sign-in method.</p>
            <div class="completion" id="completion" hidden>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6 9 17l-5-5"></path>
                </svg>
                <span id="completion-copy">You can close this page and return to Vex.</span>
            </div>
            <div class="status" id="status" role="status" aria-live="polite">
                <span class="status-indicator" aria-hidden="true"></span>
                <span id="status-copy">Ready for your passkey.</span>
            </div>
        </section>
    </main>
    <script>
        "use strict";

        var params = new URLSearchParams(window.location.hash.slice(1));
        if (window.location.hash) {
            window.history.replaceState(
                null,
                "",
                window.location.pathname + window.location.search,
            );
        }
        var action = document.getElementById("action");
        var actionLabel = document.getElementById("action-label");
        var completion = document.getElementById("completion");
        var completionCopy = document.getElementById("completion-copy");
        var titleEl = document.getElementById("title");
        var copyEl = document.getElementById("copy");
        var eyebrowEl = document.getElementById("eyebrow");
        var helperEl = document.getElementById("helper");
        var statusCopy = document.getElementById("status-copy");
        var surface = document.getElementById("surface");
        var titlebarContext = document.getElementById("titlebar-context");
        var mode = params.get("mode") || "recover";
        var startupError = null;
        var apiBase = window.location.origin;
        var completionCallback = null;
        var actionDefaultLabel = "Continue with passkey";
        var busy = false;
        var completed = false;

        configurePage();

        try {
            apiBase = resolveTrustedApiBase(params.get("api"));
            completionCallback = resolveCompletionCallback(
                params.get("callback"),
            );
            validateLinkParams();
        } catch (err) {
            startupError = err;
        }

        if (startupError) {
            setStatus(errorMessage(startupError), "error");
            action.hidden = true;
            helperEl.textContent =
                "Open a new passkey request from Vex and try again.";
        }

        action.addEventListener("click", function () {
            void run();
        });

        function configurePage() {
            document.body.dataset.mode = mode;
            if (mode === "register" || mode === "register-handoff") {
                document.title = "Add a passkey - Vex";
                titlebarContext.textContent = "Add passkey";
                eyebrowEl.textContent = "Account security";
                titleEl.textContent = "Create a passkey";
                copyEl.textContent =
                    "Use Face ID, Touch ID, your device PIN, or a security key to add a faster sign-in method.";
                helperEl.textContent =
                    "Your password remains available as a sign-in method.";
                actionDefaultLabel = "Create passkey";
                actionLabel.textContent = actionDefaultLabel;
                setStatus("Ready to create your passkey.");
                return;
            }
            if (mode === "authenticate-handoff") {
                document.title = "Sign in with a passkey - Vex";
                titlebarContext.textContent = "Sign in";
                eyebrowEl.textContent = "Desktop sign in";
                titleEl.textContent = "Use your passkey";
                copyEl.textContent =
                    "Choose a passkey saved in this browser, on this device, or on a nearby device.";
                helperEl.textContent =
                    "Vex will finish signing in automatically after verification.";
                setStatus("Ready to verify your passkey.");
                return;
            }
            document.title = "Recover a device - Vex";
            titlebarContext.textContent = "Device recovery";
            eyebrowEl.textContent = "Trusted device";
            titleEl.textContent = "Verify your passkey";
            copyEl.textContent =
                "Use an account passkey to approve this Vex device.";
            helperEl.textContent =
                "Only continue if you started this request from your device.";
            setStatus("Ready to verify your passkey.");
        }

        function validateLinkParams() {
            if (mode === "register") {
                requiredParam("token");
                requiredParam("user");
                requiredParam("username");
                return;
            }
            if (mode === "register-handoff" || mode === "authenticate-handoff") {
                requiredParam("token");
                requiredParam("request");
                return;
            }
            requiredParam("username");
            requiredParam("request");
        }

        function setStatus(message, kind) {
            statusCopy.textContent = message;
            surface.dataset.state = kind || (busy ? "busy" : "ready");
        }

        function setBusy(nextBusy) {
            busy = nextBusy;
            action.disabled = nextBusy || completed;
            action.dataset.busy = String(nextBusy);
            surface.setAttribute("aria-busy", String(nextBusy));
            if (nextBusy) {
                surface.dataset.state = "busy";
                actionLabel.textContent = "Waiting for passkey";
            } else {
                if (surface.dataset.state === "busy") {
                    surface.dataset.state = "ready";
                }
                actionLabel.textContent = actionDefaultLabel;
            }
        }

        function showCompletion(title, copy, status, nextStep) {
            completed = true;
            titleEl.textContent = title;
            copyEl.textContent = copy;
            completionCopy.textContent = nextStep;
            completion.hidden = false;
            action.hidden = true;
            helperEl.hidden = true;
            setStatus(status, "success");
            if (completionCallback) {
                window.setTimeout(function () {
                    window.location.assign(completionCallback);
                }, 350);
            }
        }

        function apiUrl(path) {
            var url = new URL(path, apiBase);
            url.searchParams.set("format", "json");
            return url.toString();
        }

        function resolveTrustedApiBase(rawApi) {
            if (!rawApi) {
                return window.location.origin;
            }
            var requested;
            try {
                requested = new URL(rawApi, window.location.origin);
            } catch (_err) {
                throw new Error("Passkey link API origin is invalid.");
            }
            var pageOrigin = new URL(window.location.origin);
            if (requested.origin === pageOrigin.origin) {
                return requested.origin;
            }
            if (isLocalOrigin(pageOrigin) && isLocalOrigin(requested)) {
                return requested.origin;
            }
            throw new Error("Passkey link API origin is not trusted.");
        }

        function resolveCompletionCallback(rawCallback) {
            if (!rawCallback) return null;
            var callback;
            try {
                callback = new URL(rawCallback);
            } catch (_err) {
                throw new Error("Passkey completion callback is invalid.");
            }
            if (
                callback.protocol !== "vex:" ||
                callback.hostname !== "passkey" ||
                callback.pathname !== "/complete" ||
                callback.search ||
                callback.hash
            ) {
                throw new Error("Passkey completion callback is not trusted.");
            }
            return callback.toString();
        }

        function isLocalOrigin(url) {
            return (
                (url.protocol === "http:" || url.protocol === "https:") &&
                ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
            );
        }

        async function apiRequest(path, options) {
            var requestOptions = options || {};
            var headers = { Accept: "application/json" };
            if (requestOptions.body !== undefined) {
                headers["Content-Type"] = "application/json";
            }
            if (requestOptions.token) {
                headers.Authorization = "Bearer " + requestOptions.token;
            }
            var response = await fetch(apiUrl(path), {
                body:
                    requestOptions.body === undefined
                        ? undefined
                        : JSON.stringify(requestOptions.body),
                headers: headers,
                method: requestOptions.method || "POST",
            });
            var text = await response.text();
            var payload = null;
            var contentType = response.headers.get("content-type") || "";
            if (text.length > 0 && contentType.includes("json")) {
                try {
                    payload = JSON.parse(text);
                } catch (_err) {
                    payload = null;
                }
            }
            if (!response.ok) {
                throw new Error(apiRequestError(response.status, payload));
            }
            return payload;
        }

        function apiRequestError(status, payload) {
            if (payload && typeof payload.error === "string") {
                return payload.error;
            }
            if (status === 401 || status === 403) {
                return "This passkey request has expired. Return to Vex and start again.";
            }
            if (status === 404) {
                return "This passkey request is no longer available. Return to Vex and start again.";
            }
            if (status === 429) {
                return "Too many attempts. Wait a moment, then try again.";
            }
            if (status >= 500) {
                return "Vex could not complete the passkey request. Try again.";
            }
            return "The passkey request could not be completed. Try again.";
        }

        async function run() {
            if (busy) return;
            setBusy(true);
            try {
                if (!window.PublicKeyCredential || !navigator.credentials) {
                    throw new Error("This browser does not support passkeys.");
                }
                if (mode === "register") {
                    await registerPasskey();
                } else if (mode === "register-handoff") {
                    await registerPasskeyWithHandoff();
                } else if (mode === "authenticate-handoff") {
                    await authenticatePasskeyWithHandoff();
                } else {
                    await recoverWithPasskey();
                }
            } catch (err) {
                actionDefaultLabel =
                    mode === "register" || mode === "register-handoff"
                        ? "Try again"
                        : "Retry passkey";
                setStatus(errorMessage(err), "error");
            } finally {
                setBusy(false);
            }
        }

        function errorMessage(err) {
            if (err && err.name === "NotAllowedError") {
                return mode === "register" || mode === "register-handoff"
                    ? "Passkey creation was canceled or blocked by this browser. Check the browser prompt, then try again."
                    : "Passkey verification was canceled or timed out. Try again when you are ready.";
            }
            if (err && err.name === "InvalidStateError") {
                return "This passkey is already registered with Vex. Try a different passkey.";
            }
            if (err && err.name === "SecurityError") {
                return "This browser cannot use passkeys from the current Vex address.";
            }
            if (err && err.name === "AbortError") {
                return "The passkey request was canceled. Try again when you are ready.";
            }
            if (
                err &&
                (err.name === "NetworkError" ||
                    (err.name === "TypeError" &&
                        /fetch|network|load failed/i.test(err.message || "")))
            ) {
                return "Vex could not reach the server. Check your connection and try again.";
            }
            return err instanceof Error ? err.message : String(err);
        }

        async function registerPasskey() {
            var token = requiredParam("token");
            var userID = requiredParam("user");
            var username = requiredParam("username");
            var name = params.get("name") || params.get("device") || "vex-chat-cli";

            setStatus("Requesting passkey challenge for @" + username + "...");
            var begin = await apiRequest("/user/" + encodeURIComponent(userID) + "/passkeys/register/begin", {
                body: { name: name },
                token: token,
            });
            setStatus("Waiting for browser passkey prompt...");
            var credential = await createPasskeyCredential(begin.options);

            setStatus("Saving passkey...");
            await apiRequest("/user/" + encodeURIComponent(userID) + "/passkeys/register/finish", {
                body: {
                    name: name,
                    requestID: begin.requestID,
                    response: registrationResponseJSON(credential),
                },
                token: token,
            });
            showCompletion(
                "Passkey saved",
                "Your new passkey is ready to use with Vex.",
                "Passkey added to your account.",
                "Return to the Vex CLI. It will finish connecting automatically.",
            );
        }

        async function registerPasskeyWithHandoff() {
            var token = requiredParam("token");
            var requestID = requiredParam("request");

            setStatus("Requesting a one-time passkey challenge...");
            var begin = await apiRequest(
                "/auth/passkey/browser-registration/" +
                    encodeURIComponent(requestID) +
                    "/begin",
                { body: { token: token } },
            );

            setStatus("Waiting for browser passkey prompt...");
            var credential = await createPasskeyCredential(begin.options);

            setStatus("Saving passkey...");
            await apiRequest(
                "/auth/passkey/browser-registration/" +
                    encodeURIComponent(requestID) +
                    "/finish",
                {
                    body: {
                        response: registrationResponseJSON(credential),
                        token: token,
                    },
                },
            );
            showCompletion(
                "Passkey saved",
                "Your new passkey is ready to use with Vex.",
                "Passkey added to your account.",
                "You can close this page and return to Vex.",
            );
        }

        async function createPasskeyCredential(options) {
            var credential = await navigator.credentials.create({
                publicKey: makeCreationOptions(options),
            });
            if (!credential) {
                throw new Error("No passkey was created.");
            }
            return credential;
        }

        async function authenticatePasskeyWithHandoff() {
            var token = requiredParam("token");
            var requestID = requiredParam("request");

            setStatus("Requesting a one-time passkey challenge...");
            var begin = await apiRequest(
                "/auth/passkey/browser-authentication/" +
                    encodeURIComponent(requestID) +
                    "/begin",
                { body: { token: token } },
            );

            setStatus("Waiting for browser passkey prompt...");
            var credential = await navigator.credentials.get({
                publicKey: makeRequestOptions(begin.options),
            });
            if (!credential) {
                throw new Error("No passkey was returned.");
            }

            setStatus("Returning verification to Vex...");
            await apiRequest(
                "/auth/passkey/browser-authentication/" +
                    encodeURIComponent(requestID) +
                    "/finish",
                {
                    body: {
                        response: authenticationResponseJSON(credential),
                        token: token,
                    },
                },
            );
            showCompletion(
                "You are verified",
                "Vex can finish signing you in on the desktop.",
                "Passkey verified successfully.",
                "You can close this page and return to Vex.",
            );
        }

        async function recoverWithPasskey() {
            var username = requiredParam("username");
            var requestID = requiredParam("request");
            var code = params.get("code") || "";
            var codeSuffix = code ? " Code: " + code + "." : "";

            setStatus("Requesting passkey challenge for @" + username + "...");
            var begin = await apiRequest("/auth/passkey/begin", {
                body: { username: username },
            });
            var requestOptions = makeRequestOptions(begin.options);

            setStatus("Waiting for browser passkey prompt..." + codeSuffix);
            var credential = await navigator.credentials.get({
                publicKey: requestOptions,
            });
            if (!credential) {
                throw new Error("No passkey was returned.");
            }

            setStatus("Verifying passkey...");
            var auth = await apiRequest("/auth/passkey/finish", {
                body: {
                    requestID: begin.requestID,
                    response: authenticationResponseJSON(credential),
                },
            });
            var userID =
                auth && auth.user && typeof auth.user.userID === "string"
                    ? auth.user.userID
                    : requiredParam("user");
            var token = auth && typeof auth.token === "string" ? auth.token : "";
            if (!token) {
                throw new Error("Passkey login did not return a recovery token.");
            }

            setStatus("Recovering CLI device...");
            await apiRequest(
                "/user/" +
                    encodeURIComponent(userID) +
                    "/passkey/recover/devices/requests/" +
                    encodeURIComponent(requestID),
                {
                    token: token,
                },
            );
            showCompletion(
                "Device approved",
                "Your Vex device can finish connecting now.",
                "Device approved with your passkey.",
                "Return to the Vex CLI. It will finish connecting automatically.",
            );
        }

        function requiredParam(name) {
            var value = params.get(name);
            if (!value) {
                throw new Error("Missing " + name + " in passkey link.");
            }
            return value;
        }

        function makeCreationOptions(options) {
            var converted = Object.assign({}, options);
            converted.challenge = base64UrlToArrayBuffer(options.challenge);
            converted.user = Object.assign({}, options.user, {
                id: base64UrlToArrayBuffer(options.user.id),
            });
            converted.excludeCredentials = (options.excludeCredentials || []).map(
                function (credential) {
                    return Object.assign({}, credential, {
                        id: base64UrlToArrayBuffer(credential.id),
                    });
                },
            );
            return converted;
        }

        function makeRequestOptions(options) {
            var converted = Object.assign({}, options);
            converted.challenge = base64UrlToArrayBuffer(options.challenge);
            converted.allowCredentials = (options.allowCredentials || []).map(
                function (credential) {
                    return Object.assign({}, credential, {
                        id: base64UrlToArrayBuffer(credential.id),
                    });
                },
            );
            return converted;
        }

        function registrationResponseJSON(credential) {
            var response = credential.response;
            return removeUndefined({
                authenticatorAttachment: credential.authenticatorAttachment,
                clientExtensionResults: credential.getClientExtensionResults(),
                id: credential.id,
                rawId: arrayBufferToBase64Url(credential.rawId),
                response: removeUndefined({
                    attestationObject: arrayBufferToBase64Url(response.attestationObject),
                    clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
                    transports:
                        typeof response.getTransports === "function"
                            ? response.getTransports()
                            : undefined,
                }),
                type: credential.type,
            });
        }

        function authenticationResponseJSON(credential) {
            var response = credential.response;
            return removeUndefined({
                authenticatorAttachment: credential.authenticatorAttachment,
                clientExtensionResults: credential.getClientExtensionResults(),
                id: credential.id,
                rawId: arrayBufferToBase64Url(credential.rawId),
                response: removeUndefined({
                    authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
                    clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
                    signature: arrayBufferToBase64Url(response.signature),
                    userHandle: response.userHandle
                        ? arrayBufferToBase64Url(response.userHandle)
                        : null,
                }),
                type: credential.type,
            });
        }

        function removeUndefined(value) {
            Object.keys(value).forEach(function (key) {
                if (value[key] === undefined) {
                    delete value[key];
                }
            });
            return value;
        }

        function base64UrlToArrayBuffer(value) {
            var base64 = value.replace(/-/g, "+").replace(/_/g, "/");
            var padding = base64.length % 4;
            if (padding === 2) base64 += "==";
            if (padding === 3) base64 += "=";
            if (padding === 1) {
                throw new Error("Invalid base64url value from server.");
            }
            var binary = window.atob(base64);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        }

        function arrayBufferToBase64Url(buffer) {
            var bytes = new Uint8Array(buffer);
            var binary = "";
            for (var i = 0; i < bytes.byteLength; i += 1) {
                binary += String.fromCharCode(bytes[i]);
            }
            return window
                .btoa(binary)
                .replace(/\\+/g, "-")
                .replace(/\\//g, "_")
                .replace(/=+$/g, "");
        }
    </script>
</body>
</html>`;

export const getCliPasskeyPageRouter = (): express.Router => {
    const router = express.Router();

    router.get("/cli/passkey", (_req, res) => {
        res.set({
            "Cache-Control": "no-store",
            "Content-Security-Policy": CSP,
            "Content-Type": "text/html; charset=utf-8",
            "Permissions-Policy":
                "publickey-credentials-create=(self), publickey-credentials-get=(self)",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        });
        res.status(200).send(CLI_PASSKEY_PAGE);
    });

    return router;
};
