import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages ではリポジトリ名のサブパス配信になるため base を明示する。
// 環境変数 VITE_BASE_PATH が指定されていればそれを優先する(ローカル開発では "/" のまま)。
const basePath = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/favicon-32.png", "icons/apple-touch-icon.png"],
      manifest: {
        id: ".",
        name: "Crimon - モンスターバトル",
        short_name: "Crimon",
        description: "6属性の色違いモンスターで戦う4vs4ターン制コマンドバトル",
        lang: "ja",
        // サブパス配信でも壊れないよう相対パスにしておく(マニフェスト自身の場所からの相対解決)
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "portrait",
        background_color: "#171826",
        theme_color: "#171826",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
      },
    }),
  ],
});
