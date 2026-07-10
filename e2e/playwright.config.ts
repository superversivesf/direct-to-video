import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 90000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    headless: true,
  },
  webServer: {
    command: "node server/dist/index.js",
    port: 3100,
    reuseExistingServer: false,
    cwd: "..",
    env: {
      PORT: "3100",
      DB_PATH: "/tmp/pitchstorm-e2e-test.db",
    },
  },
});