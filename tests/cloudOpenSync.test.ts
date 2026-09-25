import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  decideOpenSync,
  envelopeFingerprint,
  syncOnOpen,
  REPLACED_MAIN_COPY_ID,
  type CloudRecoveryMeta,
  type CloudSaveEnvelope,
} from "../src/game/cloudRecovery.js";

/*
 * 開いた時に、いちばん後で遊んだ端末のデータへ揃える。
 * 依頼主「ログインした時点でそのアカウントに合わせるだけではだめなんですか？」
 */

const save = (gold: number) => ({ kind: "crimon-save", version: 1, exportedAt: "2026-09-25T00:00:00Z", state: { gold, monsters: [{ id: "one" }], equipment: [] } }) as unknown as CloudSaveEnvelope;
// この端末は世代2で gold=10 を上げたのが最後
const meta = (extra: Partial<CloudRecoveryMeta> = {}): CloudRecoveryMeta => ({ recoveryId: "test", sessionToken: "test-session", sessionExpiresAt: "2099-01-01", revision: 2, savedAt: "2026-09-01", lastUploadedSave: envelopeFingerprint(save(10)), ...extra });
const cloud = (gold: number, revision = 3, savedAt = "2026-09-25T10:00:00Z") => ({ revision, savedAt, save: save(gold) });
const at = (iso: string) => Date.parse(iso);
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const latest = (value: CloudSaveEnvelope, revision = 3, savedAt = "2026-09-25T10:00:00Z") => reply({ ok: true, revision, savedAt, save: value });
afterEach(() => vi.unstubAllGlobals());

describe("開いた時の判断(decideOpenSync)", () => {
  it("同じ内容なら何もしない(分かれていた印だけ消す)", () => {
    expect(decideOpenSync({ meta: meta({ syncConflict: true }), local: save(30), localTouchedAt: null, cloud: cloud(30) }).decision).toBe("IN_SYNC");
  });
  it("他の端末が保存していなければ、いつも通り上げるだけ", () => {
    expect(decideOpenSync({ meta: meta(), local: save(20), localTouchedAt: at("2026-09-26T00:00:00Z"), cloud: cloud(10, 2) }).decision).toBe("UP_TO_DATE");
  });
  it("この端末で遊んでいないなら、別の端末の続きに合わせる(時刻は比べない)", () => {
    const result = decideOpenSync({ meta: meta(), local: save(10), localTouchedAt: at("2026-09-30T00:00:00Z"), cloud: cloud(50) });
    expect(result).toEqual({ decision: "ADOPT_CLOUD", localChanged: false });
  });
  it("両方で遊んでいて、別の端末の方が後なら、クラウドに合わせる", () => {
    const result = decideOpenSync({ meta: meta(), local: save(20), localTouchedAt: at("2026-09-25T09:00:00Z"), cloud: cloud(50) });
    expect(result).toEqual({ decision: "ADOPT_CLOUD", localChanged: true });
  });
  it("両方で遊んでいて、この端末の方が後なら、この端末のデータを残す", () => {
    expect(decideOpenSync({ meta: meta(), local: save(20), localTouchedAt: at("2026-09-25T11:00:00Z"), cloud: cloud(50) }).decision).toBe("KEEP_LOCAL");
  });
  it("書いた時刻を持たない端末は、分かれた後に控えた時刻で比べる(前から分かれていた人)", () => {
    const split = meta({ syncConflict: true, conflictCopySavedAt: "2026-09-25T12:00:00Z" });
    expect(decideOpenSync({ meta: split, local: save(20), localTouchedAt: null, cloud: cloud(50) }).decision).toBe("KEEP_LOCAL");
    const older = meta({ syncConflict: true, conflictCopySavedAt: "2026-09-25T08:00:00Z" });
    expect(decideOpenSync({ meta: older, local: save(20), localTouchedAt: null, cloud: cloud(50) }).decision).toBe("ADOPT_CLOUD");
  });
  it("どちらが後か分からず、進み具合も同じなら、自動では切り替えない(両方を残して本人が選ぶ)", () => {
    expect(decideOpenSync({ meta: meta(), local: save(20), localTouchedAt: null, cloud: cloud(50) })).toEqual({ decision: "UNDECIDED", localChanged: true });
  });
});

