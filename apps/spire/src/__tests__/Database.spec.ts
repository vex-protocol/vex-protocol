/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { SpireOptions } from "../Spire.ts";
import type { MailWS, PreKeysWS, RegistrationPayload } from "@vex-chat/types";

import { XUtils } from "@vex-chat/crypto";
import { MailType } from "@vex-chat/types";

import * as uuid from "uuid";
import { describe, expect, it, vi } from "vitest";

import {
    Database,
    MAX_ACTIVE_DEVICES_PER_USER,
    validateAccountPassword,
} from "../Database.ts";

// vi.mock is hoisted above all imports automatically.
// Minimal stubs for uuid functions used by spire src: v4, parse, stringify.
vi.mock("uuid", () => ({
    parse: (s: string) => {
        const matches = s.replace(/-/g, "").match(/.{2}/g);
        if (!matches) throw new Error("Invalid UUID");
        return Uint8Array.from(matches.map((b) => parseInt(b, 16)));
    },
    stringify: (b: Uint8Array) => {
        const hex = Array.from(b)
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    },
    v4: vi.fn(() => "93ce482b-a0f2-4f6e-b1df-3aed61073552"),
    validate: () => true,
}));

describe("Database", () => {
    // Reusable test data
    const keyID = "de459e05-aa63-4dfa-97b4-ed43d5c7a5f7";
    const userID = "4e67b90f-cbf8-44bc-8ce3-d3b248f033f1";
    const deviceID = "23cb0b27-7d0c-43b2-87e1-c2b93e0095e5";

    const publicKey = XUtils.decodeHex(
        "30c2d0294c1cfdbb73c6b3bbe6010088c2dba8384b04ff2e2b92172431d66b5e",
    );
    const signature = XUtils.decodeHex(
        "dd0665079426c3efcf4dce9b1487e4aca132f8147581b3294c3f23ddd2b4ba8240a10082bd06805d7eb320d91af971da3306e11b60073ccc3d829710f5036004000030c2d0294c1cfdbb73c6b3bbe6010088c2dba8384b04ff2e2b92172431d66b5e",
    );

    const testSQLPreKey = {
        deviceID,
        index: 1,
        keyID,
        publicKey:
            "30c2d0294c1cfdbb73c6b3bbe6010088c2dba8384b04ff2e2b92172431d66b5e",
        signature:
            "dd0665079426c3efcf4dce9b1487e4aca132f8147581b3294c3f23ddd2b4ba8240a10082bd06805d7eb320d91af971da3306e11b60073ccc3d829710f5036004000030c2d0294c1cfdbb73c6b3bbe6010088c2dba8384b04ff2e2b92172431d66b5e",
        userID,
    };

    const testWSPreKey: PreKeysWS = {
        deviceID,
        index: 1,
        publicKey,
        signature,
    };

    const devicePayload = (
        deviceName: string,
        signKey: string,
    ): RegistrationPayload => ({
        deviceName,
        intent: "create-account",
        preKey: testSQLPreKey.publicKey,
        preKeyIndex: 1,
        preKeySignature: testSQLPreKey.signature,
        signed: "00",
        signKey,
        username: "alice",
    });

    const options: SpireOptions = {
        dbType: "sqlite3mem",
    };

    describe("account password policy", () => {
        it("accepts long passphrases without composition requirements", () => {
            expect(
                validateAccountPassword("four simple words make a password"),
            ).toBeNull();
        });

        it("rejects short, common, repeated, and username-matching values", () => {
            expect(validateAccountPassword("thirteen-char!")).toContain(
                "at least 15",
            );
            expect(validateAccountPassword("passwordpassword")).toBe(
                "Choose a less common password.",
            );
            expect(validateAccountPassword("z".repeat(20))).toBe(
                "Choose a less common password.",
            );
            expect(
                validateAccountPassword(
                    "long-account-name",
                    "Long-Account-Name",
                ),
            ).toBe("Choose a less common password.");
        });
    });

    describe("createUser", () => {
        it("requires a password for new accounts", async () => {
            expect.assertions(3);
            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            const [user, err] = await provider.createUser(
                                new Uint8Array(16),
                                devicePayload("desktop", "b".repeat(64)),
                            );
                            expect(user).toBeNull();
                            expect(err).toBeInstanceOf(Error);
                            expect(err?.message).toBe(
                                "Password is required to register a new account.",
                            );
                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });

        it("rolls back the user when initial device creation fails", async () => {
            expect.assertions(5);
            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            const signKey = "c".repeat(64);
                            const [first, firstError] =
                                await provider.createUser(
                                    new Uint8Array(16).fill(1),
                                    {
                                        ...devicePayload("desktop", signKey),
                                        password:
                                            "correct horse battery staple",
                                    },
                                );
                            expect(firstError).toBeNull();
                            expect(first).not.toBeNull();

                            const [second, secondError] =
                                await provider.createUser(
                                    new Uint8Array(16).fill(2),
                                    {
                                        ...devicePayload("mobile", signKey),
                                        password:
                                            "correct horse battery staple",
                                        username: "bob",
                                    },
                                );
                            expect(secondError).toBeInstanceOf(Error);
                            expect(second).toBeNull();
                            await expect(
                                provider.retrieveUser("bob"),
                            ).resolves.toBeNull();
                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            await provider.close().catch(() => undefined);
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });
    });

    describe("createDevice", () => {
        it("bounds active device clusters", async () => {
            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            for (
                                let index = 0;
                                index < MAX_ACTIVE_DEVICES_PER_USER;
                                index += 1
                            ) {
                                await provider.createDevice(
                                    userID,
                                    devicePayload(
                                        `device-${String(index)}`,
                                        index.toString(16).padStart(64, "0"),
                                    ),
                                );
                            }

                            await expect(
                                provider.createDevice(
                                    userID,
                                    devicePayload(
                                        "one-too-many",
                                        "f".repeat(64),
                                    ),
                                ),
                            ).rejects.toThrow("limited to 20 active devices");
                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            await provider.close().catch(() => undefined);
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });
    });

    describe("saveOTK", () => {
        it("takes a userId and one time key, adds a keyId and saves it to oneTimeKey table", async () => {
            expect.assertions(1);

            // uuid@14 overloads: mock the string return path (v4 with no `buf` argument).
            vi.mocked(uuid.v4 as () => string).mockReturnValueOnce(keyID);

            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            await provider.saveOTK(
                                testSQLPreKey.userID,
                                testSQLPreKey.deviceID,
                                [
                                    {
                                        deviceID,
                                        index: 1,
                                        publicKey,
                                        signature,
                                    },
                                ],
                            );
                            const oneTimeKey = await provider.getOTK(deviceID);
                            expect(oneTimeKey).toEqual(testWSPreKey);
                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });
    });

    describe("getPreKeys", () => {
        it("returns a preKey by deviceID if said preKey exists.", async () => {
            expect.assertions(1);

            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            await provider["db"]
                                .insertInto("preKeys")
                                .values(testSQLPreKey)
                                .execute();
                            const result = await provider.getPreKeys(deviceID);
                            expect(result).toEqual(testWSPreKey);
                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });

        it("return null if there are no preKeys with deviceID param", async () => {
            expect.assertions(1);
            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            const result = await provider.getPreKeys(deviceID);
                            expect(result).toBeNull();
                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });
    });

    describe("recoverDevice", () => {
        it("creates a new device and revokes all previous devices for the user", async () => {
            expect.assertions(9);

            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            const oldA = await provider.createDevice(
                                userID,
                                devicePayload("old-a", "a".repeat(64)),
                                { approvedByPasskeyID: "old-passkey" },
                            );
                            const oldB = await provider.createDevice(
                                userID,
                                devicePayload("old-b", "b".repeat(64)),
                            );
                            await provider.saveOTK(userID, oldA.deviceID, [
                                {
                                    deviceID: oldA.deviceID,
                                    index: 1,
                                    publicKey,
                                    signature,
                                },
                            ]);
                            await provider.saveNotificationSubscription({
                                channel: "expo",
                                deviceID: oldA.deviceID,
                                events: ["deviceRequest"],
                                platform: "ios",
                                token: "ExponentPushToken[old-a]",
                                userID,
                            });
                            await provider.saveNotificationSubscription({
                                channel: "expo",
                                deviceID: oldB.deviceID,
                                events: ["*"],
                                platform: "android",
                                token: "ExponentPushToken[old-b]",
                                userID,
                            });

                            const recovered = await provider.recoverDevice(
                                userID,
                                devicePayload("recovered", "c".repeat(64)),
                            );

                            expect(recovered.revokedDeviceIDs.sort()).toEqual(
                                [oldA.deviceID, oldB.deviceID].sort(),
                            );
                            expect(
                                await provider.retrieveDevice(oldA.deviceID),
                            ).toBeNull();
                            expect(
                                await provider.retrieveDevice(oldB.deviceID),
                            ).toBeNull();
                            expect(
                                await provider.retrieveDevice(
                                    recovered.device.deviceID,
                                ),
                            ).toEqual(recovered.device);
                            expect(
                                await provider.retrieveUserDeviceList([userID]),
                            ).toEqual([recovered.device]);
                            expect(
                                await provider.getPreKeys(oldA.deviceID),
                            ).toBeNull();
                            expect(
                                await provider.getOTK(oldA.deviceID),
                            ).toBeNull();
                            expect(
                                await provider.retrieveNotificationSubscriptions(
                                    {
                                        event: "deviceRequest",
                                        userID,
                                    },
                                ),
                            ).toEqual([]);
                            expect(
                                await provider.isDevicePasskeyApproved(
                                    userID,
                                    oldA.deviceID,
                                ),
                            ).toBe(false);
                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            await provider.close().catch(() => {
                                /* ignore cleanup failure */
                            });
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });
    });

    describe("retrieveMail", () => {
        it("returns queued mail in send order for logged-out batch drains", async () => {
            expect.assertions(1);

            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            const mail = (
                                mailID: string,
                                time: string,
                                nonce: string,
                            ) => ({
                                authorID: userID,
                                cipher: "01",
                                extra: "02",
                                forward: 0,
                                group: null,
                                header: "03",
                                mailID,
                                mailType: MailType.initial,
                                nonce,
                                readerID: userID,
                                recipient: deviceID,
                                sender: "sender-a",
                                time,
                            });
                            const baseTimeMs = Date.now() - 60_000;
                            const isoTime = (offsetMs: number) =>
                                new Date(baseTimeMs + offsetMs).toISOString();

                            await provider["db"]
                                .insertInto("mail")
                                .values([
                                    mail(
                                        "00000000-0000-0000-0000-000000000003",
                                        isoTime(2_000),
                                        "06",
                                    ),
                                    mail(
                                        "00000000-0000-0000-0000-000000000001",
                                        isoTime(0),
                                        "04",
                                    ),
                                    mail(
                                        "00000000-0000-0000-0000-000000000002",
                                        isoTime(1_000),
                                        "05",
                                    ),
                                ])
                                .execute();

                            const result =
                                await provider.retrieveMail(deviceID);
                            expect(
                                result.map(
                                    ([, body]: [Uint8Array, MailWS, string]) =>
                                        body.mailID,
                                ),
                            ).toEqual([
                                "00000000-0000-0000-0000-000000000001",
                                "00000000-0000-0000-0000-000000000002",
                                "00000000-0000-0000-0000-000000000003",
                            ]);
                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });
    });

    describe("saveMailBatch", () => {
        it("stores multiple queued mail rows in one insert", async () => {
            expect.assertions(1);

            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            const mail = (
                                mailID: string,
                                nonce: number,
                            ): MailWS => ({
                                authorID: userID,
                                cipher: new Uint8Array([1, nonce]),
                                extra: new Uint8Array([2, nonce]),
                                forward: false,
                                group: null,
                                mailID,
                                mailType: MailType.initial,
                                nonce: new Uint8Array([3, nonce]),
                                readerID: userID,
                                recipient: deviceID,
                                sender: "sender-a",
                            });

                            await provider.saveMailBatch([
                                {
                                    header: new Uint8Array([4, 1]),
                                    mail: mail(
                                        "00000000-0000-0000-0000-000000000011",
                                        1,
                                    ),
                                    senderDeviceID: "sender-a",
                                    userID,
                                },
                                {
                                    header: new Uint8Array([4, 2]),
                                    mail: mail(
                                        "00000000-0000-0000-0000-000000000012",
                                        2,
                                    ),
                                    senderDeviceID: "sender-a",
                                    userID,
                                },
                            ]);

                            const result =
                                await provider.retrieveMail(deviceID);
                            expect(
                                result.map(
                                    ([, body]: [Uint8Array, MailWS, string]) =>
                                        body.mailID,
                                ),
                            ).toEqual([
                                "00000000-0000-0000-0000-000000000011",
                                "00000000-0000-0000-0000-000000000012",
                            ]);
                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });
    });

    describe("notification subscriptions", () => {
        it("upserts and filters Expo push subscriptions by event", async () => {
            expect.assertions(8);

            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            const created =
                                await provider.saveNotificationSubscription({
                                    channel: "expo",
                                    deviceID,
                                    events: ["mail"],
                                    platform: "ios",
                                    token: "ExponentPushToken[test]",
                                    userID,
                                });
                            expect(created.events).toEqual(["mail"]);
                            expect(created.enabled).toBe(true);

                            const mailSubs =
                                await provider.retrieveNotificationSubscriptions(
                                    { deviceID, event: "mail", userID },
                                );
                            expect(mailSubs).toHaveLength(1);

                            const deviceSubs =
                                await provider.retrieveNotificationSubscriptions(
                                    {
                                        deviceID,
                                        event: "deviceRequest",
                                        userID,
                                    },
                                );
                            expect(deviceSubs).toHaveLength(0);

                            const updated =
                                await provider.saveNotificationSubscription({
                                    channel: "expo",
                                    deviceID,
                                    events: ["deviceRequest"],
                                    platform: "ios",
                                    token: "ExponentPushToken[test]",
                                    userID,
                                });
                            expect(updated.subscriptionID).toBe(
                                created.subscriptionID,
                            );

                            const mailSubsAfterUpdate =
                                await provider.retrieveNotificationSubscriptions(
                                    { deviceID, event: "mail", userID },
                                );
                            expect(mailSubsAfterUpdate).toHaveLength(0);

                            const deviceSubsAfterUpdate =
                                await provider.retrieveNotificationSubscriptions(
                                    {
                                        deviceID,
                                        event: "deviceRequest",
                                        userID,
                                    },
                                );
                            expect(deviceSubsAfterUpdate).toHaveLength(1);

                            await provider.deleteDevice(deviceID);
                            expect(
                                await provider.retrieveNotificationSubscriptions(
                                    {
                                        deviceID,
                                        event: "deviceRequest",
                                        userID,
                                    },
                                ),
                            ).toEqual([]);

                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });

        it("stores one Expo push subscription for concurrent identical saves", async () => {
            expect.assertions(3);

            const provider = new Database(options);
            await new Promise<void>((resolve, reject) => {
                provider.once("ready", () => {
                    void (async () => {
                        try {
                            const input = {
                                channel: "expo" as const,
                                deviceID,
                                events: ["mail"],
                                platform: "android",
                                token: "ExponentPushToken[dedupe]",
                                userID,
                            };
                            const [first, second] = await Promise.all([
                                provider.saveNotificationSubscription(input),
                                provider.saveNotificationSubscription(input),
                            ]);
                            expect(second.subscriptionID).toBe(
                                first.subscriptionID,
                            );

                            const mailSubs =
                                await provider.retrieveNotificationSubscriptions(
                                    { deviceID, event: "mail", userID },
                                );
                            expect(mailSubs).toHaveLength(1);
                            expect(mailSubs[0]?.subscriptionID).toBe(
                                first.subscriptionID,
                            );

                            await provider.close();
                            resolve();
                        } catch (e: unknown) {
                            reject(
                                e instanceof Error ? e : new Error(String(e)),
                            );
                        }
                    })();
                });
            });
        });
    });
});
