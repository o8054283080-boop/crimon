import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages ではリポジトリ名のサブパス配信になるため base を明示する。
// 環境変数 VITE_BASE_PATH が指定されていればそれを優先する(ローカル開発では "/" のまま)。
const basePath = process.env.VITE_BASE_PATH ?? "/";

/**
 * ビルドの版。画面の隅に出して、どのビルドが動いているかを目で確かめられるようにする。
 * 配信は成功しているのに古い画面が出ている、という切り分けに要る。
 */
const buildId = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  base: basePath,
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    VitePWA({
      // waiting worker はユーザーがバナーのボタンを押すまで有効化しない。
      registerType: "prompt",
      includeAssets: ["icons/favicon-32.png", "icons/apple-touch-icon.png"],
      manifest: {
        // iOS のホーム画面追加で旧 GitHub Pages 版と新配信先を
        // 同一Webアプリ扱いされないよう、相対 "." ではなく明示的なIDを持たせる。
        // basePath を含めることで GitHub Pages のサブパス配信でも同一オリジン内に収まる。
        id: `${basePath}crimon-pwa-v2`,
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
        // prompt更新では、ユーザーが更新ボタンを押すまで新workerをwaitingに保つ。
        // falseなら生成SWにSKIP_WAITINGメッセージのlistenerが入り、registerSWが返す
        // updateSW()から公式のmessageSkipWaiting()経由で安全に有効化できる。
        skipWaiting: false,
        clientsClaim: true,
        /*
         * ogg/json を入れ忘れていたため、効果音がキャッシュの対象外だった
         * (オフラインでは無音になり、ビルドの版とも紐づかない)。
         *
         * **webp も同じ穴が開いていた。** モンスターの2Dの絵も、
         * ホームの絵札もすべて webp なので、入れないと
         * オフラインでモンスターが1体も出ない。
         * 拡張子を増やしたら必ずここへ足すこと。
         */
        globPatterns: ["**/*.{js,css,html,png,webp,jpg,svg,webmanifest,ogg,json}"],
        // 効果音が72個あるので、既定の上限(2MiB)だと取りこぼす
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // 古い版のキャッシュを残さない。残ると更新後も旧ファイルを掴み続ける
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
