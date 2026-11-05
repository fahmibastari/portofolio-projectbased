import { revealProgress,flightProgress } from "./motion-curve";
import {frameSize} from './ribbon-model';
import {blendSheet,flatSheet,sheetScreenPoint,type SheetPose} from './sheet-pose';
const flights=new WeakMap<HTMLElement,{animation:Animation;from:SheetPose;to:SheetPose;duration:number;complete:boolean;intro:boolean}>();
export type OutlinePoint = { x:number; y:number };
export function relatedBounds(direction:number){
  const unit=Math.min(2,Math.max(.5,innerWidth/(innerWidth<650?390:1500))),edge=100*unit,gap=(innerWidth<650?90:75)*unit;
  const width=Math.max(0,innerWidth-edge*2),height=Math.max(0,innerHeight-edge*2);
  return {x:edge+direction*(width+gap),y:edge,width,height,radius:(innerWidth<650?15:20)*unit};
}
export function roundedOutline(width:number,height:number,radius:number):OutlinePoint[]{
  const points:OutlinePoint[]=[];const r=Math.min(radius,width/2,height/2);
  const line=(x0:number,y0:number,x1:number,y1:number,count:number)=>{for(let i=0;i<count;i++)points.push({x:x0+(x1-x0)*i/count,y:y0+(y1-y0)*i/count});};
  const arc=(x:number,y:number,start:number)=>{for(let i=0;i<8;i++){const angle=start+i/8*Math.PI/2;points.push({x:x+Math.cos(angle)*r,y:y+Math.sin(angle)*r});}};
  line(r,0,width-r,0,32);arc(width-r,r,-Math.PI/2);
  line(width,r,width,height-r,12);arc(width-r,height-r,0);
  line(width-r,height,r,height,32);arc(r,height-r,Math.PI/2);
  line(0,height-r,0,r,12);arc(r,r,Math.PI);
  return points;
}

export function captureProjectShape(dialog:HTMLElement){
  const style=getComputedStyle(dialog),bounds=dialog.getBoundingClientRect();
  const transform=new DOMMatrix(style.transform==='none'?undefined:style.transform);
  const points=style.clipPath.startsWith('polygon')?[...style.clipPath.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px/g)].map(match=>({x:Number(match[1])*transform.a+bounds.left,y:Number(match[2])*transform.d+bounds.top})):null;
  const color=style.backgroundColor.match(/[\d.]+/g)?.map(Number)??[255,255,255,1];
  const flight=flights.get(dialog),pose=flight?blendSheet(flight.from,flight.to,flight.complete?1:(flight.intro?flightProgress:revealProgress)(Math.min(1,Number(flight.animation.currentTime??0)/flight.duration))):flatSheet(bounds,parseFloat(style.borderTopLeftRadius)*Math.abs(transform.a));
  return {outline:points?.length===120?points:roundedOutline(bounds.width,bounds.height,parseFloat(style.borderTopLeftRadius)*Math.abs(transform.a)).map(point=>({x:point.x+bounds.left,y:point.y+bounds.top})),alpha:color[3]??1,pose};
}
export function morphProject(dialog:HTMLElement,source:OutlinePoint[],closing=false,start?:ReturnType<typeof captureProjectShape>,geometry?:{from:SheetPose;to:SheetPose;duration?:number;intro?:boolean;started?:number}){
  const bounds=dialog.getBoundingClientRect();
  const radius=parseFloat(getComputedStyle(dialog).borderTopLeftRadius);
  const target=roundedOutline(bounds.width,bounds.height,radius).map(p=>({x:p.x+bounds.left,y:p.y+bounds.top}));
  if(source.length!==target.length)throw new Error('Project outline point count differs');
  const frame={...frameSize(innerWidth,innerHeight),width:innerWidth,height:innerHeight};
  const frames=Array.from({length:61},(_,i)=>{
    const t=i/60,p=(geometry?.intro?flightProgress:revealProgress)(t),amount=closing?1-p:p;
    const begin=closing?(start?.outline??target):source,end=closing?source:target;
    const pose=geometry?blendSheet(geometry.from,geometry.to,p):null;
    const shape=pose?roundedOutline(pose.width,pose.height,pose.corner).map(point=>sheetScreenPoint(pose,point.x/pose.width,point.y/pose.height,frame)).map(point=>`${(point.x-bounds.left).toFixed(2)}px ${(point.y-bounds.top).toFixed(2)}px`).join(','):begin.map((point,index)=>`${(point.x+(end[index].x-point.x)*p-bounds.left).toFixed(2)}px ${(point.y+(end[index].y-point.y)*p-bounds.top).toFixed(2)}px`).join(',');
    const alpha=closing?(start?.alpha??1)*(1-p):Math.min(1,amount*1.08);
    return {clipPath:`polygon(${shape})`,backgroundColor:`rgba(255,255,255,${alpha})`,offset:t};
  });
  const duration=geometry?.duration??1000,animation=dialog.animate(frames,{duration,easing:'linear',fill:'both'});
  if(geometry?.started!==undefined)animation.startTime=geometry.started;
  if(geometry){flights.set(dialog,{animation,from:geometry.from,to:geometry.to,duration,complete:false,intro:!!geometry.intro});dialog.dataset.flight='true';}
  else flights.delete(dialog);
  animation.finished.then(()=>{const record=flights.get(dialog);if(record?.animation===animation){record.complete=true;delete dialog.dataset.flight;}if(!closing)animation.cancel();}).catch(()=>{if(flights.get(dialog)?.animation===animation)delete dialog.dataset.flight;});
  return animation;
}

