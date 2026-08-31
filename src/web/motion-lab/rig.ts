import type { CharacterType, MotionType } from "./types.js";

export type RigRegionName = "head" | "torso" | "lower" | "left" | "right" | "tail";
export interface RigRegion { name: RigRegionName; x: number; y: number; width: number; height: number; pivotX: number; pivotY: number; weight: number }
export interface AutoRig { bounds: { x: number; y: number; width: number; height: number }; center: { x: number; y: number }; regions: RigRegion[]; alphaCoverage: number }
export interface RegionPose { x: number; y: number; rotation: number; scaleX: number; scaleY: number; warpX: number; warpY: number }

export function estimateRig(pixels: Uint8ClampedArray, width: number, height: number, type: CharacterType): AutoRig {
  let minX=width,minY=height,maxX=-1,maxY=-1,sumX=0,sumY=0,count=0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++){ if(pixels[(y*width+x)*4+3]>12){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sumX+=x;sumY+=y;count++;} }
  if(!count) throw new Error("透明部分だけの画像は使用できません。");
  const w=maxX-minX+1,h=maxY-minY+1,cx=sumX/count,cy=sumY/count;
  const region=(name:RigRegionName,x:number,y:number,rw:number,rh:number,px=.5,py=.5,weight=1):RigRegion=>({name,x,y,width:rw,height:rh,pivotX:x+rw*px,pivotY:y+rh*py,weight});
  const regions:RigRegion[]=[region("torso",minX,minY+h*.27,w,h*.49,.5,.55,1),region("head",minX+w*.15,minY,w*.7,h*.36,.5,.72,.45),region("lower",minX+w*.08,minY+h*.68,w*.84,h*.32,.5,.18,.85),region("left",minX,minY+h*.25,w*.34,h*.56,.72,.35,.75),region("right",minX+w*.66,minY+h*.25,w*.34,h*.56,.28,.35,.75)];
  if(type==="quadruped"||type==="dragon"||type==="floating") regions.push(region("tail",minX+w*.58,minY+h*.35,w*.42,h*.5,.25,.4,.7));
  return {bounds:{x:minX,y:minY,width:w,height:h},center:{x:cx,y:cy},regions,alphaCoverage:count/(width*height)};
}

const ease=(t:number)=>.5-Math.cos(Math.PI*t)/2;
export function resolvePose(motion:MotionType,type:CharacterType,index:number,total:number,region:RigRegionName):RegionPose {
  const t=total<=1?0:index/(total-1), loop=Math.sin(t*Math.PI*2), delayed=Math.sin(t*Math.PI*2-(region==="head"?.35:region==="tail"?.8:.15));
  let drive=loop,lift=0,lean=0,squash=0;
  if(motion==="attack"){const wind=t<.3?-ease(t/.3):t<.58?ease((t-.3)/.28)*1.8-1:t<.82?1-ease((t-.58)/.24):0;drive=wind;lean=wind*.1;lift=-Math.abs(wind)*2;}
  if(motion==="heal"){drive=Math.sin(Math.PI*t);lift=-drive*7;lean=-drive*.025;}
  if(motion==="hit"){drive=Math.sin(Math.min(1,t*2.4)*Math.PI)*(1-t);lean=-drive*.16;squash=drive*.05;}
  if(motion==="buff"){drive=Math.sin(Math.PI*t);lift=-drive*5;lean=-drive*.05;}
  if(motion==="debuff"){drive=Math.sin(t*Math.PI*3)*(1-t*.35);lift=Math.sin(Math.PI*t)*5;lean=drive*.07;}
  if(motion==="defend"){drive=Math.sin(Math.PI*t);lift=drive*3;squash=drive*.04;}
  if(motion==="victory"||motion==="skill"){drive=Math.sin(Math.PI*t);lift=-drive*8;lean=drive*.08;}
  if(motion==="defeat"){drive=ease(t);lift=drive*8;lean=drive*.28;}
  const typeAmp={slime:1.25,humanoid:1,quadruped:.8,floating:1.15,heavy:.42,dragon:.65}[type];
  const partAmp={head:.65,torso:.35,lower:.22,left:1,right:1,tail:1.2}[region];
  const opposite=region==="left"?-1:region==="right"?1:1;
  const breathing=(motion==="idle"?loop:0)*typeAmp;
  return {x:(drive*opposite*5+delayed*partAmp*1.4)*typeAmp,y:lift+(region==="head"?delayed*1.8:breathing*partAmp),rotation:lean+delayed*partAmp*.035*typeAmp*opposite,scaleX:1+squash+(type==="slime"&&region!=="head"?breathing*.025:0),scaleY:1-squash-(type==="slime"&&region!=="head"?breathing*.02:0),warpX:delayed*partAmp*3*typeAmp,warpY:drive*partAmp*2*typeAmp};
}
