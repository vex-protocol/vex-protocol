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
            --bg: #080b0d;
            --panel: #10161a;
            --panel-border: #27323a;
            --text: #eef6fb;
            --muted: #9fb2be;
            --accent: #a8c8df;
            --accent-strong: #d3ebfb;
            --danger: #ff776d;
        }

        * {
            box-sizing: border-box;
        }

        html,
        body {
            min-height: 100%;
        }

        body {
            align-items: center;
            background:
                radial-gradient(circle at 50% 0%, rgba(168, 200, 223, 0.12), transparent 36rem),
                var(--bg);
            color: var(--text);
            display: flex;
            font-family:
                Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            justify-content: center;
            margin: 0;
            padding: 24px;
        }

        main {
            background: rgba(16, 22, 26, 0.95);
            border: 1px solid var(--panel-border);
            border-radius: 8px;
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
            max-width: 460px;
            padding: 28px;
            width: 100%;
        }

        .mark {
            color: var(--accent);
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 34px;
            height: 44px;
            line-height: 44px;
            margin-bottom: 18px;
            width: 44px;
        }

        h1 {
            font-size: 24px;
            font-weight: 650;
            letter-spacing: 0;
            line-height: 1.15;
            margin: 0 0 10px;
        }

        p {
            color: var(--muted);
            font-size: 15px;
            line-height: 1.5;
            margin: 0;
        }

        button {
            align-items: center;
            appearance: none;
            background: var(--accent);
            border: 0;
            border-radius: 8px;
            color: #071014;
            cursor: pointer;
            display: inline-flex;
            font: inherit;
            font-weight: 700;
            justify-content: center;
            margin-top: 24px;
            min-height: 46px;
            padding: 0 18px;
            width: 100%;
        }

        button:disabled {
            cursor: wait;
            opacity: 0.72;
        }

        .status {
            border-top: 1px solid var(--panel-border);
            color: var(--muted);
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 13px;
            line-height: 1.45;
            margin-top: 22px;
            min-height: 20px;
            padding-top: 18px;
            word-break: break-word;
        }

        .error {
            color: var(--danger);
        }

        .success {
            color: var(--accent-strong);
        }
    </style>
</head>
<body>
    <main>
        <div class="mark">◈</div>
        <h1 id="title">Continue with your passkey.</h1>
        <p id="copy">Use the passkey saved in this browser or on a nearby device to finish signing in from the Vex CLI.</p>
        <button id="action" type="button">Continue with passkey</button>
        <div class="status" id="status">Waiting for passkey.</div>
    </main>
    <script>
        "use strict";

        var params = new URLSearchParams(window.location.hash.slice(1));
        var action = document.getElementById("action");
        var statusEl = document.getElementById("status");
        var titleEl = document.getElementById("title");
        var copyEl = document.getElementById("copy");
        var mode = params.get("mode") || "recover";
        var startupError = null;
        var apiBase = window.location.origin;
        var busy = false;

        try {
            apiBase = resolveTrustedApiBase(params.get("api"));
        } catch (err) {
            startupError = err;
        }

        if (mode === "register") {
            titleEl.textContent = "Create a passkey for Vex.";
            copyEl.textContent = "This adds the first passkey required by your new CLI account.";
            action.textContent = "Create passkey";
            setStatus("Ready to create passkey.");
        } else {
            setStatus("Ready to verify passkey.");
        }

        if (startupError) {
            setStatus(errorMessage(startupError), "error");
            action.disabled = true;
        }

        action.addEventListener("click", function () {
            void run();
        });

        function setStatus(message, kind) {
            statusEl.textContent = message;
            statusEl.className = "status" + (kind ? " " + kind : "");
        }

        function setBusy(nextBusy) {
            busy = nextBusy;
            action.disabled = nextBusy;
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
            if (text.length > 0) {
                try {
                    payload = JSON.parse(text);
                } catch (_err) {
                    payload = { error: text };
                }
            }
            if (!response.ok) {
                throw new Error(
                    payload && payload.error
                        ? String(payload.error)
                        : "Request failed with status " + response.status,
                );
            }
            return payload;
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
                } else {
                    await recoverWithPasskey();
                }
            } catch (err) {
                setStatus(errorMessage(err), "error");
                action.textContent = mode === "register" ? "Try again" : "Retry passkey";
            } finally {
                setBusy(false);
            }
        }

        function errorMessage(err) {
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
            var credentialOptions = makeCreationOptions(begin.options);

            setStatus("Waiting for browser passkey prompt...");
            var credential = await navigator.credentials.create({
                publicKey: credentialOptions,
            });
            if (!credential) {
                throw new Error("No passkey was created.");
            }

            setStatus("Saving passkey...");
            await apiRequest("/user/" + encodeURIComponent(userID) + "/passkeys/register/finish", {
                body: {
                    name: name,
                    requestID: begin.requestID,
                    response: registrationResponseJSON(credential),
                },
                token: token,
            });
            setStatus("Passkey saved. Return to the Vex CLI.", "success");
            titleEl.textContent = "Passkey saved.";
            copyEl.textContent = "The CLI can finish connecting now.";
            action.textContent = "Done";
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
            setStatus("CLI device recovered. Return to the Vex CLI.", "success");
            titleEl.textContent = "Device signed in.";
            copyEl.textContent = "The CLI can finish connecting now.";
            action.textContent = "Done";
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
