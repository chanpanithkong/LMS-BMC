import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The mock backend must never reach the browser bundle (brief §11, §19).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/mocks/server/**", "src/app/api/mock/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/mocks/server/*", "**/mocks/server/*"], message: "Mock backend code may only be used by the mock route handler." }] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
