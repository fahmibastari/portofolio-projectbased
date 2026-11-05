import * as THREE from "three";
import { createFigureGeometry } from "./portal-figures";
import { screenVertex, lensFragment, trailFragment } from "./portal-shaders";
import { revealProgress } from "./motion-curve";
import {PortalCopy} from './portal-copy';
import {PortalForm} from './portal-form';

export interface PortalSurface {
  renderer: THREE.WebGLRenderer;
  texture: THREE.Texture;
  wake: () => void;
  compose?:(scene:THREE.Scene,camera:THREE.Camera,now:number)=>void;
  effectActive?:()=>boolean;
  setOverlayActive?:(active:boolean)=>void;
}

export class ChromePortal {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1,1,1,-1,.01,20);
  private background: THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private figures: THREE.Mesh[] = [];
  private copy=new PortalCopy();
  private form=new PortalForm(()=>this.wake());
  private figureGeometry?: THREE.BufferGeometry;
  private figureMaterial?: THREE.ShaderMaterial;
  private figuresReady?: Promise<void>;
  private target = 0;
  private progress = 0;
  private from = 0;
  private transition = 0;
  private previous = 0;
  private clock = 0;
  private started=performance.now();
  private frame = 0;
  private abort = new AbortController();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private fallback?: THREE.CanvasTexture;
  private trail = [0,1].map(()=>new THREE.WebGLRenderTarget(256,128,{type:THREE.HalfFloatType,depthBuffer:false}));
  private trailSide = 0;
  private trailScene = new THREE.Scene();
  private trailMaterial: THREE.ShaderMaterial;
  private trailCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private pointer = new THREE.Vector2(.5,.5);
  private follow = new THREE.Vector2(.5,.5);
  private pointerSeen = false;
  private energy = 0;
  private shield=1;
  private shields:Element[]=[];
  private shieldScan=0;
  private suspended=false;
  private uniforms: Record<string,THREE.IUniform>;

  constructor(private container: HTMLElement, private shared?: PortalSurface, private motion:()=>number=()=>0) {
    this.renderer=shared?.renderer ?? new THREE.WebGLRenderer({antialias:true,alpha:false});
    if(!shared){this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));container.append(this.renderer.domElement);}
    this.camera.position.z=10;
    this.scene.add(this.copy.mesh,this.form.mesh);
    let backdrop=shared?.texture;
    if(!backdrop){const c=document.createElement('canvas');c.width=c.height=2;c.getContext('2d')!.fillRect(0,0,2,2);backdrop=this.fallback=new THREE.CanvasTexture(c);}
    this.uniforms={sceneImage:{value:backdrop},aspect:{value:1},radius:{value:.2},opening:{value:0},clock:{value:0},squeeze:{value:0},trailImage:{value:this.trail[0].texture},texel:{value:new THREE.Vector2(1/256,1/128)},pointerStrength:{value:0},resolution:{value:new THREE.Vector2()}};
    this.background=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({depthWrite:false,depthTest:false,uniforms:this.uniforms,vertexShader:screenVertex,fragmentShader:lensFragment}));
    this.background.frustumCulled=false;this.background.renderOrder=-1;this.scene.add(this.background);
    this.trailMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,vertexShader:screenVertex,fragmentShader:trailFragment,
      uniforms:{previous:{value:this.trail[0].texture},texel:this.uniforms.texel,point:{value:this.pointer},aspect:this.uniforms.aspect,decay:{value:1},diffusion:{value:0},strength:{value:0}},
    });
    this.trailScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.trailMaterial));
    window.addEventListener('pointermove',this.point,{signal:this.abort.signal});
    window.addEventListener('resize',this.resize,{signal:this.abort.signal});
    document.addEventListener('visibilitychange',()=>{this.previous=0;if(!document.hidden)this.wake();},{signal:this.abort.signal});
    this.resize();
    void this.createFigures();
  }

  private createFigures(){return this.figuresReady??=this.makeFigures().then(()=>this.wake()).catch(error=>console.error(error));}
  get ready(){return this.createFigures();}
  private async makeFigures(){
    this.figureGeometry=await createFigureGeometry();
    this.figureMaterial=new THREE.ShaderMaterial({
      uniforms:{aspect:this.uniforms.aspect,radius:this.uniforms.radius,opening:this.uniforms.opening,clock:this.uniforms.clock,resolution:this.uniforms.resolution},
      vertexShader:`varying vec3 facing;void main(){facing=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float aspect,radius,opening,clock;uniform vec2 resolution;varying vec3 facing;float shade(vec3 n,vec3 l){vec3 h=normalize(l+vec3(0.,0.,1.));return pow(max(dot(n,h),0.),60.)*3.5+pow(1.-max(n.z,0.),3.)*.7+max(dot(n,l),0.)*.18;}void main(){vec2 q=(gl_FragCoord.xy/resolution-.5)*vec2(1.,1./aspect);float angle=atan(q.y,q.x);float r=radius*opening*(1.+.015*sin(clock*1.6))+(.6*sin(angle*3.+clock*.7)+.4*sin(angle*5.-clock*.45))*.05*sin(3.14159265*opening);if(length(q)>r*.99)discard;vec3 n=normalize(facing),l=normalize(vec3(-.3,1.,.55));vec3 col=vec3(shade(normalize(n+vec3(.05,0.,0.)),l),shade(n,l),shade(normalize(n-vec3(.05,0.,0.)),l));gl_FragColor=vec4(col*.26,1.);}`,
      transparent:true,
    });
    for(let i=0;i<6;i++){
      const f=new THREE.Mesh(this.figureGeometry,this.figureMaterial);f.renderOrder=i<4?3:5;
      const random=(salt:number)=>{const t=Math.sin(i*127.1+salt*311.7)*43758.5453;return t-Math.floor(t);};
      f.userData={phase:random(1)*Math.PI*2,x:((i+.5)/6-.5)*1.5+(random(2)-.5)*.18,y:((i*.618+random(3)*.12)%1-.5)*2.4,fall:.4*(.7+random(4)*.6),size:.38*(.7+random(5)*.6),sway:(random(6)-.5)*.1,rotation:random(7)*Math.PI*2,spin:(i%2?1:-1)*.7*(.6+random(8)*.8),rock:.22*(.6+random(9)*.8)};
      f.userData.depth=i<4?-random(10)*9:2+random(10)*3;
      this.figures.push(f);this.scene.add(f);
    }
  }
  show(){this.createFigures();this.from=this.progress;this.transition=performance.now();this.target=1;this.wake();}
  hide(){this.from=this.progress;this.transition=performance.now();this.target=0;this.wake();}
  setCopy(element:HTMLElement|null){this.copy.set(element);this.form.set(element?.querySelector('form')??null);this.wake();}
  setSuspended(value:boolean){this.suspended=value;if(value){this.energy=0;this.pointerSeen=false;this.follow.copy(this.pointer);}}
  private point=(event:PointerEvent)=>{
    if(event.pointerType==='touch')return;
    this.pointer.set(event.clientX/innerWidth,1-event.clientY/innerHeight);
    if(this.suspended){this.follow.copy(this.pointer);this.pointerSeen=false;return;}
    if(!this.pointerSeen){this.follow.copy(this.pointer);this.pointerSeen=true;}
    this.wake();
  };
  resize=()=>{
    const w=innerWidth,h=innerHeight;
    if(!this.shared)this.renderer.setSize(w,h);
    this.uniforms.aspect.value=w/h;
    this.uniforms.radius.value=w>=650?.2:420/390/2;
    this.renderer.getDrawingBufferSize(this.uniforms.resolution.value);
    this.camera.left=-w/h;this.camera.right=w/h;this.camera.top=1;this.camera.bottom=-1;this.camera.updateProjectionMatrix();
    const th=Math.max(1,Math.round(256*h/w));for(const target of this.trail)target.setSize(256,th);
    this.uniforms.texel.value.set(1/256,1/th);this.wake();
    this.copy.rebuild();
    this.form.rebuild();
  };
  private wake(){if(this.shared){this.shared.wake();return;}if(!this.frame&&!document.hidden)this.frame=requestAnimationFrame(this.tick);}
  private tick=(now:number)=>{this.frame=0;this.render(now);if(this.active&&!this.shared&&!this.reduced.matches)this.wake();};
  render(now:number){
    const dt=Math.min((now-(this.previous||now-16))/1000,.05);this.previous=now;
    this.clock=this.reduced.matches?0:(now-this.started)/1000;
    const elapsed=Math.min(1,(now-this.transition)/(this.target?850:650));
    const eased=revealProgress(elapsed);
    this.progress=this.reduced.matches?this.target:this.from+(this.target-this.from)*eased;
    this.uniforms.opening.value=this.progress;this.uniforms.clock.value=this.clock;
    this.uniforms.squeeze.value=this.target?0:-.1*(1-this.progress);
    this.follow.lerp(this.pointer,1-Math.exp(-7*dt));
    const gap=this.pointer.distanceTo(this.follow);
    const strength=this.pointerSeen?Math.pow(Math.tanh(Math.max(0,gap-.025)/.08),2):0;
    this.energy=Math.max(this.energy*Math.exp(-4*dt),strength);
    if(--this.shieldScan<=0){this.shieldScan=60;this.shields=[...document.querySelectorAll('.site-header,.site-footer,.portal-copy')];}
    let distance=Infinity;
    for(const element of this.shields){if(!element.isConnected||element.closest('[inert],[hidden]'))continue;const r=element.getBoundingClientRect();distance=Math.min(distance,Math.hypot(Math.max(r.left-this.pointer.x*innerWidth,0,this.pointer.x*innerWidth-r.right),Math.max(r.top-(1-this.pointer.y)*innerHeight,0,(1-this.pointer.y)*innerHeight-r.bottom)));}
    const reach=innerWidth*.03,weight=distance<reach?.03+.97*distance/reach:1;
    this.shield+=(weight-this.shield)*(1-Math.exp(-10*dt));
    this.uniforms.pointerStrength.value=this.reduced.matches?0:(this.energy>.004?this.shield:0);
    if(this.energy>.004&&!this.reduced.matches){
      const u=this.trailMaterial.uniforms;u.previous.value=this.trail[this.trailSide].texture;u.decay.value=Math.exp(-4*dt);u.diffusion.value=1-Math.exp(-40*dt);u.strength.value=strength;
      this.trailSide=1-this.trailSide;this.renderer.setRenderTarget(this.trail[this.trailSide]);this.renderer.render(this.trailScene,this.trailCamera);this.renderer.setRenderTarget(null);this.uniforms.trailImage.value=this.trail[this.trailSide].texture;
    }
    const scale=this.uniforms.radius.value*innerWidth/innerHeight*2;
    this.figures.forEach((figure)=>{
      const state=figure.userData;
      if(!this.reduced.matches){state.y-=state.fall*(1+state.depth*.05)*dt;state.phase+=dt;state.rotation+=state.spin*dt;}
      if(state.y < -1.4)state.y=1.45;
      figure.position.set((state.x+Math.sin(state.phase)*state.sway)*scale,state.y*scale,state.depth);
      figure.scale.setScalar(scale*state.size*this.progress*41.18/(41.18-state.depth));
      figure.rotation.set(Math.sin(state.phase*1.3)*state.rock,state.rotation,Math.sin(state.phase*.9+1.7)*state.rock);
      figure.visible=this.progress>.01;
    });
    if(!this.shared)this.container.hidden=!this.active;
    this.copy.update();
    this.form.update();
    this.renderer.render(this.scene,this.camera);
  }
  get active(){return this.target>0||this.progress>.0001||(!this.reduced.matches&&this.energy>.004)||this.pointer.distanceTo(this.follow)>.02;}
  dispose(){cancelAnimationFrame(this.frame);this.abort.abort();this.copy.dispose();this.form.dispose();this.background.geometry.dispose();this.background.material.dispose();this.figureGeometry?.dispose();this.figureMaterial?.dispose();this.trail.forEach(t=>t.dispose());this.trailMaterial.dispose();this.trailScene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.fallback?.dispose();if(!this.shared)this.renderer.dispose();}
}
