import type { CharacterType, MotionType } from "./types.js";

export interface Point { x:number; y:number }
export interface MeshVertex extends Point { sourceX:number; sourceY:number; faceProtection:number }
export interface MeshTriangle { a:number; b:number; c:number }
export type HandleName="root"|"chest"|"head"|"left"|"right"|"tail";
export interface MeshHandle extends Point { name:HandleName; radius:number; strength:number }
export interface ContinuousMesh { vertices:MeshVertex[]; triangles:MeshTriangle[]; handles:MeshHandle[]; columns:number; rows:number }
export interface Silhouette { bounds:{x:number;y:number;width:number;height:number}; center:Point; coverage:number; rowEdges:Array<{left:number;right:number}> }
export interface FrameBounds { x:number;y:number;width:number;height:number; clipped:boolean }

export function extractSilhouette(pixels:Uint8ClampedArray,width:number,height:number):Silhouette {
  let minX=width,minY=height,maxX=-1,maxY=-1,sumX=0,sumY=0,count=0;
  const rowEdges=Array.from({length:height},()=>({left:width,right:-1}));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>12){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sumX+=x;sumY+=y;count++;rowEdges[y].left=Math.min(rowEdges[y].left,x);rowEdges[y].right=Math.max(rowEdges[y].right,x);}
  if(!count)throw new Error("透明部分だけの画像は使用できません。");
  return {bounds:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},center:{x:sumX/count,y:sumY/count},coverage:count/(width*height),rowEdges};
}

export function placeHandles(s:Silhouette,type:CharacterType):MeshHandle[]{
  const {x,y,width:w,height:h}=s.bounds, at=(name:HandleName,nx:number,ny:number,r=.45,strength=1):MeshHandle=>({name,x:x+w*nx,y:y+h*ny,radius:Math.max(w,h)*r,strength});
  const base=[at("root",.5,.78,.55,.8),at("chest",.5,.48,.48,1),at("head",.5,.2,.32,.58),at("left",.14,.5,.36,.75),at("right",.86,.5,.36,.75)];
  if(type==="quadruped")return [at("root",.48,.7),at("chest",.35,.48),at("head",.16,.3,.3,.65),at("left",.28,.82,.3),at("right",.7,.82,.3),at("tail",.88,.45,.38,.85)];
  if(type==="dragon")return [...base,at("tail",.86,.65,.42,.8)];
  if(type==="floating")return [...base,at("tail",.68,.72,.42,.7)];
  return base;
}

export function generateMesh(s:Silhouette,type:CharacterType,columns=12,rows=14):ContinuousMesh{
  const b=s.bounds, vertices:MeshVertex[]=[],triangles:MeshTriangle[]=[];
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
    const x=b.x+b.width*col/columns,y=b.y+b.height*row/rows;
    const faceDx=(x-(b.x+b.width*.5))/(b.width*.28),faceDy=(y-(b.y+b.height*.2))/(b.height*.2);
    vertices.push({x,y,sourceX:x,sourceY:y,faceProtection:Math.exp(-(faceDx*faceDx+faceDy*faceDy)*1.7)});
  }
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const a=row*(columns+1)+col,b0=a+1,c=a+columns+1,d=c+1;if((row+col)%2)triangles.push({a,b:b0,c},{a:b0,b:d,c});else triangles.push({a,b:b0,c:d},{a,b:d,c});}
  return {vertices,triangles,handles:placeHandles(s,type),columns,rows};
}

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
function motionDrive(motion:MotionType,t:number){
  const pulse=Math.sin(Math.PI*t),loop=Math.sin(Math.PI*2*t),late=Math.sin(Math.PI*2*t-.65);
  if(motion==="attack"){const d=t<.28?-Math.sin(t/.28*Math.PI/2):t<.5?-1+2*Math.sin((t-.28)/.22*Math.PI/2):Math.cos((t-.5)/.5*Math.PI/2);return {main:d,late:d*(1-t*.35),lift:-Math.max(0,d)*.35,impact:Math.exp(-Math.pow((t-.5)/.07,2))};}
  if(motion==="hit")return {main:-Math.sin(Math.min(1,t*2.5)*Math.PI)*(1-t),late:-pulse*(1-t),lift:pulse*.15,impact:pulse*(1-t)};
  if(motion==="heal"||motion==="buff")return {main:pulse,late:Math.sin(Math.PI*clamp(t-.08,0,1)),lift:-pulse*.45,impact:0};
  if(motion==="debuff"||motion==="defeat")return {main:loop*(1-t*.25),late:late*(1-t*.2),lift:pulse*.35,impact:0};
  if(motion==="defend")return {main:pulse*.5,late:pulse*.35,lift:pulse*.2,impact:0};
  if(motion==="victory"||motion==="skill")return {main:pulse,late:Math.sin(Math.PI*clamp(t-.06,0,1)),lift:-pulse*.55,impact:0};
  return {main:loop*.58+Math.sin(Math.PI*4*t)*.1,late:late*.55,lift:-Math.max(0,Math.sin(Math.PI*2*t))*.08,impact:0};
}

