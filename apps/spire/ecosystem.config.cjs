/**
 * PM2 process definitions for Spire.
 *
 * Start: `pm2 start ecosystem.config.cjs`
 */
const root = __dirname;

module.exports = {
    apps: [
        {
            name: "spire",
            cwd: root,
            script: "src/run.ts",
            interpreter: "node",
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "1G",
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};
