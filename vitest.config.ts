import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// "@/..."-Alias wie in tsconfig.json, damit Route-Handler (app/api/**) direkt
// in Tests importierbar sind.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
