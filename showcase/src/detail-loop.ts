/** A continuous media strip. The story stays in place while image position and progress wrap. */
import { RibbonMotion } from "./ribbon-model";
import type {PortalSurface} from './portal';
import type {DetailSurface} from './detail-surface';
import {DetailScrub} from './detail-scrub';
export class DetailLoop {
  private abort = new AbortController();
  private observer: ResizeObserver;
  private frame = 0;
  private time = 0;
  private motion = new RibbonMotion();
  private get current(){return this.motion.position;}
  private set current(value:number){this.motion.position=value;}
  private get target(){return this.motion.target;}
  private set target(value:number){this.motion.target=value;}
  private length = 1;
  private touchY: number | null = null;
  private touchStartY=0;
  private touchStartX=0;
  private lastMove=0;
  private engaged=false;
  private touch=false;
  private finite=matchMedia('(hover:none),(pointer:coarse)').matches;
  private speed = 0;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private track: HTMLElement;
  private sequence: HTMLElement;
  private progress: SVGCircleElement;
  private tail:SVGCircleElement;
  private fraction:number|undefined;
  private lap:{direction:number;phase:number;old:number;time:number}|null=null;
  private surface?:DetailSurface;
  private surfaceTimer=0;
  private disposed=false;
  private surfaceEpoch=0;
  private scrub?:DetailScrub;

