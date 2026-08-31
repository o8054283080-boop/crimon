import type { ContinuousMesh, MeshTriangle, MeshVertex, Point } from "./mesh.js";

function affine(source:[Point,Point,Point],target:[Point,Point,Point]){
  const [s0,s1,s2]=source,[d0,d1,d2]=target;
  const det=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
  if(Math.abs(det)<.0001)return null;
  const solve=(v0:number,v1:number,v2:number)=>({
    x:(v0*(s1.y-s2.y)+v1*(s2.y-s0.y)+v2*(s0.y-s1.y))/det,
    y:(v0*(s2.x-s1.x)+v1*(s0.x-s2.x)+v2*(s1.x-s0.x))/det,
    z:(v0*(s1.x*s2.y-s2.x*s1.y)+v1*(s2.x*s0.y-s0.x*s2.y)+v2*(s0.x*s1.y-s1.x*s0.y))/det,
  });
  const x=solve(d0.x,d1.x,d2.x),y=solve(d0.y,d1.y,d2.y);return {a:x.x,b:y.x,c:x.y,d:y.y,e:x.z,f:y.z};
}

export class MeshDeformationEngine{
  draw(context:CanvasRenderingContext2D,image:CanvasImageSource,mesh:ContinuousMesh,deformed:MeshVertex[],scale:number,offset:Point){
    for(const triangle of mesh.triangles)this.drawTriangle(context,image,mesh.vertices,deformed,triangle,scale,offset);
  }
  private drawTriangle(ctx:CanvasRenderingContext2D,image:CanvasImageSource,source:MeshVertex[],target:MeshVertex[],triangle:MeshTriangle,scale:number,offset:Point){
    const ids=[triangle.a,triangle.b,triangle.c] as const;
    const s:[Point,Point,Point]=[source[ids[0]],source[ids[1]],source[ids[2]]];
    // 0.45px外側へクリップを広げ、補間時の細い継ぎ目を隠す。
    const center={x:ids.reduce((n,i)=>n+(offset.x+target[i].x*scale),0)/3,y:ids.reduce((n,i)=>n+(offset.y+target[i].y*scale),0)/3};
    const d=ids.map(i=>{const x=offset.x+target[i].x*scale,y=offset.y+target[i].y*scale,len=Math.hypot(x-center.x,y-center.y)||1;return{x:x+(x-center.x)/len*.45,y:y+(y-center.y)/len*.45};}) as [Point,Point,Point];
    const targetTriangle:[Point,Point,Point]=ids.map(i=>({x:offset.x+target[i].x*scale,y:offset.y+target[i].y*scale})) as [Point,Point,Point];
    const matrix=affine(s,targetTriangle);if(!matrix)return;
    ctx.save();ctx.beginPath();ctx.moveTo(d[0].x,d[0].y);ctx.lineTo(d[1].x,d[1].y);ctx.lineTo(d[2].x,d[2].y);ctx.closePath();ctx.clip();ctx.transform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f);ctx.drawImage(image,0,0);ctx.restore();
  }
}
