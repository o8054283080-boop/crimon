import { estimateRig, resolvePose, type RigRegion } from "./rig.js";
import type { MotionFrame, MotionGenerationRequest, MotionGenerationResult, MotionGeneratorProvider } from "./types.js";

export class AutoRigMotionProvider implements MotionGeneratorProvider {
  readonly name="ローカル自動リグ";
  async generate(request:MotionGenerationRequest):Promise<MotionGenerationResult>{
    if(request.signal?.aborted) throw new DOMException("中止", "AbortError");
    const bitmap=await createImageBitmap(request.image); const scan=document.createElement("canvas"); scan.width=bitmap.width;scan.height=bitmap.height;
    const scanCtx=scan.getContext("2d",{willReadFrequently:true}); if(!scanCtx){bitmap.close();throw new Error("画像を解析できないブラウザです。");}
    scanCtx.drawImage(bitmap,0,0); const rig=estimateRig(scanCtx.getImageData(0,0,bitmap.width,bitmap.height).data,bitmap.width,bitmap.height,request.characterType);
    const frames:MotionFrame[]=[];
    try{for(let i=0;i<request.frameCount;i++){if(request.signal?.aborted) throw new DOMException("中止", "AbortError"); const canvas=document.createElement("canvas");canvas.width=request.size;canvas.height=request.size;const ctx=canvas.getContext("2d");if(!ctx)throw new Error("フレームを描画できません。");
      const scale=Math.min(request.size/(rig.bounds.width*1.3),request.size/(rig.bounds.height*1.3)); const ox=request.size/2-rig.center.x*scale,oy=request.size/2-rig.center.y*scale;
      // 重なった領域をクリップして描くことで、頭・胴・四肢を独立した制御点で局所変形する。
      for(const region of rig.regions){this.drawRegion(ctx,bitmap,region,resolvePose(request.motion,request.characterType,i,request.frameCount,region.name),scale,ox,oy);}
      const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,"image/png"));if(!blob)throw new Error("PNGフレームを作成できません。");frames.push({blob,url:URL.createObjectURL(blob),index:i}); await new Promise<void>(r=>setTimeout(r,0));}
      bitmap.close();return{frames,loop:request.motion==="idle"||request.motion==="buff"||request.motion==="debuff",width:request.size,height:request.size,provider:this.name,rig};
    }catch(error){bitmap.close();frames.forEach(f=>URL.revokeObjectURL(f.url));if(error instanceof DOMException&&error.name==="AbortError")throw new Error("生成を中止しました。");throw error;}
  }
  private drawRegion(ctx:CanvasRenderingContext2D,image:ImageBitmap,r:RigRegion,p:ReturnType<typeof resolvePose>,s:number,ox:number,oy:number){const pad=2, sx=Math.max(0,r.x-pad),sy=Math.max(0,r.y-pad),sw=Math.min(image.width-sx,r.width+pad*2),sh=Math.min(image.height-sy,r.height+pad*2);ctx.save();ctx.translate(ox+(r.pivotX+p.x)*s,oy+(r.pivotY+p.y)*s);ctx.rotate(p.rotation);ctx.transform(p.scaleX,p.warpY/r.height,p.warpX/r.width,p.scaleY,0,0);ctx.globalAlpha=.92+.08*r.weight;ctx.drawImage(image,sx,sy,sw,sh,(sx-r.pivotX)*s,(sy-r.pivotY)*s,sw*s,sh*s);ctx.restore();}
}