  constructor(private dialog: HTMLDialogElement,private renderer?:()=>PortalSurface,surfaceDelay=1450) {
    this.track = dialog.querySelector<HTMLElement>(".detail-track")!;
    this.sequence = this.track.firstElementChild as HTMLElement;
    this.sequence.querySelectorAll('img').forEach(image=>image.draggable=false);
    if(innerWidth<650){
      dialog.querySelector('.project-layout')!.classList.add('is-mobile-detail');
      this.sequence.prepend(dialog.querySelector('.project-story')!);
    }
    this.progress = dialog.querySelector<SVGCircleElement>(".progress-value")!;
    this.tail=this.progress.cloneNode() as SVGCircleElement;this.tail.setAttribute('class','progress-tail');this.tail.style.visibility='hidden';this.progress.parentNode!.appendChild(this.tail);
    for (let i = 0; i < 2; i++) {
      const clone = this.sequence.cloneNode(true) as HTMLElement;
      clone.setAttribute("aria-hidden", "true");
      clone.querySelectorAll("img").forEach((img) => {
        img.alt = "";
      });
      clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      clone.querySelectorAll<HTMLElement>('a,button,input').forEach(element=>element.tabIndex=-1);
      if(i===0)this.track.prepend(clone);else this.track.append(clone);
    }
    const signal = this.abort.signal;
    dialog.addEventListener('dragstart',event=>event.preventDefault(),{signal});
    this.observer = new ResizeObserver(() => this.measure());
    this.observer.observe(this.sequence);
    dialog.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) return;
        e.preventDefault();
        this.motion.wheel(
          e.deltaY *
          (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1), e.timeStamp);
        this.wake();
      },
      { passive: false, signal },
    );
    dialog.addEventListener(
      "keydown",
      (e) => {
        if (
          (e.target as HTMLElement).closest("input,textarea,select") ||
          (e.key === " " && (e.target as HTMLElement).closest("button,a"))
        )
          return;
        const delta =
          e.key === "ArrowDown"
            ? 100
            : e.key === "ArrowUp"
              ? -100
              : e.key === "PageDown" || e.key === " "
                ? innerHeight * 0.9
                : e.key === "PageUp"
                  ? -innerHeight * 0.9
                  : 0;
        if (delta) {
          e.preventDefault();
          this.motion.push(delta,Infinity);
          this.wake();
        }
        if (e.key === "Home") {
          e.preventDefault();
          this.motion.jump(0);
          this.wake();
        }
        if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();dialog.querySelector<HTMLButtonElement>(e.key==='ArrowRight'?'#next-project':'#previous-project')?.click();}
      },
      { signal },
    );
    dialog.addEventListener(
      "pointerdown",
      (e) => {
        if (
          e.button!==0 || !e.isPrimary ||
          (e.target as HTMLElement).closest("a,button,input")
        )
          return;
        this.touchY = e.clientY;
        this.touchStartY=e.clientY;this.engaged=false;this.touch=e.pointerType==='touch';this.lastMove=e.timeStamp;
        this.touchStartX=e.clientX;dialog.setPointerCapture(e.pointerId);
        this.speed = 0;
      },
      { signal },
    );
    dialog.addEventListener(
      "pointermove",
      (e) => {
        if (this.touchY === null) return;
        if(this.scrub?.active)return;
        if(!this.engaged){if(Math.abs(e.clientY-this.touchStartY)<=10||Math.abs(e.clientY-this.touchStartY)<=Math.abs(e.clientX-this.touchStartX))return;this.engaged=true;this.dialog.classList.add('is-dragging');this.touchY=e.clientY;this.lastMove=e.timeStamp;return;}
        e.preventDefault();
        const delta = this.touchY - e.clientY;
        this.speed = delta;
        this.motion.push(delta*(this.touch?3.25:1.5),Infinity);
        this.touchY = e.clientY;
        this.lastMove=e.timeStamp;
        this.wake();
      },
      { signal },
    );
    const release = (e:PointerEvent) => {
      if (this.touchY !== null&&this.engaged&&e.type!=='pointercancel'&&e.timeStamp-this.lastMove<100)this.motion.push(this.speed*(this.touch?35:18),Infinity);
      this.touchY = null;
      this.dialog.classList.remove('is-dragging');
      this.wake();
    };
    dialog.addEventListener("pointerup", release, { signal });
    dialog.addEventListener("pointercancel", release, { signal });
    this.measure();
    if(!this.reduced.matches)this.scrub=new DetailScrub(dialog,()=>this.wake(),()=>this.dialog.dataset.surface==='true'?true:this.renderer?null:false,()=>{if(!this.surface)this.startSurface(0);});
    this.startSurface(surfaceDelay);
  }
  private startSurface(delay:number){
    if(this.renderer&&!this.reduced.matches)this.surfaceTimer=window.setTimeout(async()=>{
      const epoch=this.surfaceEpoch;
      const {DetailSurface}=await import('./detail-surface');if(this.disposed||epoch!==this.surfaceEpoch)return;
      this.surface=new DetailSurface(this.dialog,this.renderer!(),()=>this.wake());await this.surface.ready;
    },delay);
  }
  private measure() {
    const previous = this.length;
    this.length = Math.max(1, this.sequence.getBoundingClientRect().height);
    this.motion.bounds=this.finite?[0,Math.max(0,this.length-this.dialog.querySelector<HTMLElement>('.project-media')!.clientHeight)]:null;
    const svg=this.progress.ownerSVGElement!,size=svg.getBoundingClientRect().width;
    if(size){svg.setAttribute('viewBox',`0 0 ${size} ${size}`);svg.querySelectorAll('circle').forEach(circle=>{circle.setAttribute('cx',String(size/2));circle.setAttribute('cy',String(size/2));circle.setAttribute('r',String(Math.max(0,(size-2)/2)));});}
    if (previous > 1) {
      this.target *= this.length / previous;
      this.current *= this.length / previous;
    }
    this.wake();
  }
  private wake() {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    this.frame = 0;
    const dt = Math.min((now - (this.time || now - 16)) / 1000, 0.05);
    this.time = now;
    this.motion.step(dt,Infinity,this.reduced.matches);
    // Periodic coordinates retain precision even after many revolutions.
    if (Math.abs(this.current) > this.length * 30) {
      const turns = Math.trunc(this.current / this.length) * this.length;
      this.current -= turns;
      this.target -= turns;
    }
    const phase = this.finite?this.current:((this.current % this.length) + this.length) % this.length;
    this.track.style.transform = `translate3d(0,${-this.length - phase}px,0)`;
    this.scrub?.tick(dt);
    this.surface?.render(this.target-this.current,this.scrub?.renderFrame);
    const fraction=phase/(this.finite?this.motion.bounds?.[1]||1:this.length);
    if(!this.reduced.matches&&this.fraction!==undefined&&Math.abs(fraction-this.fraction)>.5)this.lap={direction:fraction<this.fraction?1:-1,phase:fraction,old:this.fraction,time:now};
    this.fraction=fraction;let value=fraction,start=0,end=0;
    if(this.lap){
      const t=Math.min(1,(now-this.lap.time)/500),p=t===1?1:1-Math.pow(2,-10*t);
      if(this.lap.direction>0){start=p;end=1;}else{start=this.lap.phase*(1-p);end=fraction;value=this.lap.old*(1-p);}
      if(t===1){this.lap=null;start=end=0;value=fraction;}
    }
    this.progress.style.strokeDashoffset=String(1-value);
    this.tail.style.visibility=end>start?'visible':'hidden';this.tail.style.strokeDasharray=`${Math.max(0,end-start)} 1`;this.tail.style.strokeDashoffset=String(-start);
    this.dialog.dataset.progressWrap=this.lap?String(this.lap.direction):'0';
    this.dialog.dataset.scrollPhase = String(Math.round(phase));
    this.dialog.dataset.scrollLength = String(Math.round(this.length));
    if (this.motion.active||this.lap||this.scrub?.active||this.surface?.active) this.wake();
    else this.time = 0;
  };
  dispose() {
    this.disposed=true;
    this.dialog.classList.remove('is-dragging');
    this.releaseSurface();
    this.scrub?.dispose();
    this.abort.abort();
    this.observer.disconnect();
    cancelAnimationFrame(this.frame);
  }
  releaseSurface(){++this.surfaceEpoch;clearTimeout(this.surfaceTimer);this.surface?.dispose();this.surface=undefined;}
  freeze(){this.abort.abort();this.observer.disconnect();cancelAnimationFrame(this.frame);this.scrub?.dispose();}
  captureShape(){return this.surface?.captureShape();}
  captureTitle(){return this.surface?.captureTitle();}
}
