import * as THREE from 'three';
import type {Project} from './types';
import {frameSize,ribbonSpec,smooth} from './ribbon-model';
import {roundedOutline} from './project-transition';
import {revealProgress} from './motion-curve';
import {blendSheet,flatSheet,type SheetPose} from './sheet-pose';
import {thumbnailPath} from './boards';

const vertex=`varying vec2 texUv;void main(){texUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const box=`float box(vec2 q,vec2 halfSize,float radius){vec2 d=abs(q)-halfSize+radius;return min(max(d.x,d.y),0.)+length(max(d,0.))-radius;}`;
const cover=`vec2 cover(vec2 uv,float imageAspect,float frameAspect){vec2 s=vec2(min(1.,frameAspect/imageAspect),min(1.,imageAspect/frameAspect));return (uv-.5)*s+.5;}`;

/** The full list and its travelling window share one field and one perspective. */
export class FullIndex {
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(ribbonSpec.fieldOfView,1,.1,200);
  private picture:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private words:{element:HTMLElement;mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;texture:THREE.CanvasTexture}[]=[];
  private textures=new Map<string,THREE.Texture>();
  private abort=new AbortController();
  private observer:ResizeObserver;
  private frame=0;private last=0;private enabled=false;private seen=false;
  private x=0;private y=0;private tx=0;private ty=0;private vx=0;private vy=0;
  private reveal=0;private aspect=1;private halfWidth=1;private halfHeight=1;private unit=1;
  private index=0;private current=-1;private swapTime=0;private sourceAspect=1;private nextAspect=1;
  private started=0;
  private blast:{from:THREE.Vector4;to:THREE.Vector4;source:SheetPose;destination:SheetPose;start:number}|null=null;
  private inverse=new THREE.Matrix4();
  private reduced=matchMedia('(prefers-reduced-motion:reduce)');
  private compiled=false;private generation=0;

  constructor(private host:HTMLElement,private list:HTMLElement,private projects:Project[],private mediaSource?:(id:string)=>HTMLVideoElement|null){
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));this.renderer.setClearColor(0,0);
    host.replaceChildren(this.renderer.domElement);
    this.camera.position.z=ribbonSpec.cameraDistance;
    this.picture=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({
      transparent:true,depthTest:false,depthWrite:false,vertexShader:vertex,
      uniforms:{a:{value:null},b:{value:null},aspectA:{value:1},aspectB:{value:1},aspect:{value:1},fade:{value:0},reveal:{value:0},corner:{value:0},shadeY:{value:.5},shade:{value:.6},alpha:{value:1},white:{value:0}},
      fragmentShader:`varying vec2 texUv;uniform sampler2D a,b;uniform float aspectA,aspectB,aspect,fade,reveal,corner,shadeY,shade,alpha,white;${box}${cover}
      void main(){vec2 size=vec2(aspect,1.);float p=max(reveal,.0001);vec2 mid=size*.5*p;float r=min(corner*p,min(mid.x,mid.y));float d=box((texUv-.5)*size,mid,r);float edge=1.-smoothstep(-fwidth(d),fwidth(d),d);vec3 color=mix(texture2D(a,cover(texUv,aspectA,aspect)).rgb,texture2D(b,cover(texUv,aspectB,aspect)).rgb,fade);float g=1.-smoothstep(.05,.6,abs(texUv.y-shadeY));gl_FragColor=vec4(mix(mix(color,vec3(.059),shade*g),vec3(1.),white),edge*alpha);}`,
    }));
    this.picture.frustumCulled=false;this.scene.add(this.picture);
    window.addEventListener('pointermove',this.point,{signal:this.abort.signal});
    window.addEventListener('resize',this.resize,{signal:this.abort.signal});
    document.addEventListener('visibilitychange',()=>{this.last=0;if(!document.hidden)this.wake();},{signal:this.abort.signal});
    this.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();delete list.dataset.rendered;},{signal:this.abort.signal});
    this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.resize();this.wake();},{signal:this.abort.signal});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(list);
    this.resize();
    list.querySelectorAll<HTMLElement>('.index-row').forEach((element,index)=>{
      element.addEventListener('pointerenter',()=>{this.index=index;this.wake();},{signal:this.abort.signal});
      element.addEventListener('focus',()=>{const r=element.getBoundingClientRect();this.index=index;this.tx=this.x=r.x+r.width/2;this.ty=this.y=r.y+r.height/2;this.seen=true;this.wake();},{signal:this.abort.signal});
    });
    projects.forEach(p=>{
      const video=this.mediaSource?.(p.id);if(video?.readyState&&video.readyState>=2){const texture=new THREE.VideoTexture(video);texture.colorSpace=THREE.NoColorSpace;this.textures.set(p.id,texture);const frame=()=>{if(this.enabled&&!video.paused)this.wake();if(!this.abort.signal.aborted)video.requestVideoFrameCallback(frame);};if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(frame);return;}
      const image=new Image();image.onload=()=>{const texture=new THREE.Texture(image);texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;texture.minFilter=THREE.LinearFilter;this.textures.set(p.id,texture);this.wake();};image.src=thumbnailPath(p);
    });
  }
  setVisible(value:boolean){this.enabled=value;this.started=performance.now();if(value){this.resize();this.wake();}else{cancelAnimationFrame(this.frame);this.frame=0;this.last=0;this.reveal=0;this.resetHandoff();this.textures.forEach(texture=>{if(texture.image instanceof HTMLVideoElement)texture.image.pause();});delete this.list.dataset.rendered;this.renderer.clear();}}
  private point=(event:PointerEvent)=>{if(event.pointerType==='touch')return;this.tx=event.clientX;this.ty=event.clientY;if(!this.seen){this.x=this.tx;this.y=this.ty;this.seen=true;}this.wake();};
  private resize=()=>{
    const generation=++this.generation;this.compiled=false;
    this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();
    const frame=frameSize(innerWidth,innerHeight);this.halfWidth=frame.halfWidth;this.halfHeight=frame.halfHeight;this.unit=this.halfHeight*2/innerHeight;
    this.words.forEach(w=>{w.mesh.geometry.dispose();w.mesh.material.dispose();w.texture.dispose();this.scene.remove(w.mesh);});this.words=[];
    if(innerWidth<650||!this.enabled){delete this.list.dataset.rendered;return;}
    const ratio=Math.min(devicePixelRatio*2,3);
    const listTransform=getComputedStyle(this.list).transform,entrance=new THREE.Vector2();
    if(listTransform!=='none'){const matrix=new DOMMatrix(listTransform);entrance.set(matrix.e,matrix.f);}
    this.list.querySelectorAll<HTMLElement>('.index-row').forEach(element=>{
      const original=element.getBoundingClientRect(),style=getComputedStyle(element),font=parseFloat(style.fontSize);
      const rem=Math.min(2,Math.max(.5,innerWidth/1500)),suffix=!!element.nextElementSibling&&!element.hasAttribute('data-row-end');
      const bounds={...original.toJSON(),x:original.x-entrance.x,y:original.y-entrance.y,width:original.width+(suffix?24*rem:0)};
      const canvas=document.createElement('canvas');canvas.width=Math.ceil((bounds.width+8)*ratio);canvas.height=Math.ceil((bounds.height+8)*ratio);
      const ctx=canvas.getContext('2d')!;ctx.scale(ratio,ratio);ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.letterSpacing=style.letterSpacing;ctx.fillStyle='#fff';ctx.textBaseline='alphabetic';
      const metrics=ctx.measureText(element.textContent||'');const ascent=metrics.fontBoundingBoxAscent??font*.8,descent=metrics.fontBoundingBoxDescent??font*.2;
      ctx.fillText(element.textContent||'',4,4+(bounds.height-ascent-descent)/2+ascent);
      if(suffix){ctx.font=`400 ${8*rem}px ${style.fontFamily}`;ctx.letterSpacing='0px';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('●',4+original.width+12*rem,4+bounds.height/2);}
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,32,4),new THREE.ShaderMaterial({
        transparent:true,depthTest:false,depthWrite:false,
        uniforms:{image:{value:texture},field:{value:new THREE.Vector4()},blast:{value:new THREE.Vector4()},blastPresence:{value:0},presence:{value:0},dim:{value:1},inverse:{value:this.inverse},cameraSize:{value:new THREE.Vector3(this.halfWidth,this.halfHeight,ribbonSpec.cameraDistance)},resolution:{value:new THREE.Vector2()},shape:{value:new THREE.Vector3()},alpha:{value:1}},
        vertexShader:`varying vec2 texUv;uniform vec4 field,blast;uniform float presence,blastPresence;void main(){texUv=uv;vec4 w=modelMatrix*vec4(position,1.);vec2 d=w.xy-field.xy;float t=max(length(d/max(field.zw,vec2(.0001))),.001);w.xy+=d*.4*exp(-t/.9)*presence;vec2 b=w.xy-blast.xy;float bt=max(length(b/max(blast.zw,vec2(.0001))),.001);w.xy+=b*1.6*exp(-bt/.75)*blastPresence;gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader:`varying vec2 texUv;uniform sampler2D image;uniform float presence,dim,alpha;uniform mat4 inverse;uniform vec3 cameraSize,shape;uniform vec2 resolution;${box}
        void main(){vec3 origin=(inverse*vec4(0.,0.,cameraSize.z,1.)).xyz;vec3 end=(inverse*vec4((gl_FragCoord.xy/resolution-.5)*cameraSize.xy*2.,0.,1.)).xyz;vec3 direction=end-origin;float t=-origin.z/(abs(direction.z)<.00001?.00001:direction.z);vec2 q=(origin+t*direction).xy*vec2(shape.x,1.);float r=min(shape.y*shape.z,min(shape.x,1.)*.5*shape.z);float d=box(q,vec2(shape.x,1.)*.5*shape.z,r);float covered=(1.-smoothstep(-max(fwidth(d),.0001),max(fwidth(d),.0001),d))*presence;vec4 ink=texture2D(image,texUv);gl_FragColor=vec4(vec3(mix(1.,dim,covered)),ink.a*alpha);}`,
      }));
      mesh.scale.set((bounds.width+8)*this.unit,(bounds.height+8)*this.unit,1);mesh.position.set((bounds.x+bounds.width/2-innerWidth/2)*this.unit,(innerHeight/2-bounds.y-bounds.height/2)*this.unit,0);mesh.renderOrder=4;mesh.frustumCulled=false;
      this.words.push({element,mesh,texture});this.scene.add(mesh);
    });
    delete this.list.dataset.rendered;
    void this.renderer.compileAsync(this.scene,this.camera).then(()=>{if(generation!==this.generation||!this.enabled)return;this.compiled=true;this.wake();});
  };
  private wake(){if(this.enabled&&innerWidth>=650&&!this.frame&&!document.hidden)this.frame=requestAnimationFrame(this.tick);}
  private tick=(now:number)=>{
    this.frame=0;if(!this.compiled)return;const dt=Math.min((now-(this.last||now-16))/1000,.05);this.last=now;
    const rect=this.list.getBoundingClientRect(),pad=140*Math.min(2,Math.max(.5,innerWidth/1500));
    const distance=Math.hypot(Math.max(rect.left-this.tx,0,this.tx-rect.right),Math.max(rect.top-this.ty,0,this.ty-rect.bottom));
    const target=this.blast?this.reveal:this.seen?1-smooth(0,1,Math.min(1,distance/pad)):0;
    const damp=(a:number,b:number,speed:number)=>a+(b-a)*(1-Math.exp(-speed*dt));
    this.reveal=this.reduced.matches?target:damp(this.reveal,target,10);
    const ox=this.x,oy=this.y;if(!this.blast){this.x=damp(this.x,this.tx,10);this.y=damp(this.y,this.ty,10);}
    this.vx=damp(this.vx,(this.x-ox)*this.unit/dt,8);this.vy=damp(this.vy,-(this.y-oy)*this.unit/dt,8);
    const texture=this.textures.get(this.projects[this.index]?.id);const u=this.picture.material.uniforms;
    if(texture&&this.current!==this.index){
      const image=texture.image as HTMLImageElement|HTMLVideoElement,aspect=image instanceof HTMLVideoElement?image.videoWidth/image.videoHeight:image.width/image.height;
      u.a.value=u.b.value??texture;this.sourceAspect=this.nextAspect;u.aspectA.value=this.current<0?aspect:this.sourceAspect;
      this.nextAspect=aspect;u.b.value=texture;u.aspectB.value=this.nextAspect;if(this.current<0)this.aspect=this.nextAspect;this.current=this.index;this.swapTime=now;
      if(!this.seen)this.aspect=this.nextAspect;
    }
    this.aspect=damp(this.aspect,this.nextAspect,9);
    const height=200*Math.min(2,Math.max(.5,innerWidth/1500)),width=height*this.aspect;
    this.picture.position.set((this.x-innerWidth/2)*this.unit,(innerHeight/2-this.y)*this.unit,0);this.picture.scale.set(width*this.unit,height*this.unit,1);
    const side=this.tx<innerWidth/2?1:-1;
    this.picture.rotation.set(this.reduced.matches?0:-Math.tanh(this.vy/25)*.35,this.reduced.matches?0:Math.tanh(this.vx/25)*.35+(1-this.reveal)*side*.35,0);
    u.aspect.value=this.aspect;u.fade.value=1-Math.pow(1-Math.min(1,(now-this.swapTime)/350),2);u.reveal.value=this.reveal;u.corner.value=20*Math.min(2,Math.max(.5,innerWidth/1500))/height;
    const activeRect=this.words[this.index]?.element.getBoundingClientRect();if(activeRect)u.shadeY.value=damp(u.shadeY.value,1-(activeRect.y+activeRect.height/2-this.y+height/2)/height,10);
    this.picture.visible=this.reveal>.001&&!!texture;this.picture.updateMatrixWorld();this.inverse.copy(this.picture.matrixWorld).invert();
    this.textures.forEach(texture=>{if(texture.image instanceof HTMLVideoElement){const video=texture.image;if(this.picture.visible&&(texture===u.a.value||texture===u.b.value)&&!this.blast&&!document.hidden){if(video.paused)void video.play().catch(()=>{});}else video.pause();}});
    const resolution=this.renderer.getDrawingBufferSize(new THREE.Vector2());const alpha=this.reduced.matches?1:1-Math.pow(1-Math.min(1,(now-this.started)/600),3);
    const blastSeconds=this.blast?Math.max(0,(now-this.blast.start)/1000):0;
    const blastProgress=this.blast?revealProgress(Math.min(1,blastSeconds)):0;
    if(this.blast){
      const seconds=blastSeconds,pose=blendSheet(this.blast.source,this.blast.destination,blastProgress);
      this.picture.position.set((pose.left+pose.width/2-innerWidth/2)*this.unit,(innerHeight/2-pose.top-pose.height/2)*this.unit,0);
      this.picture.scale.set(pose.width*this.unit,pose.height*this.unit,1);this.picture.quaternion.fromArray(pose.rotation??[0,0,0,1]);
      u.aspect.value=pose.width/pose.height;u.corner.value=pose.corner/pose.height;u.reveal.value=1;u.white.value=pose.white;
      u.alpha.value=1;u.shade.value=.6*Math.max(0,1-seconds/.2);this.picture.updateMatrixWorld();
      this.host.dataset.flight=JSON.stringify({progress:Math.min(1,seconds),width:pose.width,height:pose.height,white:pose.white});
    }
    for(const [index,word] of this.words.entries()){
      const wu=word.mesh.material.uniforms;wu.field.value.set(this.picture.position.x,this.picture.position.y,width*this.unit/2,height*this.unit/2);if(this.blast)wu.field.value.copy(this.blast.from);wu.presence.value=this.reveal;wu.dim.value=damp(wu.dim.value,index===this.index?1:.1,10);wu.shape.value.set(this.aspect,u.corner.value,this.reveal);wu.resolution.value.copy(resolution);wu.alpha.value=alpha*(this.blast?Math.max(0,1-blastSeconds/.3)**2:1);
      wu.blastPresence.value=this.blast?1-Math.exp(-10*blastSeconds):0;if(this.blast)wu.blast.value.copy(this.blast.from).lerp(this.blast.to,blastProgress);
    }
    this.renderer.render(this.scene,this.camera);
    this.list.dataset.rendered='true';
    this.host.dataset.reveal=this.reveal.toFixed(4);this.host.dataset.project=this.projects[this.index]?.id;
    if((!this.blast&&(Math.abs(this.x-this.tx)+Math.abs(this.y-this.ty)>.05||Math.abs(this.reveal-target)>.0001))||Math.abs(this.aspect-this.nextAspect)>.0001||Math.abs(this.vx)+Math.abs(this.vy)>.001||now-this.swapTime<400||now-this.started<650||!!this.blast&&now-this.blast.start<1250)this.wake();else this.last=0;
  };
  handoff(id:string){
    if(this.projects[this.index]?.id!==id||this.reveal<.5||!this.picture.visible)return null;
    this.picture.updateMatrixWorld();
    const height=this.picture.scale.y/this.unit,width=this.picture.scale.x/this.unit;
    const outline=roundedOutline(width,height,20*Math.min(2,Math.max(.5,innerWidth/1500))).map(p=>{const v=new THREE.Vector3(p.x/width-.5,.5-p.y/height,0).applyMatrix4(this.picture.matrixWorld).project(this.camera);return{x:(v.x*.5+.5)*innerWidth,y:(.5-v.y*.5)*innerHeight};});
    const pose=this.picturePose();
    const element=this.words[this.index].element,rect=element.getBoundingClientRect();return{outline,pose,caption:{left:rect.left,top:rect.top,width:rect.width,height:rect.height,fontSize:parseFloat(getComputedStyle(element).fontSize)}};
  }
  private picturePose():SheetPose{
    const height=this.picture.scale.y/this.unit,width=this.picture.scale.x/this.unit;
    return{left:innerWidth/2+this.picture.position.x/this.unit-width/2,top:innerHeight/2-this.picture.position.y/this.unit-height/2,width,height,corner:20*Math.min(2,Math.max(.5,innerWidth/1500)),strength:0,activity:0,bend:0,shade:0,white:0,kind:'rail',rotation:this.picture.quaternion.toArray() as [number,number,number,number]};
  }
  blastTo(bounds:DOMRect){this.blast={from:new THREE.Vector4(this.picture.position.x,this.picture.position.y,this.picture.scale.x/2,this.picture.scale.y/2),to:new THREE.Vector4((bounds.x+bounds.width/2-innerWidth/2)*this.unit,(innerHeight/2-bounds.y-bounds.height/2)*this.unit,bounds.width*this.unit/2,bounds.height*this.unit/2),source:this.picturePose(),destination:flatSheet(bounds,parseFloat(getComputedStyle(document.querySelector('#project-dialog')!).borderTopLeftRadius)),start:performance.now()};this.wake();}
  get flightStarted(){return this.blast?.start;}
  resetHandoff(){this.blast=null;delete this.host.dataset.flight;this.picture.material.uniforms.alpha.value=1;this.picture.material.uniforms.shade.value=.6;this.picture.material.uniforms.white.value=0;this.words.forEach(word=>word.mesh.material.uniforms.blastPresence.value=0);this.wake();}
  dispose(){++this.generation;this.abort.abort();this.observer.disconnect();cancelAnimationFrame(this.frame);this.words.forEach(w=>{w.mesh.geometry.dispose();w.mesh.material.dispose();w.texture.dispose();});this.textures.forEach(t=>t.dispose());this.picture.geometry.dispose();this.picture.material.dispose();this.renderer.dispose();}
}
