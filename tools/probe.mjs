/**
 * 常駐している確認用ブラウザ(tools/harness.mjs)へ指示を送る小さな窓口。
 *
 * 使い方:
 *   node tools/probe.mjs goto /                    画面を開く(アプリ)
 *   node tools/probe.mjs goto /preview.html "seed=3&paused=1&roster=..."  舞台の下見
 *   node tools/probe.mjs eval "document.title"     ブラウザ側で式を評価する
 *   node tools/probe.mjs shot /tmp/a.png [セレクタ] 撮る
 *   node tools/probe.mjs tap 450 200               画面座標を叩く
 *   node tools/probe.mjs drag 450 200 -300         横に滑らせる(カメラの回り込み)
 *   node tools/probe.mjs size 900 430              画面の大きさを変える
 *   node tools/probe.mjs problems                  ブラウザ側の例外・エラーを見る
 *   node tools/probe.mjs quit                      常駐を終える
 *
 * 出力は常にJSON。problems が空でないなら、型チェックが通っていても壊れている。
 */
const PORT = Number(process.env.HARNESS_PORT ?? 5311);
const [command, ...rest] = process.argv.slice(2);

if (!command) {
  console.error("命令を指定してください(goto / eval / shot / tap / drag / size / problems / quit)");
  process.exit(1);
}

function buildBody() {
  switch (command) {
    case "goto": {
      const path = rest[0] ?? "/";
      const query = rest[1] ? `?${rest[1]}` : "";
      return {
        path: `${path}${query}`,
        // 舞台の下見は描画完了の合図を待てる
        waitPreview: path.includes("preview"),
        fresh: rest.includes("--fresh"),
      };
    }
    case "eval":
      return { expression: rest.join(" ") };
    case "shot":
      return { path: rest[0], selector: rest[1] };
    case "tap":
      return { x: Number(rest[0]), y: Number(rest[1]) };
    case "drag":
      return { x: Number(rest[0]), y: Number(rest[1]), dx: Number(rest[2] ?? 0), dy: Number(rest[3] ?? 0) };
    case "size":
      return { width: Number(rest[0]), height: Number(rest[1]) };
    case "wait":
      return { ms: Number(rest[0] ?? 500) };
    default:
      return {};
  }
}

try {
  const response = await fetch(`http://127.0.0.1:${PORT}/${command}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildBody()),
  });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 1));
  // ブラウザ側で異常が出ていたら、呼び出し側が気付けるよう終了コードを変える
  if (Array.isArray(result.problems) && result.problems.length > 0) process.exit(2);
  process.exit(result.ok === false ? 1 : 0);
} catch (error) {
  console.error(`常駐サーバへ繋がりません(先に node tools/harness.mjs を起動してください): ${String(error).slice(0, 200)}`);
  process.exit(1);
}
