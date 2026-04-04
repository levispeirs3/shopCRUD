import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local migration utilities and generated batch helpers are outside the app runtime.
    "migrate-tmp/**",
    "concat-sql.cjs",
    "export-sqlite.cjs",
    "gen-inserts.cjs",
    "migrate-remaining.cjs",
    "migrate-to-supabase.mjs",
    "mcp-args-export.mjs",
  ]),
]);

export default eslintConfig;
