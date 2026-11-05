import {frameSize} from './ribbon-model';
import {roundedOutline,relatedBounds} from './project-transition';
type Rect={x:number;y:number;width:number;height:number};
export type ScrubFrame={previous:Rect;next:Rect;mainAlpha:number;previousAlpha:number;nextAlpha:number;bow:number;amount:number};

/** Horizontal intent previews the neighboring sheet; vertical intent stays with media scroll. */
export class DetailScrub {
  private abort=new AbortController();private tracking=false;private held=false;private x=0;private y=0;
  private position=0;private target=0;private bow=0;private bounds?:DOMRect;private prev?:ReturnType<typeof relatedBounds>;private next?:ReturnType<typeof relatedBounds>;
  private ghost?:HTMLElement;private layout:HTMLElement;
  private releaseAt=0;private releaseFrom=0;
  private gpu=false;
  renderFrame:ScrubFrame|undefined;
  constructor(private dialog:HTMLDialogElement,private wake:()=>void,private begin:()=>boolean|null,private end:()=>void){
    this.layout=dialog.querySelector('.project-layout')!;const signal=this.abort.signal;
    dialog.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary||(event.target as HTMLElement).closest('a,button,input'))return;this.tracking=true;this.x=event.clientX;this.y=event.clientY;},{signal});
    dialog.addEventListener('pointermove',event=>{
      if(!this.tracking)return;const dx=event.clientX-this.x,dy=event.clientY-this.y;
      if(!this.held){if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){this.tracking=false;return;}if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy))return;
        const mode=this.begin();if(mode===null){this.tracking=false;return;}
        this.held=true;this.releaseAt=0;this.gpu=mode;this.bounds??=dialog.getBoundingClientRect();this.prev=relatedBounds(-1);this.next=relatedBounds(1);dialog.classList.add('is-scrubbing','is-dragging');if(!this.ghost){this.ghost=document.createElement('div');this.ghost.className='scrub-neighbor-sheet';this.ghost.setAttribute('aria-hidden','true');this.ghost.hidden=this.gpu;document.body.append(this.ghost);}
      }
      event.preventDefault();const normalized=-dx/(innerWidth*.8);this.target=Math.max(-1,Math.min(1,.4*normalized/(1+.8*Math.abs(normalized))));this.wake();
      if(Math.abs(normalized)>.25){this.tracking=false;this.held=false;dialog.querySelector<HTMLButtonElement>(normalized>0?'#next-project':'#previous-project')?.click();}
    },{signal});
    const release=()=>{if(!this.tracking)return;this.tracking=false;this.held=false;this.dialog.classList.remove('is-dragging');this.target=0;this.releaseAt=performance.now();this.releaseFrom=this.position;this.wake();};
    dialog.addEventListener('pointerup',release,{signal});dialog.addEventListener('pointercancel',release,{signal});
    dialog.addEventListener('click',event=>{if(Math.abs(this.position)>.001&&!(event.target as HTMLElement).closest('a,button,input')){event.preventDefault();event.stopImmediatePropagation();}},{signal,capture:true});
  }
  get active(){return this.held||this.releaseAt>0||Math.abs(this.position)>.00001||Math.abs(this.bow)>.00001;}
  tick(dt:number){
    if(!this.bounds||!this.prev||!this.next||!this.ghost)return;
    const release=this.releaseAt?Math.min(1,(performance.now()-this.releaseAt)/600):0;
    if(this.releaseAt)this.position=release===1?0:this.releaseFrom*Math.pow(2,-10*release);else this.position+=(this.target-this.position)*Math.min(1,.11*dt*60);
    const frame=frameSize(innerWidth,innerHeight),amount=Math.min(1,Math.abs(this.position));
    const desired=-Math.pow(Math.tanh(amount*6),2)*.65*frame.halfHeight;this.bow+=(desired-this.bow)*Math.min(1,.25*dt*60);
    const next=this.position>=0,exit=next?this.prev:this.next,entry=next?this.next:this.prev;
    const blend=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>({x:a.x+(b.x-a.x)*amount,y:a.y+(b.y-a.y)*amount,width:a.width+(b.width-a.width)*amount,height:a.height+(b.height-a.height)*amount});
    const current=blend(this.bounds,exit),incoming=blend(entry,this.bounds),radius=innerWidth<650?15*innerWidth/390:20*innerWidth/1500;
    const shape=(rect:{x:number;y:number;width:number;height:number},offsetX:number,offsetY:number,sx=1,sy=1)=>roundedOutline(rect.width,rect.height,radius).map(point=>{
      const x=(rect.x+point.x-innerWidth/2)*frame.unit,y=(innerHeight/2-rect.y-point.y)*frame.unit,ny=Math.max(-1,Math.min(1,y/frame.halfHeight)),z=this.bow*(1-ny*ny),projection=41.18/(41.18-z);
      return `${(innerWidth/2+x/frame.unit*projection-offsetX)/sx}px ${(innerHeight/2-y/frame.unit*projection-offsetY)/sy}px`;
    }).join(',');
    this.dialog.style.clipPath=this.gpu?'':`polygon(${shape(current,current.x,current.y,current.width/this.bounds.width,current.height/this.bounds.height)})`;
    this.dialog.style.transformOrigin='0 0';this.dialog.style.transform=`translate(${current.x-this.bounds.x}px,${current.y-this.bounds.y}px) scale(${current.width/this.bounds.width},${current.height/this.bounds.height})`;this.layout.style.opacity=String(1-amount);
    this.ghost.style.clipPath=`polygon(${shape(incoming,0,0)})`;this.ghost.style.opacity=String(.3+.7*amount);
    if(this.gpu){
      const fixed={...(next?this.prev:this.next)};fixed.x=(fixed.x+fixed.width/2-innerWidth/2)*(1+amount)+innerWidth/2-fixed.width/2;
      this.renderFrame={previous:next?fixed:incoming,next:next?incoming:fixed,previousAlpha:next ? .3 : .3+.7*amount,nextAlpha:next ? .3+.7*amount : .3,mainAlpha:1-.7*amount,bow:this.bow,amount};
    }
    this.dialog.dataset.scrub=this.position.toFixed(5);
    if(!this.held&&release===1){this.reset();this.end();}
  }
  private reset(){this.ghost?.remove();this.ghost=undefined;this.bounds=undefined;this.releaseAt=0;this.renderFrame=undefined;this.position=this.target=this.bow=0;this.dialog.style.clipPath='';this.dialog.style.transform='';this.dialog.classList.remove('is-scrubbing');this.layout.style.opacity='';delete this.dialog.dataset.scrub;}
  dispose(){this.abort.abort();this.reset();}
}
