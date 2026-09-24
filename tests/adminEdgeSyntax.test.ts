import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

// build:edge は共有戦闘コードだけが対象。実際に配信する入口も構文検査する。
describe("管理用Edgeの配信ファイル", () => {
  for (const file of ["crimon-admin/index.ts", "crimon-admin/progress.ts", "crimon-player-snapshot/index.ts"]) {
    it(`${file} の構文を検査する`, () => {
      const source = readFileSync(new URL(`../supabase/functions/${file}`, import.meta.url), "utf8");
      const result = ts.transpileModule(source, { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
      expect(result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
    });
  }
});
