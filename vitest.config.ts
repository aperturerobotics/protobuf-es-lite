import { configDefaults, defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'dist'],
    alias: {
      "@aptre/protobuf-es-lite": resolve(__dirname, "./src"),
    },
  },
})
