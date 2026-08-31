import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPngSequenceZip } from "../src/web/motion-lab/export.js";
import { estimateRig, resolvePose } from "../src/web/motion-lab/rig.js";
import type { MotionGenerationResult } from "../src/web/motion-lab/types.js";

const transparentPng = new Blob([Uint8Array.of(137, 80, 78, 71)], { type: "image/png" });

describe("CRIMON Motion Lab のローカル自動リグ", () => {
  it("透明シルエットから境界・重心・頭胴四肢の制御領域を推定する", () => {
    const pixels=new Uint8ClampedArray(10*12*4);
    for(let y=2;y<11;y++) for(let x=2;x<8;x++) pixels[(y*10+x)*4+3]=255;
    const rig=estimateRig(pixels,10,12,"dragon");
    expect(rig.bounds).toEqual({x:2,y:2,width:6,height:9});
    expect(rig.regions.map(r=>r.name)).toEqual(["torso","head","lower","left","right","tail"]);
    expect(rig.center.x).toBeCloseTo(4.5); expect(rig.alphaCoverage).toBeGreaterThan(0);
  });

  it("空の透明画像を拒否する",()=>expect(()=>estimateRig(new Uint8ClampedArray(16),2,2,"slime")).toThrow("透明部分だけ"));

  it.each(["idle","attack","heal","hit","buff","debuff"] as const)("%s にパーツ別の局所変形を割り当てる",motion=>{
    const head=resolvePose(motion,"humanoid",4,12,"head"); const arm=resolvePose(motion,"humanoid",4,12,"left");
    expect(head).not.toEqual(arm); expect([head.rotation,head.warpX,head.warpY].some(v=>v!==0)).toBe(true);
  });

  it("体型ごとに振幅を変え、heavyを控えめにする",()=>{
    const slime=resolvePose("idle","slime",3,12,"left");const heavy=resolvePose("idle","heavy",3,12,"left");
    expect(Math.abs(slime.x)).toBeGreaterThan(Math.abs(heavy.x));
  });

  it("主経路に外部APIやキー入力を残さない",()=>{
    const main=readFileSync(new URL("../src/web/motion-lab/main.ts",import.meta.url),"utf8");
    expect(main).toContain("AutoRigMotionProvider");
    expect(main).not.toMatch(/ExternalAI|OpenAI|type=\"password\"|apiKey/);
  });

  it("PNG連番を無圧縮ZIPへまとめる", async () => {
    const result:MotionGenerationResult={frames:[{blob:transparentPng,url:"blob:1",index:0},{blob:transparentPng,url:"blob:2",index:1}],loop:true,width:384,height:384,provider:"local"};
    const zip=await createPngSequenceZip(result,"slime_idle_2f_384");const bytes=new Uint8Array(await zip.arrayBuffer());
    expect(zip.type).toBe("application/zip");expect(Array.from(bytes.slice(0,4))).toEqual([0x50,0x4b,0x03,0x04]);expect(new TextDecoder().decode(bytes)).toContain("slime_idle_2f_384_001.png");
  });
});
