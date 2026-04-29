/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * Live-adjustable load knobs (stdin +/− when TTY raw mode is enabled).
 */
export class StressKnobs {
    public get concurrency(): number {
        return this.n;
    }
    public get initialConcurrency(): number {
        return this.initial;
    }

    private readonly initial: number;

    private n: number;

    public constructor(initial: number) {
        this.initial = Math.max(1, Math.floor(initial));
        this.n = this.initial;
    }

    public down(step = 10): void {
        this.n = Math.max(1, this.n - Math.max(1, Math.floor(step)));
    }

    public reset(): void {
        this.n = this.initial;
    }

    public up(step = 10): void {
        this.n = Math.min(50_000, this.n + Math.max(1, Math.floor(step)));
    }
}
