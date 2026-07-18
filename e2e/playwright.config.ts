import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 90000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  use: {
    baseURL: "http://localhost:3100",
    headless: true,
  },
  webServer: {
    command: "rm -f /tmp/directtovideo-e2e-test.db && node server/dist/index.js",
    port: 3100,
    reuseExistingServer: false,
    cwd: "..",
    timeout: 30000,
    env: {
      PORT: "3100",
      DB_PATH: "/tmp/directtovideo-e2e-test.db",
      MAX_ROOMS: "100",
      MAX_PLAYERS: "20",
    },
  },
});