export function preserveProjectSheet(dialog:HTMLDialogElement){
  document.querySelectorAll('.outgoing-project-sheet').forEach(element=>element.remove());
  const sheet=document.createElement('div'),bounds=dialog.getBoundingClientRect();sheet.className='outgoing-project-sheet';sheet.inert=true;sheet.setAttribute('aria-hidden','true');
  Object.assign(sheet.style,{position:'fixed',left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,background:'#fff',borderRadius:getComputedStyle(dialog).borderRadius,overflow:'hidden',zIndex:'20',pointerEvents:'none'});
  sheet.style.clipPath=getComputedStyle(dialog).clipPath;
  const content=dialog.querySelector('.project-layout')!.cloneNode(true) as HTMLElement;
  content.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));content.querySelectorAll('[data-rendered]').forEach(element=>element.removeAttribute('data-rendered'));sheet.append(content);document.body.append(sheet);return sheet;
}
export function neighborProject(dialog:HTMLDialogElement,outgoing:HTMLElement,direction:number){
  flights.delete(dialog);delete dialog.dataset.flight;
  const entry=relatedBounds(direction),exit=relatedBounds(-direction),bounds=dialog.getBoundingClientRect();
  dialog.classList.add('is-neighbor-flight');
  const radius=parseFloat(getComputedStyle(dialog).borderTopLeftRadius);
  const frames=(from:{x:number;y:number;width:number;height:number},to:{x:number;y:number;width:number;height:number},base:DOMRect)=>Array.from({length:61},(_,i)=>{const p=revealProgress(i/60),x=from.x+(to.x-from.x)*p,y=from.y+(to.y-from.y)*p,w=from.width+(to.width-from.width)*p,h=from.height+(to.height-from.height)*p;return{transform:`translate(${x-base.x}px,${y-base.y}px) scale(${w/base.width},${h/base.height})`,borderRadius:`${radius*base.width/w}px / ${radius*base.height/h}px`,offset:i/60};});
  dialog.style.transformOrigin='0 0';outgoing.style.transformOrigin='0 0';outgoing.style.clipPath='';
  const incoming=dialog.animate(frames(entry,bounds,bounds),{duration:1000,easing:'linear',fill:'both'});
  const animation=outgoing.animate(frames(outgoing.getBoundingClientRect(),exit,outgoing.getBoundingClientRect()),{duration:1000,easing:'linear',fill:'both'});
  outgoing.firstElementChild?.animate([{opacity:1},{opacity:0}],{duration:250,fill:'forwards'});
  animation.finished.then(()=>outgoing.remove()).catch(()=>outgoing.remove());
  incoming.finished.then(()=>{incoming.cancel();dialog.classList.remove('is-neighbor-flight');}).catch(()=>dialog.classList.remove('is-neighbor-flight'));
}

