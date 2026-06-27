import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages のプロジェクトページでは base を "/<repo>/" にする必要がある。
//   - ローカル開発 / カスタムドメイン: base = "/"
//   - GitHub Pages: CI で VITE_BASE="/<repo>/" を渡す
const rawBase = process.env.VITE_BASE ?? "/";
const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
});