/** ファイターLv・経験値と、セーブの中の時刻を持ったセーブ */
const played = (level: number, exp: number, at: string, gold = level) => ({ kind: "crimon-save", version: 1, exportedAt: at,
  state: { gold, fighterLevel: level, fighterExp: exp, lastStaminaUpdateAt: Date.parse(at), lastLoginBonusAt: Date.parse(at) - 3_600_000, monsters: [{ id: "one" }], equipment: [] } }) as unknown as CloudSaveEnvelope;

describe("巻き戻りを起こさない(旧版の頃から保存が止まっていた端末)", () => {
  // 実例: クラウドは 9/4 の Lv62 のまま、端末は 9/25 まで遊んで Lv77。端末は書き込み時刻をまだ持たない
  const stuck = meta({ revision: 240, lastUploadedSave: envelopeFingerprint(played(62, 0, "2026-09-04T05:00:00Z", 1)) });
  it("書き込み時刻が無くても、セーブの中の時刻同士で比べて、この端末のデータを残す", () => {
    const result = decideOpenSync({ meta: stuck, local: played(77, 100, "2026-09-25T04:03:00Z"), localTouchedAt: null,
      cloud: { revision: 241, savedAt: "2026-09-04T05:27:00Z", save: played(62, 500, "2026-09-04T05:20:00Z") } });
    expect(result.decision).toBe("KEEP_LOCAL");
  });
  it("書き込み時刻がクラウドより古く見えても、中身の時刻と進み具合が勝っていれば巻き戻さない", () => {
    const result = decideOpenSync({ meta: stuck, local: played(77, 100, "2026-09-25T04:03:00Z"), localTouchedAt: Date.parse("2026-09-01T00:00:00Z"),
      cloud: { revision: 241, savedAt: "2026-09-04T05:27:00Z", save: played(62, 500, "2026-09-04T05:20:00Z") } });
    expect(result.decision).toBe("KEEP_LOCAL");
  });
  it("後で遊ばれた方が進み具合で負けている時は、どちらにも自動で切り替えない", () => {
    // クラウドの方が後だが Lv が低い → クラウドに合わせると端末の Lv77 が巻き戻る
    const result = decideOpenSync({ meta: stuck, local: played(77, 0, "2026-09-20T00:00:00Z"), localTouchedAt: null,
      cloud: { revision: 241, savedAt: "2026-09-25T00:00:00Z", save: played(63, 0, "2026-09-25T00:00:00Z") } });
    expect(result.decision).toBe("UNDECIDED");
  });
  it("時刻が同じなら、進んでいる方に揃える", () => {
    const at = "2026-09-25T00:00:00Z";
    expect(decideOpenSync({ meta: stuck, local: played(70, 0, at), localTouchedAt: null, cloud: { revision: 241, savedAt: at, save: played(65, 0, at) } }).decision).toBe("KEEP_LOCAL");
    expect(decideOpenSync({ meta: stuck, local: played(60, 0, at), localTouchedAt: null, cloud: { revision: 241, savedAt: at, save: played(65, 0, at) } }).decision).toBe("ADOPT_CLOUD");
  });
  it("別の端末で後から遊び、進んでもいれば、クラウドに合わせる", () => {
    const result = decideOpenSync({ meta: stuck, local: played(70, 0, "2026-09-20T00:00:00Z"), localTouchedAt: null,
      cloud: { revision: 241, savedAt: "2026-09-25T00:00:00Z", save: played(72, 0, "2026-09-25T00:00:00Z") } });
    expect(result.decision).toBe("ADOPT_CLOUD");
  });
  it("決められない時は、開いた時にはクラウドへ何も書かない", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(latest(save(50)));
    vi.stubGlobal("fetch", fetch);
    const result = await syncOnOpen(meta(), save(20), null, () => save(20));
    expect(result.kind).toBe("UNDECIDED");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("開いた時の実行(syncOnOpen)", () => {
  it("この端末で遊んでいなければ、読むだけでクラウドには何も書かない", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(latest(save(50)));
    vi.stubGlobal("fetch", fetch);
    const result = await syncOnOpen(meta(), save(10), null, () => save(10));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("ADOPT_CLOUD");
    if (result.kind !== "ADOPT_CLOUD") return;
    expect(result.save.state.gold).toBe(50);
    expect(result.meta.revision).toBe(3);
    expect(result.meta.lastUploadedSave).toBe(envelopeFingerprint(save(50)));
    expect(result.meta.syncConflict).toBe(false);
  });
  it("クラウドに合わせる時、この端末で遊んだ分を別のバックアップへ残し、本来の方を最新の日時にする", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(latest(save(50)))
      .mockResolvedValueOnce(reply({ ok: true, savedAt: "2026-09-25T12:00:00Z" }))
      .mockResolvedValueOnce(reply({ ok: true, revision: 4, savedAt: "2026-09-25T12:00:01Z" }));
    vi.stubGlobal("fetch", fetch);
    const result = await syncOnOpen(meta(), save(20), at("2026-09-25T09:00:00Z"), () => save(20));
    const copy = JSON.parse(fetch.mock.calls[1][1].body);
    expect(copy.action).toBe("save_copy");
    expect(copy.save.state.gold).toBe(20);
    const touch = JSON.parse(fetch.mock.calls[2][1].body);
    // 本来のバックアップは**クラウドの内容のまま**保存し直す(この端末のデータで上書きしない)
    expect(touch.action).toBe("save");
    expect(touch.revision).toBe(4);
    expect(touch.save.state.gold).toBe(50);
    expect(result.kind).toBe("ADOPT_CLOUD");
    expect(result.meta.revision).toBe(4);
    expect(result.meta.syncConflict).toBe(false);
    expect(result.meta.conflictCopySavedAt).toBeUndefined();
  });
  it("控えられなかったら、合わせない(この端末にしか無いデータを置き去りにしない)", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(latest(save(50))).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    await expect(syncOnOpen(meta(), save(20), at("2026-09-25T09:00:00Z"), () => save(20))).rejects.toThrow("offline");
  });
  it("この端末の方が後なら、置き換える前のクラウドを控えてから、この端末のデータで更新する", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(latest(save(50)))
      .mockResolvedValueOnce(reply({ ok: true, savedAt: "2026-09-25T12:00:00Z" }))
      .mockResolvedValueOnce(reply({ ok: true, revision: 4, savedAt: "2026-09-25T12:00:01Z" }));
    vi.stubGlobal("fetch", fetch);
    // 判断は起動直後の姿(gold=20)で、上げるのはいまの姿(gold=25: ログインボーナス込み)
    const result = await syncOnOpen(meta(), save(20), at("2026-09-25T11:00:00Z"), () => save(25));
    const copy = JSON.parse(fetch.mock.calls[1][1].body);
    expect(copy.action).toBe("save_copy");
    expect(copy.deviceId).toBe(REPLACED_MAIN_COPY_ID);
    expect(copy.deviceId).toMatch(/^[a-z0-9-]{8,64}$/);
    expect(copy.save.state.gold).toBe(50);
    const main = JSON.parse(fetch.mock.calls[2][1].body);
    expect(main.action).toBe("save");
    expect(main.revision).toBe(4);
    expect(main.save.state.gold).toBe(25);
    expect(result).toMatchObject({ kind: "KEEP_LOCAL", meta: { revision: 4, syncConflict: false } });
  });
  it("他の端末が保存していなければ、読むだけで何も書かない", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(latest(save(10), 2, "2026-09-01"));
    vi.stubGlobal("fetch", fetch);
    const result = await syncOnOpen(meta(), save(20), null, () => save(20));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("UP_TO_DATE");
    expect(result.meta.revision).toBe(2);
  });
});