type TitleGeometry={card:SheetPose;sheet:SheetPose;caption:{u:number;v:number;fontSize:number}};
/** Maps the native title plane to four projected world points, retaining perspective. */
function titleMatrix(points:OutlinePoint[],width:number,height:number){
  const [p0,p1,p2,p3]=points,dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y;
  const determinant=dx1*dy2-dx2*dy1;
  const g=Math.abs(determinant)<.000001?0:(dx3*dy2-dx2*dy3)/determinant,h=Math.abs(determinant)<.000001?0:(dx1*dy3-dx3*dy1)/determinant;
  return `matrix3d(${[(p1.x-p0.x+g*p1.x)/width,(p1.y-p0.y+g*p1.y)/width,0,g/width,(p3.x-p0.x+h*p3.x)/height,(p3.y-p0.y+h*p3.y)/height,0,h/height,0,0,1,0,p0.x,p0.y,0,1].join(',')})`;
}
export function flyProjectTitle(title:HTMLElement,from:DOMRect|{left:number;top:number;width:number;height:number;fontSize?:number},closing=false,start?:{transform:string;color:string},geometry?:TitleGeometry,started?:number){
  const target=title.getBoundingClientRect();
  const dx=from.left-target.left,dy=from.top-target.top;
  const scale=Math.min(1,'fontSize' in from&&from.fontSize?from.fontSize/parseFloat(getComputedStyle(title).fontSize):from.height/target.height);
  const frames=Array.from({length:61},(_,i)=>{
    const p=revealProgress(i/60),amount=closing?p:1-p;
    if(geometry){
      const {card,sheet,caption}=geometry,progress=closing?1-p:p,pose=blendSheet(card,sheet,progress);
      const sheetU=(target.left-sheet.left)/sheet.width,sheetV=(target.top-sheet.top)/sheet.height;
      const u=caption.u+(sheetU-caption.u)*progress,v=caption.v+(sheetV-caption.v)*progress;
      const targetFont=parseFloat(getComputedStyle(title).fontSize),font=caption.fontSize+(targetFont-caption.fontSize)*progress;
      const w=target.width*font/targetFont/pose.width,h=target.height*font/targetFont/pose.height;
      const frame={...frameSize(innerWidth,innerHeight),width:innerWidth,height:innerHeight};
      const points=[[u,v],[u+w,v],[u+w,v+h],[u,v+h]].map(([x,y])=>sheetScreenPoint(pose,x,y,frame)).map(point=>({x:point.x-target.left,y:point.y-target.top}));
      return {transform:titleMatrix(points,target.width,target.height),color:`rgb(${255*(1-progress)},${255*(1-progress)},${255*(1-progress)})`,offset:i/60};
    }
    if(closing&&start){
      const matrix=new DOMMatrix(start.transform==='none'?undefined:start.transform),color=Number(start.color.match(/[\d.]+/)?.[0]??0);
      const values=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f],end=[scale,0,0,scale,dx,dy];
      const gray=color+(255-color)*p;
      return {transform:`matrix(${values.map((value,index)=>value+(end[index]-value)*p).join(',')})`,color:`rgb(${gray},${gray},${gray})`,offset:i/60};
    }
    return {transform:`translate(${dx*amount}px,${dy*amount}px) scale(${1+(scale-1)*amount})`,color:`rgb(${255*amount},${255*amount},${255*amount})`,offset:i/60};
  });
  title.style.transformOrigin='0 0';
  const animation=title.animate(frames,{duration:1000,easing:'linear',fill:'both'});if(started!==undefined)animation.startTime=started;return animation;
}
