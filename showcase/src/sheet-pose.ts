import {frameSize,ribbonSpec,surfacePoint} from './ribbon-model';

export type SheetPose={left:number;top:number;width:number;height:number;corner:number;strength:number;activity:number;bend:number;shade:number;white:number;kind:'ribbon'|'rail'|'sheet'|'bar';rotation?:[number,number,number,number];dent?:number};
export type SheetFrame=ReturnType<typeof frameSize>&{width:number;height:number};
export function flatSheet(rect:{left:number;top:number;width:number;height:number},corner:number):SheetPose{return{left:rect.left,top:rect.top,width:rect.width,height:rect.height,corner,strength:0,activity:0,bend:0,shade:0,white:1,kind:'sheet'};}
function rotationBetween(a:[number,number,number,number],b:[number,number,number,number],t:number):[number,number,number,number]{
  let dot=a.reduce((sum,n,i)=>sum+n*b[i],0),sign=dot<0?-1:1;dot=Math.min(1,Math.abs(dot));
  const angle=Math.acos(dot),sine=Math.sin(angle),wa=sine<.00001?1-t:Math.sin((1-t)*angle)/sine,wb=(sine<.00001?t:Math.sin(t*angle)/sine)*sign;
  return a.map((value,i)=>value*wa+b[i]*wb) as [number,number,number,number];
}
export function blendSheet(a:SheetPose,b:SheetPose,t:number):SheetPose{
  const result={...a,rotation:rotationBetween(a.rotation??[0,0,0,1],b.rotation??[0,0,0,1],t)};
  for(const key of ['left','top','width','height','corner','strength','activity','bend','shade'] as const)result[key]=a[key]+(b[key]-a[key])*t;
  result.dent=(a.dent??0)+((b.dent??0)-(a.dent??0))*t;
  result.white=a.white+(b.white-a.white)*Math.min(1,t*1.08);if(t===1)result.kind=b.kind;return result;
}
export function sheetWorldPoint(pose:SheetPose,u:number,v:number,frame:SheetFrame){
  let x=(u-.5)*pose.width*frame.unit,y=(.5-v)*pose.height*frame.unit,z=0;
  if(pose.rotation){const [qx,qy,qz,qw]=pose.rotation,tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);x+=qw*tx+qy*tz-qz*ty;y+=qw*ty+qz*tx-qx*tz;z+=qw*tz+qx*ty-qy*tx;}
  x+=(pose.left+pose.width/2-frame.width/2)*frame.unit;y+=(frame.height/2-pose.top-pose.height/2)*frame.unit;
  const p=surfacePoint(x,y,frame.halfWidth,pose.activity,pose.strength);p.z+=z;
  const normalized=Math.max(-1,Math.min(1,p.y/frame.halfHeight));p.z+=pose.bend*(1-normalized*normalized);
  p.z-=(pose.dent??0)*.1*pose.height*frame.unit*(1-(u*2-1)**2)*(1-(v*2-1)**2);return p;
}
export function sheetScreenPoint(pose:SheetPose,u:number,v:number,frame:SheetFrame){const p=sheetWorldPoint(pose,u,v,frame),scale=ribbonSpec.cameraDistance/(ribbonSpec.cameraDistance-p.z);return{x:frame.width/2+p.x/frame.unit*scale,y:frame.height/2-p.y/frame.unit*scale};}