describe("画面側のつなぎ", () => {
  const source = readFileSync(new URL("../src/web/cloudRecoveryBootstrap.ts", import.meta.url), "utf8");
  it("起動時と復帰時にクラウドを見に行く", () => {
    expect(source).toMatch(/void syncOpen\(true\)/);
    expect(source).toMatch(/visibilityState === "hidden"[\s\S]{0,120}syncOpen\(false\)/);
  });
  it("起動直後は、このページが書く前の姿で判断する(ログインボーナスを遊んだと数えない)", () => {
    expect(source).toMatch(/startupSaveSnapshot\(\)/);
  });
  it("合わせた後の読み直しで、古いデータが書き戻されないようにする", () => {
    const guard = readFileSync(new URL("../src/web/cloudRestoreNavigationGuard.ts", import.meta.url), "utf8");
    const key = /const PENDING_RESTORE_KEY = "([^"]+)"/;
    expect(source.match(key)?.[1]).toBe(guard.match(key)?.[1]);
  });
  it("端末のセーブを書くたびに、書いた時刻を残す", () => {
    const player = readFileSync(new URL("../src/game/playerState.ts", import.meta.url), "utf8");
    expect(player).toMatch(/setItem\(STORAGE_KEY, json\);\s*\n\s*try \{ localStorage\.setItem\(SAVE_TOUCHED_AT_KEY/);
  });
});
