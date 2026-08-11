import { defineConfig } from "checkly";
import { Frequency } from "checkly/constructs";

export default defineConfig({
  projectName: "Any Given Pick Production Monitoring",
  logicalId: "any-given-pick-production-monitoring",
  repoUrl: "https://github.com/Droidan1/any-given-pick",
  checks: {
    activated: true,
    muted: false,
    frequency: Frequency.EVERY_10M,
    locations: ["us-east-2"],
    tags: ["production", "health", "game-window"],
    checkMatch: "src/__checks__/**/*.check.ts",
    ignoreDirectoriesMatch: ["node_modules/**", ".next/**"],
  },
  cli: {
    runLocation: "us-east-2",
  },
});
