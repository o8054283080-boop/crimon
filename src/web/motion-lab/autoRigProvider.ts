import { MeshDeformationEngine } from "./deformation.js";
import { analyzeFrameBounds, deformMesh, extractSilhouette, generateMesh } from "./mesh.js";
import type { MotionFrame, MotionGenerationRequest, MotionGenerationResult, MotionGeneratorProvider } from "./types.js";

export class AutoRigMotionProvider implements MotionGeneratorProvider {
  readonly name="ローカル連続メッシュ";
  async generate(request:MotionGenerationRequest):Promise<MotionGenerationResult>{
    if(request.signal?.aborted) throw new DOMException("中止", "AbortError");
    const bitmap=await createImageBitmap(request.image); const scan=document.createElement("canvas"); scan.width=bitmap.width;scan.height=bitmap.height;
    const scanCtx=scan.getContext("2d",{willReadFrequently:true}); if(!scanCtx){bitmap.close();throw new Error("画像を解析できないブラウザです。");}
    scanCtx.drawImage(bitmap,0,0); const silhouette=extractSilhouette(scanCtx.getImageData(0,0,bitmap.width,bitmap.height).data,bitmap.width,bitmap.height);const mesh=generateMesh(silhouette,request.characterType);const engine=new MeshDeformationEngine();
    const frames:MotionFrame[]=[],bounds=[];const safetyMargin=Math.max(10,Math.round(request.size*.07));
    try{for(let i=0;i<request.frameCount;i++){if(request.signal?.aborted) throw new DOMException("中止", "AbortError"); const canvas=document.createElement("canvas");canvas.width=request.size;canvas.height=request.size;const ctx=canvas.getContext("2d");if(!ctx)throw new Error("フレームを描画できません。");
      const scale=Math.min((request.size-safetyMargin*2)/silhouette.bounds.width,(request.size-safetyMargin*2)/silhouette.bounds.height); const ox=request.size/2-silhouette.center.x*scale,oy=request.size/2-silhouette.center.y*scale;
      const deformed=deformMesh(mesh,request.motion,request.characterType,i,request.frameCount);const outputVertices=deformed.map(v=>({...v,x:ox+v.x*scale,y:oy+v.y*scale,sourceX:v.sourceX,sourceY:v.sourceY}));bounds.push(analyzeFrameBounds(outputVertices,request.size,request.size,2));engine.draw(ctx,bitmap,mesh,deformed,scale,{x:ox,y:oy});
      const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,"image/png"));if(!blob)throw new Error("PNGフレームを作成できません。");frames.push({blob,url:URL.createObjectURL(blob),index:i}); await new Promise<void>(r=>setTimeout(r,0));}
      bitmap.close();return{frames,loop:request.motion==="idle"||request.motion==="buff"||request.motion==="debuff",width:request.size,height:request.size,provider:this.name,mesh,bounds,safetyMargin,clippingPrevented:bounds.every(b=>!b.clipped)};
    }catch(error){bitmap.close();frames.forEach(f=>URL.revokeObjectURL(f.url));if(error instanceof DOMException&&error.name==="AbortError")throw new Error("生成を中止しました。");throw error;}
  }
}
