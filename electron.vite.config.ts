import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "electron-vite"

const shared = { "@shared": resolve(__dirname, "src/shared") }

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: { resolve: { alias: shared } },
  renderer: {
    resolve: { alias: { ...shared, "@": resolve(__dirname, "src/renderer") } },
    plugins: [tailwindcss()],
  },
})
