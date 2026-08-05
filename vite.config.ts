import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    target: "es2023",
    sourcemap: true,
    rollupOptions: {
      input: {
        game: resolve(rootDirectory, "index.html"),
        balance: resolve(rootDirectory, "balance/index.html"),
      },
    },
  },
  server: {
    strictPort: true,
  },
});