export function deformMesh(mesh:ContinuousMesh,motion:MotionType,type:CharacterType,index:number,total:number,intensity=1):MeshVertex[]{
  const t=total<=1?0:index/(total-1),d=motionDrive(motion,t),amp={slime:1.25,humanoid:.92,quadruped:.85,floating:1.08,heavy:.48,dragon:.7}[type]*intensity;
  const handleMoves=new Map<HandleName,Point>();
  for(const h of mesh.handles){let x=d.main*(h.name==="left"?-1:h.name==="right"?1:.22),y=d.lift+(h.name==="head"?d.late*-.18:h.name==="tail"?d.late*.16:d.main*.04);if(type==="slime"){x+=(h.name==="left"?-d.late:h.name==="right"?d.late:0)*.55;y+=(h.name==="root"?Math.abs(d.main)*.3:-Math.abs(d.main)*.13);}if(type==="floating")x+=d.late*.28;if(type==="quadruped"||type==="dragon")x+=(h.name==="tail"?d.late*.75:h.name==="head"?-d.main*.18:0);handleMoves.set(h.name,{x:x*meshSize(mesh)*.045*amp,y:y*meshSize(mesh)*.045*amp});}
  let out=mesh.vertices.map(v=>{let dx=0,dy=0,sum=0;for(const h of mesh.handles){const distance=Math.hypot(v.x-h.x,v.y-h.y),w=Math.exp(-2.4*Math.pow(distance/h.radius,2))*h.strength;const move=handleMoves.get(h.name)!;dx+=move.x*w;dy+=move.y*w;sum+=w;}const protect=1-v.faceProtection*.68;return {...v,x:v.sourceX+dx/Math.max(1,sum)*protect,y:v.sourceY+dy/Math.max(1,sum)*protect};});
  // 近傍平均との差を弱く戻すことで、強い動きでも三角形の折れや裂けを抑える。
  for(let pass=0;pass<2;pass++){const next=out.map(v=>({...v}));for(let r=1;r<mesh.rows;r++)for(let c=1;c<mesh.columns;c++){const i=r*(mesh.columns+1)+c,n=[out[i-1],out[i+1],out[i-mesh.columns-1],out[i+mesh.columns+1]];const ax=n.reduce((s,v)=>s+v.x,0)/4,ay=n.reduce((s,v)=>s+v.y,0)/4;next[i].x=out[i].x*.82+ax*.18;next[i].y=out[i].y*.82+ay*.18;}out=next;}
  return out;
}
function meshSize(mesh:ContinuousMesh){const xs=mesh.vertices.map(v=>v.sourceX),ys=mesh.vertices.map(v=>v.sourceY);return Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));}
export function analyzeFrameBounds(vertices:MeshVertex[],canvasWidth:number,canvasHeight:number,margin:number):FrameBounds{const xs=vertices.map(v=>v.x),ys=vertices.map(v=>v.y),x=Math.min(...xs),y=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);return{x,y,width:maxX-x,height:maxY-y,clipped:x<margin||y<margin||maxX>canvasWidth-margin||maxY>canvasHeight-margin};}
