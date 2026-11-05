import * as THREE from 'three';
import {frameSize,ribbonSpec} from './ribbon-model';
import {roundedOutline} from './project-transition';
import {DetailFurniture} from './detail-furniture';
import type {OutlinePoint} from './project-transition';
import type {PortalSurface} from './portal';
import {DetailSheets} from './detail-sheets';
import {flatSheet} from './sheet-pose';
import type {ScrubFrame} from './detail-scrub';

const sheetClip=`varying vec2 sheetPoint;uniform vec4 clipRect;uniform float clipCorner;
float sheetAlpha(){vec2 q=abs(sheetPoint-clipRect.xy)-clipRect.zw+clipCorner;float d=length(max(q,0.))+min(max(q.x,q.y),0.)-clipCorner;float aa=max(fwidth(d),.0001);return 1.-smoothstep(-aa,aa,d);}`;

/** Temporarily uses the paused gallery's renderer for the detail media sheet. */
export class DetailSurface {
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(ribbonSpec.fieldOfView,1,.1,200);
  private entries:{image:HTMLImageElement;mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>}[]=[];
  private backgrounds:{element:HTMLElement;mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>}[]=[];
  private textures=new Map<string,THREE.Texture>();
  private originalParent:Node;
  private originalClass:string;
  private disposed=false;
  private halfHeight=1;private unit=1;
  private media:HTMLElement;
  private observer:ResizeObserver;
  private abort=new AbortController();
  private furniture?:DetailFurniture;
  private lastOutline:OutlinePoint[]|null=null;
  private lastBulge=0;
  private lastAlpha=1;
  private sheets:DetailSheets;
  private renderer:THREE.WebGLRenderer;
  readonly ready:Promise<void>;
  constructor(private dialog:HTMLDialogElement,private shared:PortalSurface,private wake:()=>void){
    this.renderer=shared.renderer;const renderer=this.renderer;this.sheets=new DetailSheets(this.scene,this.dialog,this.wake);
    this.media=dialog.querySelector('.project-media')!;
    this.originalParent=renderer.domElement.parentNode!;this.originalClass=renderer.domElement.className;
    this.camera.position.z=ribbonSpec.cameraDistance;
    this.observer=new ResizeObserver(()=>{this.resize();this.wake();});this.observer.observe(this.media);
    window.addEventListener('resize',()=>{this.resize();this.wake();},{signal:this.abort.signal});
    renderer.domElement.addEventListener('webglcontextrestored',this.wake,{signal:this.abort.signal});
    window.addEventListener('pointermove',this.wake,{signal:this.abort.signal});
    this.ready=this.prepare();
  }
  private async prepare(){
    const images=[...this.media.querySelectorAll('img')];
    await Promise.all(images.map(image=>image.decode().catch(()=>{})));
    if(this.disposed)return;
    for(const image of images){
      if(!image.naturalWidth)continue;
      let texture=this.textures.get(image.currentSrc);
      if(!texture){texture=new THREE.Texture(image);texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());this.textures.set(image.currentSrc,texture);}
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,24,24),new THREE.ShaderMaterial({
        transparent:true,depthTest:false,depthWrite:false,uniforms:{image:{value:texture},bulge:{value:0},halfHeight:{value:1},clipRect:{value:new THREE.Vector4()},clipCorner:{value:0},opacity:{value:1}},
        vertexShader:`varying vec2 texUv,sheetPoint;uniform float bulge,halfHeight;void main(){texUv=uv;vec4 w=modelMatrix*vec4(position,1.);sheetPoint=w.xy;float y=clamp(w.y/halfHeight,-1.,1.);w.z+=bulge*(1.-y*y);gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader:`varying vec2 texUv;uniform sampler2D image;uniform float opacity;${sheetClip}void main(){float alpha=sheetAlpha();if(alpha<.001)discard;gl_FragColor=texture2D(image,texUv);gl_FragColor.a*=alpha*opacity;}`,
      }));mesh.frustumCulled=false;mesh.renderOrder=2;this.entries.push({image,mesh});this.scene.add(mesh);
    }
    for(const element of this.media.querySelectorAll<HTMLElement>('.portrait-shot')){
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,24,24),new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{bulge:{value:0},halfHeight:{value:1},clipRect:{value:new THREE.Vector4()},clipCorner:{value:0}},vertexShader:`varying vec2 sheetPoint;uniform float bulge,halfHeight;void main(){vec4 w=modelMatrix*vec4(position,1.);sheetPoint=w.xy;float y=clamp(w.y/halfHeight,-1.,1.);w.z+=bulge*(1.-y*y);gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`${sheetClip}void main(){float alpha=sheetAlpha();if(alpha<.001)discard;gl_FragColor=vec4(vec3(.952941),alpha);}`}));mesh.frustumCulled=false;mesh.renderOrder=1.5;this.backgrounds.push({element,mesh});this.scene.add(mesh);
    }
    if(!this.entries.length)return;
    this.furniture=new DetailFurniture(this.dialog,this.scene,this.wake);
    await this.renderer.compileAsync(this.scene,this.camera);
    if(this.disposed)return;
    this.dialog.append(this.renderer.domElement);this.renderer.domElement.className='detail-canvas';
    this.dialog.dataset.surface='true';
    this.shared.setOverlayActive?.(true);
    this.media.dataset.rendered='true';this.resize();this.wake();
  }
  private resize(){
    this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();
    const frame=frameSize(innerWidth,innerHeight);this.unit=frame.unit;this.halfHeight=frame.halfHeight;
    if(this.renderer.domElement.parentNode===this.dialog)this.renderer.setSize(innerWidth,innerHeight);
  }
  render(residual:number,scrub?:ScrubFrame){
    if(this.disposed||this.renderer.domElement.parentNode!==this.dialog)return;
    const bounds=this.media.getBoundingClientRect(),panel=this.dialog.getBoundingClientRect(),normal=Math.tanh(residual/(innerWidth<650?500:900));
    const sheetBulge=normal*Math.abs(normal)*.22*this.halfHeight+(scrub?.bow??0),bulge=sheetBulge*1.3;
    this.lastBulge=sheetBulge;this.lastAlpha=scrub?.mainAlpha??1;
    const canvas=this.renderer.domElement;
    if(scrub){
      const sx=panel.width/this.dialog.offsetWidth,sy=panel.height/this.dialog.offsetHeight;
      canvas.style.transformOrigin='0 0';canvas.style.transform=`matrix(${1/sx},0,0,${1/sy},${-panel.left/sx},${-panel.top/sy})`;
    }else canvas.style.transform='';
    this.lastOutline=roundedOutline(panel.width,panel.height,parseFloat(getComputedStyle(this.dialog).borderTopLeftRadius)).map(point=>{
      const x=(panel.left+point.x-innerWidth/2)*this.unit,y=(innerHeight/2-panel.top-point.y)*this.unit,ny=Math.max(-1,Math.min(1,y/this.halfHeight)),z=sheetBulge*(1-ny*ny),scale=41.18/(41.18-z);
      return {x:innerWidth/2+x/this.unit*scale,y:innerHeight/2-y/this.unit*scale};
    });this.renderer.domElement.style.clipPath='';
    this.sheets.update(panel,parseFloat(getComputedStyle(this.dialog).borderTopLeftRadius),sheetBulge,this.unit,this.halfHeight,scrub);
    for(const {mesh} of [...this.entries,...this.backgrounds]){
      mesh.material.uniforms.clipRect.value.set((panel.left+panel.width/2-innerWidth/2)*this.unit,(innerHeight/2-panel.top-panel.height/2)*this.unit,panel.width*this.unit/2,panel.height*this.unit/2);
      mesh.material.uniforms.clipCorner.value=parseFloat(getComputedStyle(this.dialog).borderTopLeftRadius)*this.unit;
    }
    for(const {image,mesh} of this.entries){
      const r=image.getBoundingClientRect();mesh.visible=r.bottom>bounds.top-300&&r.top<bounds.bottom+300;
      if(!mesh.visible)continue;
      mesh.position.set((r.left+r.width/2-innerWidth/2)*this.unit,(innerHeight/2-r.top-r.height/2)*this.unit,0);mesh.scale.set(r.width*this.unit,r.height*this.unit,1);
      mesh.material.uniforms.bulge.value=bulge;mesh.material.uniforms.halfHeight.value=this.halfHeight;
      mesh.material.uniforms.opacity.value=1-(scrub?.amount??0);
    }
    for(const {element,mesh} of this.backgrounds){const r=element.getBoundingClientRect();mesh.visible=r.bottom>bounds.top-300&&r.top<bounds.bottom+300;mesh.position.set((r.left+r.width/2-innerWidth/2)*this.unit,(innerHeight/2-r.top-r.height/2)*this.unit,0);mesh.scale.set(r.width*this.unit,r.height*this.unit,1);mesh.material.uniforms.bulge.value=bulge;mesh.material.uniforms.halfHeight.value=this.halfHeight;}
    this.furniture?.update(sheetBulge,this.unit,this.halfHeight,performance.now(),1-(scrub?.amount??0));
    this.renderer.setRenderTarget(null);this.renderer.setClearColor(0);if(this.shared.compose)this.shared.compose(this.scene,this.camera,performance.now());else this.renderer.render(this.scene,this.camera);
    this.dialog.dataset.scrollBulge=bulge.toFixed(5);
  }
  get active(){return this.sheets.active||!!this.furniture?.active||!!this.shared.effectActive?.();}
  captureShape(){return this.lastOutline?{outline:this.lastOutline,alpha:this.lastAlpha,pose:{...flatSheet(this.dialog.getBoundingClientRect(),parseFloat(getComputedStyle(this.dialog).borderTopLeftRadius)),bend:this.lastBulge}}:undefined;}
  captureTitle(){
    const r=this.dialog.querySelector('#project-title')!.getBoundingClientRect(),points=[];
    for(const px of [r.left,r.right])for(const py of [r.top,r.bottom]){const x=(px-innerWidth/2)*this.unit,y=(innerHeight/2-py)*this.unit,ny=Math.max(-1,Math.min(1,y/this.halfHeight)),z=this.lastBulge*(1-ny*ny),scale=41.18/(41.18-z);points.push({x:innerWidth/2+x/this.unit*scale,y:innerHeight/2-y/this.unit*scale});}
    const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));return{left,top,width:Math.max(...points.map(p=>p.x))-left,height:Math.max(...points.map(p=>p.y))-top};
  }
  dispose(){
    this.disposed=true;this.observer.disconnect();this.abort.abort();
    delete this.media.dataset.rendered;
    delete this.dialog.dataset.surface;this.furniture?.dispose();
    this.sheets.dispose();this.shared.setOverlayActive?.(false);
    if(this.renderer.domElement.parentNode===this.dialog){this.originalParent.appendChild(this.renderer.domElement);this.renderer.domElement.className=this.originalClass;this.renderer.domElement.style.clipPath='';this.renderer.domElement.style.transform='';this.renderer.setClearColor(0);this.renderer.clear();}
    this.entries.forEach(({mesh})=>{mesh.geometry.dispose();mesh.material.dispose();});this.textures.forEach(texture=>texture.dispose());
    this.backgrounds.forEach(({mesh})=>{mesh.geometry.dispose();mesh.material.dispose();});
  }
}
