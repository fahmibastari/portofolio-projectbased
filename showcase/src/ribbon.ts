import * as THREE from "three";
import type { Project } from "./types";
import type { ChromePortal, PortalSurface } from "./portal";
import { frameSize, panelMetrics, RibbonMotion, ribbonSpec, surfacePoint } from "./ribbon-model";
import { galleryAspect,galleryMotion } from "./boards";
import { flightProgress,revealProgress } from "./motion-curve";
import { roundedOutline,relatedBounds } from "./project-transition";
import {blendSheet,flatSheet,sheetWorldPoint,type SheetPose} from './sheet-pose';

type Panel = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  original: Float32Array;
  index: number;
  link: HTMLAnchorElement;
  uniforms: Record<string, THREE.IUniform>;
  nextTexture?: THREE.CanvasTexture;
  aspect: number;
  center: number;
  width: number;
  height: number;
  caption: THREE.CanvasTexture;
  hover: number;
  hoverTarget: number;
  hoverFrom: number;
  hoverStart: number;
  arrowStart: number;
  video?:HTMLVideoElement;
  videoTexture?:THREE.VideoTexture;
  videoFrameReady?:boolean;
};

/** A single continuous, deforming ribbon rather than a carousel of tilted flat cards. */
export class WorkGallery {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(ribbonSpec.fieldOfView, 1, 0.1, 2000);
  private panels: Panel[] = [];
  private floor: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private veil: THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private portal?: ChromePortal;
  private backdrop = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    samples: 0,
  });
  private row = new RibbonMotion();
  private get current() { return this.row.position; }
  private set current(value: number) { this.row.position = value; }
  private get target() { return this.row.target; }
  private set target(value: number) { this.row.target = value; }
  private circumference = 1;
  private halfWidth = 1;
  private halfHeight = 1;
  private mobile = false;
  private reflection=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
  private reflectionCamera=new THREE.PerspectiveCamera();
  private reflectionMatrix=new THREE.Matrix4();
  private unit = 1;
  private lastTime = 0;
  private active = -1;
  private paused = false;
  private dragging = false;
  private dragEngaged=false;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private lastY = 0;
  private touchDrag = false;
  private lastHover = 0;
  private lastMoveTime = 0;
  private dragVelocity = 0;
  private travel = 0;
  private frame = 0;
  private disposed = false;
  private raycaster = new THREE.Raycaster();
  private abort = new AbortController();
  private observer: ResizeObserver;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private entered = 0;
  private started = Infinity;
  private introRects: {left:number;top:number;width:number;height:number}[] = [];
  private velocity = 0;
  private viewAmount = 1;
  private viewTarget = 1;
  private depthVector = new THREE.Vector3();
  readonly ready:Promise<void>;
  private mediaReady:Promise<void>[]=[];
  private returning=-1;
  private captionReturnAt=0;
  private pauseRequested=false;
  private flight:{index:number;from:SheetPose;to:SheetPose;start:number;closing:boolean;duration:number;intro:boolean;secondary:{index:number;from:SheetPose;to:SheetPose}[]}|null=null;
  private interruptedRelated=new Map<number,SheetPose>();

  constructor(
    private container: HTMLElement,
    private links: HTMLElement,
    private projects: Project[],
    boards: HTMLCanvasElement[],
    private onChange: (index: number) => void,
    private onOpen: (id: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000);
    this.container.append(this.renderer.domElement);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1, 48, 24).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
        uniforms: { opacity: { value: 1 }, halfWidth: { value: 1 }, run: { value: 1 }, cell: { value: 1 },reflection:{value:this.reflection.texture},reflectionMatrix:{value:this.reflectionMatrix} },
        vertexShader: `
          uniform float halfWidth,run; varying vec3 floorPoint,refPoint; varying float distanceAlong;
          void main(){
            vec4 p=modelMatrix*vec4(position,1.);
            distanceAlong=-p.z/run; floorPoint=p.xyz;
            float t=clamp(p.x/halfWidth,-1.,1.);
            p.z+=halfWidth*${ribbonSpec.door}*t*(1.5-.5*t*t);
            refPoint=p.xyz;
            gl_Position=projectionMatrix*viewMatrix*p;
          }`,
        fragmentShader: `
          uniform float opacity,cell,halfWidth;uniform sampler2D reflection;uniform mat4 reflectionMatrix;
          varying vec3 floorPoint,refPoint; varying float distanceAlong;
          void main(){
            vec2 grid=vec2(floorPoint.x+4.*halfWidth,-floorPoint.z)/cell;
            vec2 d=abs(fract(grid)-.5), aa=fwidth(grid)*1.5;
            vec2 line=1.-smoothstep(vec2(0.),aa,d);
            float fade=1.-smoothstep(.2,.95,distanceAlong);
            float gridLine=max(line.x,line.y);
            vec3 point=refPoint;point.x-=(point.x+halfWidth*.6)*.35*abs(distanceAlong);
            vec4 projected=reflectionMatrix*vec4(point,1.);vec2 uv=projected.xy/max(projected.w,.0001)*.5+.5;
            vec2 soft=smoothstep(vec2(0.),vec2(.1),uv)*(1.-smoothstep(vec2(.9),vec2(1.),uv));
            float fall=exp(-(distanceAlong>0.?distanceAlong*6.:-distanceAlong*2.2));
            vec3 reflected=texture2D(reflection,uv).rgb*gridLine*.5*fall*soft.x*soft.y*fade;
            gl_FragColor=vec4(vec3(gridLine*.08*fade)+reflected,opacity*fade);
          }`,
      }),
    );
    this.floor.renderOrder = -1;
    this.floor.frustumCulled = false;
    this.scene.add(this.floor);
    this.veil=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
      depthTest:false,depthWrite:false,transparent:true,uniforms:{opacity:{value:0}},
      vertexShader:`varying vec2 screenUv;void main(){screenUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader:`varying vec2 screenUv;uniform float opacity;void main(){float g=max(1.-smoothstep(0.,.26,screenUv.y),smoothstep(.74,1.,screenUv.y));gl_FragColor=vec4(0.,0.,0.,g*g*opacity);}`,
    }));
    this.veil.frustumCulled=false;this.veil.renderOrder=3.5;this.scene.add(this.veil);

    for (const [i, source] of boards.entries()) {
      const aspect = galleryAspect(projects[i]);
      const presentation = this.decorate(
        source,
        projects[i].title ?? projects[i].name,
        aspect,
      );
      const texture = new THREE.CanvasTexture(presentation);
      const caption = new THREE.CanvasTexture(this.caption(projects[i].title ?? projects[i].name,aspect));
      // This display-referred pipeline keeps the image and the refraction pass
      // in the same space; no extra gamma transform between the two surfaces.
      caption.colorSpace = THREE.NoColorSpace;
      texture.colorSpace = THREE.NoColorSpace;
      texture.anisotropy = Math.min(
        8,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
      const geometry = new THREE.PlaneGeometry(1, 1, 64, 12);
      const original = new Float32Array(geometry.attributes.position.array);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        fog: false,
      });
      const uniforms:Record<string,THREE.IUniform> = {
        uNextMap: { value: texture },
        uSlideMix: { value: 0 },
        uZoom: { value: 1 },
        uEnter: { value: 0 },
        uAspect: { value: aspect },
        uCaption: { value: caption },
        uFrameWidth: { value: 1 },
        uActivity: { value: 0 },
        uHover: { value: 0 },
        uArrow: { value: 0 },
        uCaptionPresence: { value: 0 },
        uCorner: { value: .5 },
        uShapeAspect: { value: aspect },
        uArrowCenter: {value:new THREE.Vector2()},
        uArrowScale: {value:new THREE.Vector2()},
        uFlat: {value:0},
        uPanelSize:{value:new THREE.Vector2()},
        uSheetStrength:{value:1},uShadeAmount:{value:1},uFlightWhite:{value:-1},uScrim:{value:1},
      };
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader =
          `uniform sampler2D uNextMap,uCaption;uniform vec2 uArrowCenter,uArrowScale,uPanelSize;uniform float uSlideMix,uZoom,uEnter,uAspect,uFrameWidth,uActivity,uHover,uArrow,uCaptionPresence,uCorner,uShapeAspect,uFlat,uSheetStrength,uShadeAmount,uFlightWhite,uScrim;
           varying vec3 surfacePosition;
           float segmentDistance(vec2 p,vec2 a,vec2 b){vec2 e=b-a;return length(p-a-e*clamp(dot(p-a,e)/dot(e,e),0.,1.));}
           float arrowInk(vec2 p){return min(segmentDistance(p,vec2(-.3,0.),vec2(.3,0.)),min(segmentDistance(p,vec2(.05,.24),vec2(.3,0.)),segmentDistance(p,vec2(.05,-.24),vec2(.3,0.))));}
           \n` +
          shader.fragmentShader;
        shader.vertexShader = `varying vec3 surfacePosition;\n` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsurfacePosition=position;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>','');
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          `
          vec2 fit=vec2(min(1.,uShapeAspect/uAspect),min(1.,uAspect/uShapeAspect));
          vec2 slideUv=(vMapUv-.5)*fit/uZoom+.5;
          ${THREE.ShaderChunk.map_fragment.replaceAll("vMapUv", "slideUv")}
          diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(uNextMap,slideUv).rgb*diffuse,uSlideMix);
          float q=surfacePosition.x/uFrameWidth*1.15-.2;
          float envelope=exp(-q*q),sine=sin(3.14159265*q);
          float depth=clamp((1.+sine*envelope)*.5,0.,1.)*uSheetStrength;
          vec2 local=vMapUv*2.-1.;float dome=(1.-local.x*local.x)*(1.-local.y*local.y);
          depth=clamp(depth+uHover*.1*uPanelSize.y*dome/max(2.*uFrameWidth*.2*(1.+1.1*uActivity),.0001),0.,1.);
          vec3 encoded=diffuseColor.rgb;
          encoded=mix(encoded,vec3(.059),.8*depth*uShadeAmount*(1.-uFlat));
          float derivative=(3.14159265*cos(3.14159265*q)-2.*q*sine)*envelope;
          float slope=-.2*(1.+1.1*uActivity)*derivative*1.15*uSheetStrength;
          float across=min(abs(surfacePosition.x/uFrameWidth),1.);
          slope+=-.12*1.5*(1.-across*across)*uSheetStrength;
          slope+=4.*uHover*.1*uPanelSize.y*local.x*(1.-local.y*local.y)/max(uPanelSize.x,.0001);
          float slopeY=4.*uHover*.1*local.y*(1.-local.x*local.x);
          vec3 normal=normalize(vec3(-slope,-slopeY,1.));
          float roll=-.16*derivative/3.14159265*uSheetStrength;
          normal=vec3(normal.x,normal.y*cos(roll)-normal.z*sin(roll),normal.y*sin(roll)+normal.z*cos(roll));
          normal=mix(normal,vec3(0.,0.,1.),uFlat);
          vec3 light=normalize(vec3(-.4,.5,1.));
          vec3 viewDirection=normalize(vec3(0.,0.,41.18)-surfacePosition);
          float diffuseLight=dot(normal,light)*.5+.5;
          encoded*=1.-.12*uShadeAmount*(1.-diffuseLight);
          encoded+=pow(max(dot(normal,normalize(light+viewDirection)),0.),48.)*.35*uShadeAmount;
          float scrim=1.-smoothstep(0.,.5,vMapUv.y);
          encoded*=1.-.65*scrim*scrim*uScrim;
          diffuseColor.rgb=encoded;
          vec4 caption=texture2D(uCaption,vMapUv);
          diffuseColor.rgb=mix(diffuseColor.rgb,caption.rgb,caption.a*uCaptionPresence);
          vec2 arrowPoint=(vMapUv-uArrowCenter)*uArrowScale;
          float arrowDistance=min(arrowInk(arrowPoint-vec2(uArrow*2.4,0.)),arrowInk(arrowPoint+vec2((1.-uArrow)*2.4,0.)));
          float arrowMask=(1.-smoothstep(.035,.075,arrowDistance))*(1.-smoothstep(.78,.88,length(arrowPoint)))*uCaptionPresence;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.),arrowMask);
          diffuseColor.rgb=uFlightWhite>=0.?mix(diffuseColor.rgb,vec3(1.),uFlightWhite):mix(vec3(1.),diffuseColor.rgb,min(uEnter*1.08,1.));
          diffuseColor.a*=roundedAlpha;
        `,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>
           vec2 roundedP = (vMapUv - 0.5) * vec2(uShapeAspect, 1.0);
           float corner=uCorner;
           vec2 roundedQ = abs(roundedP) - (vec2(uShapeAspect*.5,.5)-corner);
           float roundedD = length(max(roundedQ, 0.0)) + min(max(roundedQ.x, roundedQ.y), 0.0) - corner;
           float roundedAlpha=1.-smoothstep(-max(fwidth(roundedD),.0001),max(fwidth(roundedD),.0001),roundedD);
           if (roundedAlpha < .001) discard;`,
        );
      };
      const mesh = new THREE.Mesh(geometry, material);
      this.scene.add(mesh);
      const link = document.createElement("a");
      link.href = `/projects/${projects[i].id}`;
      link.className = "work-link";
      link.draggable=false;
      link.setAttribute(
        "aria-label",
        `Open ${projects[i].title ?? projects[i].name} project`,
      );
      link.innerHTML = `<span class="sr-only">${projects[i].title ?? projects[i].name}</span>`;
      link.style.opacity = "0";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (event.detail === 0 || this.travel < 8) this.onOpen(projects[i].id);
      });
      link.addEventListener("focus", () => this.goTo(i));
      this.links.append(link);
      this.panels.push({ mesh, original, index: i, link, uniforms, aspect, center: 0, width: 1, height: 1, caption, hover:0,hoverTarget:0,hoverFrom:0,hoverStart:0,arrowStart:0 });
      const motion=galleryMotion(projects[i]);
      if(motion){
        const panel=this.panels.at(-1)!,video=document.createElement('video');panel.video=video;video.dataset.project=projects[i].id;video.dataset.texture='poster';video.muted=true;video.loop=true;video.playsInline=true;video.preload='auto';video.setAttribute('aria-hidden','true');video.style.display='none';this.container.append(video);
        this.mediaReady.push(new Promise<void>(resolve=>{
          video.addEventListener('loadeddata',()=>{if(this.disposed){resolve();return;}const texture=new THREE.VideoTexture(video);texture.colorSpace=THREE.NoColorSpace;panel.videoTexture=texture;resolve();this.wake();},{once:true});video.addEventListener('error',()=>resolve(),{once:true});
        }));
        const frame=()=>{if(this.disposed)return;if(panel.videoTexture&&video.readyState>=2){panel.videoFrameReady=true;video.dataset.frameReady='true';}if(!this.paused&&panel.mesh.visible)this.wake();video.requestVideoFrameCallback(frame);};if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(frame);video.src=motion;
      }
    }

    const surface = this.container.parentElement!;
    const signal = this.abort.signal;
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        this.stop();
      },
      { signal },
    );
    this.renderer.domElement.addEventListener(
      "webglcontextrestored",
      () => {
        for (const panel of this.panels) {
          if (panel.mesh.material.map)
            panel.mesh.material.map.needsUpdate = true;
          panel.caption.needsUpdate=true;
          panel.mesh.material.needsUpdate = true;
        }
        // A paused gallery still has to repaint the background behind the portal.
        this.renderer.render(this.scene, this.camera);
        this.wake();
      },
      { signal },
    );
    surface.addEventListener("wheel", this.wheel, { passive: false, signal });
    surface.addEventListener("pointerdown", this.pointerDown, { signal });
    surface.addEventListener("pointermove", this.pointerMove, { signal });
    surface.addEventListener("pointerleave", () => this.setHover(null), { signal });
    surface.addEventListener("pointerup", this.pointerUp, { signal });
    surface.addEventListener("pointercancel", this.pointerUp, { signal });
    surface.addEventListener("click", this.click, { signal });
    document.addEventListener(
      "visibilitychange",
      () => (document.hidden ? this.stop() : this.wake()),
      { signal },
    );
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.container);
    this.resize();
    for(const panel of this.panels){if(panel.mesh.material.map)this.renderer.initTexture(panel.mesh.material.map);this.renderer.initTexture(panel.caption);}
    this.ready=Promise.all(this.mediaReady).then(()=>this.renderer.compileAsync(this.scene,this.camera)).then(()=>{});
    this.wake();
  }

  startIntro(rectangles: DOMRect[]) {
    this.introRects=rectangles.map(rect=>({left:rect.left,top:rect.top,width:rect.width,height:rect.height}));
    // The first three selected works land left/center/right, in the declared order.
    this.active=Math.min(1,this.panels.length-1);this.row.jump(this.panels[this.active].center);this.onChange(this.active);
    this.started=performance.now();
    this.container.dataset.introStarted=String(this.started);
    this.wake();
  }

  private decorate(source: HTMLCanvasElement, name: string, aspect = 1.75) {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = Math.round(c.width / aspect);
    const ctx = c.getContext("2d")!;
    const cropHeight = source.width / aspect;
    ctx.drawImage(source, 0, (source.height - cropHeight) / 2, source.width, cropHeight, 0, 0, c.width, c.height);
    const optimized = document.createElement("canvas");
    optimized.width = 1024;
    optimized.height = Math.round(1024 / aspect);
    optimized.getContext("2d")!.drawImage(c, 0, 0, optimized.width, optimized.height);
    return optimized;
  }
  private caption(name: string, aspect: number) {
    const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024/aspect);
    const ctx=c.getContext('2d')!;
    const metricsLayout=panelMetrics(innerWidth,innerHeight,aspect),scale=c.width/metricsLayout.width;
    ctx.fillStyle = "#fff";
    ctx.font = `400 ${metricsLayout.font*scale}px "Portfolio Sans", Arial, sans-serif`;
    const metrics=ctx.measureText(name),ascent=metrics.fontBoundingBoxAscent,descent=metrics.fontBoundingBoxDescent;
    const lineHeight=metricsLayout.font*1.4*scale;
    const baseline=c.height-metricsLayout.bottom*scale-(lineHeight-ascent-descent)/2-descent;
    ctx.fillText(name,metricsLayout.padding*scale,baseline);
    ctx.beginPath();
    ctx.arc(c.width-(metricsLayout.padding+metricsLayout.radius)*scale,c.height-(metricsLayout.bottom+metricsLayout.radius)*scale,metricsLayout.radius*scale,0,Math.PI*2);
    ctx.fillStyle = "#050505";
    ctx.fill();
    return c;
  }

  get index() {
    return this.active;
  }
  motionSource(id:string){return this.panels.find(panel=>this.projects[panel.index].id===id)?.video??null;}
  get canvas() {
    return this.renderer.domElement;
  }
  get surface(): PortalSurface {
    return {
      renderer: this.renderer,
      texture: this.backdrop.texture,
      wake: () => this.wake(),
      compose:(scene,camera,now)=>{
        if(this.portal?.active){this.renderer.setRenderTarget(this.backdrop);this.renderer.render(scene,camera);this.renderer.setRenderTarget(null);this.portal.render(now);}else this.renderer.render(scene,camera);
      },
      effectActive:()=>this.portal?.active??false,
      setOverlayActive:active=>this.portal?.setSuspended(!active),
    };
  }
  attachPortal(portal: ChromePortal) {
    this.portal = portal;
    portal.resize();
    this.wake();
  }
  get motion() {
    return this.velocity;
  }
  setSlide(id: string, source: HTMLCanvasElement) {
    const panel = this.panels.find((p) => this.projects[p.index].id === id);
    if (!panel) return;
    panel.nextTexture?.dispose();
    panel.nextTexture = new THREE.CanvasTexture(
      this.decorate(
        source,
        this.projects[panel.index].title ?? this.projects[panel.index].name,
        panel.aspect,
      ),
    );
    panel.nextTexture.colorSpace = THREE.NoColorSpace;
    panel.uniforms.uNextMap.value = panel.nextTexture;
    panel.uniforms.uSlideMix.value = 0;
    this.wake();
  }
  setViewVisible(visible: boolean) {
    if (visible && !this.viewTarget) this.viewAmount = 0;
    this.viewTarget = visible ? 1 : 0;
    this.wake();
  }
  scroll(delta: number) {
    this.row.wheel(delta);
    this.wake();
  }
  drag(delta:number,touch=false,release=false){
    const factor=release?(touch?35:18):(touch?3.25:1.5);
    this.row.push(delta*factor,this.mobile?Infinity:innerWidth);this.wake();
  }
  projectRect(id: string) {
    const panel = this.panels.find((p) => this.projects[p.index].id === id);
    if (!panel?.mesh.visible) return null;
    const positions = panel.mesh.geometry.attributes.position;
    const r = this.container.getBoundingClientRect();
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      const p = this.depthVector
        .fromBufferAttribute(positions, i)
        .project(this.camera);
      const x = (p.x * 0.5 + 0.5) * r.width,
        y = (-p.y * 0.5 + 0.5) * r.height;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    return { left, top, width: right - left, height: bottom - top };
  }
  projectOutline(id:string){
    const panel=this.panels.find(panel=>this.projects[panel.index].id===id);
    if(!panel)return null;
    const metrics=panelMetrics(innerWidth,innerHeight,panel.aspect);
    return roundedOutline(panel.width,panel.height,metrics.corner).map(point=>{
      const world=this.panelPoint(panel,point.x,point.y).project(this.camera);
      return {x:(world.x*.5+.5)*innerWidth,y:(.5-world.y*.5)*innerHeight};
    });
  }
  projectPose(id:string):SheetPose|null{
    const panel=this.panels.find(panel=>this.projects[panel.index].id===id);
    if(!panel)return null;
    const offset=this.wrapOffset(panel.center-this.current),metrics=panelMetrics(innerWidth,innerHeight,panel.aspect);
    const normal=Math.tanh((this.target-this.current)/500);
    return{left:(innerWidth-panel.width)/2+(this.mobile?0:offset),top:(innerHeight-panel.height)/2+(this.mobile?offset:0),width:panel.width,height:panel.height,corner:metrics.corner,strength:this.mobile?0:1,activity:this.velocity,bend:this.mobile?normal*Math.abs(normal)*.22*this.halfHeight*1.3:0,shade:1,white:0,kind:'ribbon',dent:panel.hover};
  }
  flyProject(id:string,from:SheetPose,to:SheetPose,closing=false,bootRects?:DOMRect[],started=performance.now()){
    const index=this.projects.findIndex(project=>project.id===id);if(index<0)return false;
    const secondary=[-1,1].map(direction=>{
      const relatedIndex=(index+direction+this.projects.length)%this.projects.length,bounds=relatedBounds(direction);
      const sheet=flatSheet({left:bounds.x,top:bounds.y,width:bounds.width,height:bounds.height},bounds.radius);
      const bar=bootRects?.[direction<0?0:2],card=bar?{...flatSheet(bar,bar.height/2),kind:'bar' as const}:this.projectPose(this.projects[relatedIndex].id)!;
      return{index:relatedIndex,from:closing?this.interruptedRelated.get(relatedIndex)??sheet:card,to:closing?card:sheet};
    });
    this.flight={index,from,to,start:started,closing,duration:bootRects?1500:1000,intro:!!bootRects,secondary};this.paused=false;this.stop();
    if(closing)this.captionReturnAt=started+1000;
    this.interruptedRelated.clear();
    if(bootRects)this.viewAmount=0;
    this.portal?.setSuspended(false);this.viewTarget=closing?1:0;
    this.setHover(null);this.wake();return true;
  }
  cancelFlight(){this.flight=null;delete this.container.dataset.flight;this.setPaused(this.pauseRequested);}
  captionRect(id:string){
    const panel=this.panels.find(panel=>this.projects[panel.index].id===id);
    if(!panel)return null;
    const metrics=panelMetrics(innerWidth,innerHeight,panel.aspect);
    const world=this.panelPoint(panel,metrics.padding,panel.height-metrics.bottom-metrics.font*1.4);
    const z=world.z,p=world.project(this.camera);
    const scale=ribbonSpec.cameraDistance/(ribbonSpec.cameraDistance-z);
    return {left:(p.x*.5+.5)*innerWidth,top:(.5-p.y*.5)*innerHeight,width:panel.width*.5,height:metrics.font*1.4*scale,fontSize:metrics.font*scale};
  }
  prepareReturn(id:string){
    const panel=this.panels.find(panel=>this.projects[panel.index].id===id);
    if(!panel)return;
    this.row.jump(this.current+this.wrapOffset(panel.center-this.current));
    const paused=this.paused;this.paused=false;this.stop();this.tick(performance.now());this.stop();this.paused=paused;
  }
  beginReturn(id:string){
    const panel=this.panels.find(panel=>this.projects[panel.index].id===id);
    if(!panel)return false;
    this.interruptedRelated.clear();
    if(this.flight){const p=Math.min(1,(performance.now()-this.flight.start)/this.flight.duration),amount=(this.flight.intro?flightProgress:revealProgress)(p);this.flight.secondary.forEach(item=>this.interruptedRelated.set(item.index,blendSheet(item.from,item.to,amount)));}
    this.flight=null;this.pauseRequested=false;this.velocity=0;
    this.row.jump(this.current+this.wrapOffset(panel.center-this.current));
    this.viewTarget=1;this.viewAmount=0;this.returning=panel.index;this.captionReturnAt=performance.now()+1000;
    this.paused=false;this.portal?.setSuspended(false);this.stop();this.setHover(null);this.tick(performance.now());return true;
  }
  move(amount: number) {
    const panel=this.panels[this.active];
    this.target += amount * (panel?(this.mobile?panel.height:panel.width):innerHeight*.435*1.75);
    this.wake();
  }
  goTo(index: number) {
    const delta = this.panels[index].center - this.current;
    this.target = this.current + this.wrapOffset(delta);
    this.wake();
  }
  setPaused(value: boolean) {
    this.pauseRequested=value;this.paused=value&&!this.flight;
    this.portal?.setSuspended(this.paused);
    this.paused ? this.stop() : this.wake();
  }
  private stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.panels.forEach(panel=>panel.video?.pause());
    this.lastTime = 0;
  }
  private wake() {
    if (!this.frame && !this.paused && !this.disposed && !document.hidden)
      this.frame = requestAnimationFrame(this.tick);
  }
  private resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    const scale = Math.min(devicePixelRatio, 1.25);
    this.backdrop.setSize(
      Math.round(width * scale),
      Math.round(height * scale),
    );
    this.camera.aspect = width / height;
    this.camera.position.set(0, 0, ribbonSpec.cameraDistance);
    this.camera.lookAt(0, 0, 0);
    const dimensions = frameSize(width, height);
    this.halfWidth = dimensions.halfWidth;
    this.halfHeight = dimensions.halfHeight;
    this.unit = dimensions.unit;
    this.mobile=width<650;
    let edge = 0;
    for (const panel of this.panels) {
      const metrics=panelMetrics(width,height,panel.aspect);
      panel.height = metrics.height;
      panel.width = metrics.width;
      panel.uniforms.uPanelSize.value.set(panel.width*this.unit,panel.height*this.unit);
      panel.uniforms.uFlat.value=this.mobile?1:0;
      panel.uniforms.uArrowCenter.value.set(1-(metrics.padding+metrics.radius)/panel.width,(metrics.bottom+metrics.radius)/panel.height);
      panel.uniforms.uArrowScale.value.set(panel.width/metrics.radius,panel.height/metrics.radius);
      panel.caption.image=this.caption(this.projects[panel.index].title??this.projects[panel.index].name,panel.aspect);
      panel.caption.needsUpdate=true;
      const extent=this.mobile?panel.height:panel.width;
      panel.center = edge + extent / 2;
      edge += extent + metrics.gap;
    }
    this.circumference = edge;
    const firstCenter = this.panels[0].center;
    for (const panel of this.panels) panel.center -= firstCenter;
    if(this.active>=0)this.row.jump(this.panels[this.active].center);
    this.floor.visible=!this.mobile;
    this.veil.material.uniforms.opacity.value=this.mobile?1:0;
    const halfHeight = dimensions.halfHeight;
    const floorY = -halfHeight * (ribbonSpec.height + .06);
    const run = halfHeight * 6;
    const near = Math.min(ribbonSpec.cameraDistance * (1 - Math.abs(floorY) / halfHeight) + halfHeight * .2, ribbonSpec.cameraDistance * .8);
    this.floor.scale.set(this.halfWidth * 8, 1, near + run);
    this.floor.position.set(0, floorY, (near - run) / 2);
    this.floor.material.uniforms.halfWidth.value = this.halfWidth;
    this.floor.material.uniforms.run.value = run;
    this.floor.material.uniforms.cell.value = halfHeight * .22;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.reflection.setSize(Math.max(1,Math.round(width/10)),Math.max(1,Math.round(height/10)));
    this.reflectionCamera.copy(this.camera);
    this.reflectionCamera.position.y=2*(floorY-halfHeight*.07);
    this.reflectionCamera.updateMatrixWorld();
    this.reflectionMatrix.copy(this.reflectionCamera.matrixWorld).invert().premultiply(this.reflectionCamera.projectionMatrix);
    this.portal?.resize();
    this.wake();
  }
  private wrapOffset(value: number) {
    return ((value + this.circumference / 2) % this.circumference + this.circumference) % this.circumference - this.circumference / 2;
  }
  private wave(x: number, y: number, speed: number, out = new THREE.Vector3(),strength=1) {
    if(this.mobile){
      const amount=Math.tanh((this.target-this.current)/500);
      const normalized=Math.max(-1,Math.min(1,y/this.halfHeight));
      return out.set(x,y,amount*Math.abs(amount)*.22*this.halfHeight*1.3*(1-normalized*normalized)*strength);
    }
    const point = surfacePoint(x, y, this.halfWidth, this.reduced.matches ? 0 : speed,strength);
    return out.set(point.x,point.y,point.z);
  }
  private panelPoint(panel:Panel,x:number,y:number,out=new THREE.Vector3()){
    const offset=this.wrapOffset(panel.center-this.current)*this.unit;
    return this.wave((x-panel.width/2)*this.unit+(this.mobile?0:offset),(panel.height/2-y)*this.unit-(this.mobile?offset:0),this.velocity,out);
  }
  private wheel = (event: WheelEvent) => {
    if (this.paused) return;
    event.preventDefault();
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    this.scroll(delta * (event.deltaMode === 1 ? 18 : 1));
  };
  private pointerDown = (event: PointerEvent) => {
    if (
      this.paused ||
      event.button !== 0 ||
      !event.isPrimary ||
      (event.target as HTMLElement).closest("button")
    )
      return;
    this.dragging = true;
    this.dragEngaged=false;
    this.travel = 0;
    this.downX = this.lastX = event.clientX;
    this.downY = event.clientY;
    this.lastY = event.clientY;
    this.touchDrag = event.pointerType === "touch";
    this.lastMoveTime = event.timeStamp;
    this.dragVelocity = 0;
    if (!(event.target as HTMLElement).closest("a"))
      this.container.parentElement!.setPointerCapture(event.pointerId);
  };
  private pointerMove = (event: PointerEvent) => {
    if (this.paused) return;
    if (this.dragging) {
      this.travel = Math.hypot(
        event.clientX - this.downX,
        event.clientY - this.downY,
      );
      const vertical = this.mobile || (
        this.touchDrag &&
        Math.abs(event.clientY - this.downY) >
          Math.abs(event.clientX - this.downX));
      if(!this.dragEngaged){
        const along=Math.abs(vertical?event.clientY-this.downY:event.clientX-this.downX),across=Math.abs(vertical?event.clientX-this.downX:event.clientY-this.downY);
        if(along<=10||along<=across)return;
        this.dragEngaged=true;this.lastX=event.clientX;this.lastY=event.clientY;this.lastMoveTime=event.timeStamp;
        this.container.parentElement!.classList.add('is-dragging');this.container.parentElement!.style.cursor='grabbing';this.wake();return;
      }
      const displacement = -(vertical ? event.clientY - this.lastY : event.clientX - this.lastX) * (this.touchDrag ? 3.25 : 1.5);
      this.dragVelocity = displacement;
      this.row.push(displacement, this.mobile?Infinity:innerWidth);
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.lastMoveTime = event.timeStamp;
    } else if (event.timeStamp - this.lastHover > 45) {
      this.lastHover = event.timeStamp;
      const r = this.container.getBoundingClientRect();
      this.raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          (-(event.clientY - r.top) / r.height) * 2 + 1,
        ),
        this.camera,
      );
      const hit = this.raycaster.intersectObjects(
        this.panels.filter((p) => p.mesh.visible).map((p) => p.mesh),
        false,
      )[0];
      if(!this.mobile)this.setHover(hit ? this.panels.find(panel=>panel.mesh===hit.object)! : null);
      this.container.parentElement!.style.cursor = hit ? "pointer" : "grab";
    }
    this.wake();
  };
  private setHover(active: Panel | null) {
    for(const panel of this.panels){
      const next=panel===active?1:0;
      if(next!==panel.hoverTarget){panel.hoverTarget=next;panel.hoverFrom=panel.hover;panel.hoverStart=performance.now();panel.arrowStart=performance.now();}
    }
    this.wake();
  }
  private pointerUp = (event: PointerEvent) => {
    if (
      this.dragging &&
      this.dragEngaged && this.travel > 10 &&
      event.timeStamp - this.lastMoveTime < 100 &&event.type!=='pointercancel'
    )
      this.row.push(this.dragVelocity * (this.touchDrag ? 35/3.25 : 12), this.mobile?Infinity:innerWidth);
    this.dragging = false;
    this.container.parentElement!.classList.remove("is-dragging");
    this.container.parentElement!.style.cursor = "grab";
    this.wake();
  };
  private click = (event: MouseEvent) => {
    if (
      this.paused ||
      this.travel > 8 ||
      (event.target as HTMLElement).closest("a,button")
    )
      return;
    const r = this.container.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        (-(event.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = this.raycaster.intersectObjects(
      this.panels.filter((p) => p.mesh.visible).map((p) => p.mesh),
    )[0];
    if (hit)
      this.onOpen(
        this.projects[this.panels.find((p) => p.mesh === hit.object)!.index].id,
      );
  };
  private tick = (now: number) => {
    this.frame = 0;
    if (this.paused || this.disposed) return;
    const dt = Math.min((now - (this.lastTime || now - 16)) / 1000, 0.05);
    this.lastTime = now;
    const introSeconds=(now-this.started)/1000;
    this.entered=flightProgress(introSeconds/1.5);
    this.container.dataset.intro=introSeconds>=1.6?'settled':'running';
    this.viewAmount = THREE.MathUtils.damp(
      this.viewAmount,
      this.viewTarget,
      5,
      dt,
    );
    this.row.step(dt, this.mobile?Infinity:innerWidth, this.reduced.matches);
    this.velocity = this.row.activity;
    const r = this.container.getBoundingClientRect();
    const flight=this.flight,flightElapsed=flight?Math.max(0,now-flight.start):0,flightTime=flight?Math.min(1,flightElapsed/flight.duration):0;
    const flightAmount=flight?(flight.intro?flightProgress(flightTime):revealProgress(flightTime)):0;
    const primaryPose=flight?blendSheet(flight.from,flight.to,flightAmount):null;
    const sheetFrame={...frameSize(r.width,r.height),width:r.width,height:r.height};
    if(flight)this.container.dataset.flight=JSON.stringify({project:this.projects[flight.index].id,started:flight.start,progress:flightTime,white:primaryPose!.white,strength:primaryPose!.strength,width:primaryPose!.width,height:primaryPose!.height,closing:flight.closing,intro:flight.intro,secondary:flight.secondary.length});
    for (const panel of this.panels) {
      const primary=!!flight&&panel.index===flight.index,secondary=flight?.secondary.find(item=>item.index===panel.index);
      const flying=primary||!!secondary,pose=primary?primaryPose:secondary?blendSheet(secondary.from,secondary.to,flightAmount):null;
      const order=panel.index<3?panel.index:-1;
      const rectangle=this.introRects[order];
      const arrival=rectangle?flightProgress((introSeconds-order*.05)/1.5):this.entered;
      const hoverTime=THREE.MathUtils.clamp((now-panel.hoverStart)/500,0,1);
      panel.hover=panel.hoverFrom+(panel.hoverTarget-panel.hoverFrom)*(hoverTime===1?1:1-Math.pow(2,-10*hoverTime));
      panel.uniforms.uEnter.value = arrival;
      panel.uniforms.uSheetStrength.value=arrival;panel.uniforms.uShadeAmount.value=arrival;
      panel.uniforms.uFlightWhite.value=-1;panel.uniforms.uScrim.value=1;
      panel.mesh.renderOrder=primary?5:secondary?4:0;panel.mesh.material.depthTest=!flying;
      const initialWidth=rectangle?.width??panel.width,initialHeight=rectangle?.height??panel.height;
      const currentWidth=THREE.MathUtils.lerp(initialWidth,panel.width,arrival),currentHeight=THREE.MathUtils.lerp(initialHeight,panel.height,arrival);
      panel.uniforms.uShapeAspect.value=currentWidth/currentHeight;
      const metrics=panelMetrics(r.width,r.height,panel.aspect);
      panel.uniforms.uCorner.value=THREE.MathUtils.lerp(initialHeight*.5,metrics.corner,arrival)/currentHeight;
      panel.uniforms.uFrameWidth.value=this.halfWidth;
      panel.uniforms.uActivity.value=this.velocity;
      panel.uniforms.uHover.value=panel.hover;
      const arrowTime=THREE.MathUtils.clamp((now-panel.arrowStart)/750,0,1);
      panel.uniforms.uArrow.value=panel.arrowStart?arrowTime===1?1:1-Math.pow(2,-10*arrowTime):0;
      panel.uniforms.uCaptionPresence.value=THREE.MathUtils.clamp((now-this.started-750)/750,0,1);
      if(panel.index===this.returning&&now<this.captionReturnAt)panel.uniforms.uCaptionPresence.value=0;
      if(flying){
        panel.uniforms.uEnter.value=1;panel.uniforms.uFlightWhite.value=pose!.white;
        panel.uniforms.uSheetStrength.value=pose!.strength;panel.uniforms.uShadeAmount.value=pose!.shade;
        panel.uniforms.uShapeAspect.value=pose!.width/pose!.height;panel.uniforms.uCorner.value=pose!.corner/pose!.height;
        panel.uniforms.uPanelSize.value.set(pose!.width*this.unit,pose!.height*this.unit);
        panel.uniforms.uHover.value=pose!.dent??0;panel.uniforms.uActivity.value=pose!.activity;panel.uniforms.uCaptionPresence.value=0;
        panel.uniforms.uScrim.value=flight!.closing?1:Math.pow(.85,flightElapsed/1000*60);
      }else panel.uniforms.uPanelSize.value.set(panel.width*this.unit,panel.height*this.unit);
      if (panel.nextTexture) {
        panel.uniforms.uSlideMix.value = Math.min(
          1,
          panel.uniforms.uSlideMix.value + dt * 0.85,
        );
        if (panel.uniforms.uSlideMix.value >= 1) {
          panel.mesh.material.map?.dispose();
          panel.mesh.material.map = panel.nextTexture;
          panel.nextTexture = undefined;
          panel.uniforms.uSlideMix.value = 0;
        }
      }
      panel.uniforms.uZoom.value = 1;
      const baseOffset = this.wrapOffset(panel.center - this.current);
      const d = baseOffset / (this.mobile?panel.height:panel.width);
      const offset = baseOffset * this.unit;
      panel.mesh.visible = flying||!!rectangle&&arrival<1||Math.abs(baseOffset) < (this.mobile?r.height*1.2+panel.height/2:r.width*1.2+panel.width/2);
      if(panel.video){
        if(panel.mesh.visible&&introSeconds>=1.65&&this.viewTarget&&!document.hidden){if(panel.video.paused)void panel.video.play().catch(()=>{});}else panel.video.pause();
        // loadeddata alone does not guarantee an uploaded, nontransparent video frame.
        // Retain the opaque poster through the complete three-bar handoff.
        if(introSeconds>=1.65&&panel.videoFrameReady&&panel.videoTexture&&panel.mesh.material.map!==panel.videoTexture){
          const poster=panel.mesh.material.map;panel.videoTexture.needsUpdate=true;this.renderer.initTexture(panel.videoTexture);
          panel.mesh.material.map=panel.videoTexture;panel.mesh.material.needsUpdate=true;panel.uniforms.uNextMap.value=panel.videoTexture;panel.video.dataset.texture='video';poster?.dispose();
        }
      }
      if(!flying&&!rectangle&&introSeconds<1.15)panel.mesh.visible=false;
      if (!panel.mesh.visible) {
        panel.link.style.opacity = "0";
        panel.link.style.pointerEvents = "none";
        panel.link.tabIndex = -1;
        panel.link.setAttribute("aria-hidden", "true");
        continue;
      }
      const positions = panel.mesh.geometry.attributes.position;
      for (let v = 0; v < positions.count; v++) {
        if(flying){const point=sheetWorldPoint(pose!,panel.original[v*3]+.5,.5-panel.original[v*3+1],sheetFrame);positions.setXYZ(v,point.x,point.y,point.z);continue;}
        const point = this.panelPoint(panel,(panel.original[v*3]+.5)*panel.width,(.5-panel.original[v*3+1])*panel.height,this.depthVector);
        const nx=panel.original[v*3]*2,ny=panel.original[v*3+1]*2;
        if(rectangle&&arrival<1){
          const fromX=(rectangle.left+rectangle.width*(panel.original[v*3]+.5)-r.width/2)*this.unit;
          const fromY=(r.height/2-rectangle.top-rectangle.height*(.5-panel.original[v*3+1]))*this.unit;
          const flatX=panel.original[v*3]*panel.width*this.unit+(this.mobile?0:offset),flatY=panel.original[v*3+1]*panel.height*this.unit-(this.mobile?offset:0);
          this.wave(THREE.MathUtils.lerp(fromX,flatX,arrival),THREE.MathUtils.lerp(fromY,flatY,arrival),this.velocity,point,arrival);
        }
        point.z-=panel.hover*.1*panel.height*this.unit*(1-nx*nx)*(1-ny*ny);
        positions.setXYZ(v, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;
      panel.mesh.geometry.computeBoundingSphere();
      panel.mesh.material.color.setScalar(1);
      panel.mesh.material.opacity = flying?(primary?1:1-.7*(flight!.intro?flightAmount:pose!.white)):(panel.index===this.returning?1:this.viewAmount)*(rectangle?1:THREE.MathUtils.clamp((introSeconds-1.15)/.5,0,1));
      const p = this.panelPoint(panel,panel.width-metrics.padding-metrics.radius,panel.height-metrics.bottom-metrics.radius).project(
        this.camera,
      );
      panel.link.style.transform = `translate3d(${(p.x * 0.5 + 0.5) * r.width}px,${(-p.y * 0.5 + 0.5) * r.height}px,0) translate(-50%,-50%)`;
      const visible = Math.abs(d) < 1.65 && p.z < 1 && this.entered > 0.94;
      panel.link.style.opacity = visible ? "1" : "0";
      panel.link.style.pointerEvents = visible ? "auto" : "none";
      panel.link.tabIndex = Math.abs(d) < 0.8 ? 0 : -1;
      panel.link.setAttribute("aria-hidden", visible ? "false" : "true");
    }
    let next = 0, closest = Infinity;
    for (const panel of this.panels) {
      const distance = Math.abs(this.wrapOffset(panel.center - this.current));
      if (distance < closest) { closest = distance; next = panel.index; }
      panel.link.dataset.baseX = String(panel.center - this.current);
    }
    this.container.dataset.scrollX = String(this.current);
    this.container.dataset.activity = String(this.velocity);
    if (next !== this.active) {
      this.active = next;
      this.onChange(next);
    }
    const groundArrival=THREE.MathUtils.clamp((introSeconds-.9)/1.1,0,1);
    this.floor.material.uniforms.opacity.value = (1-Math.pow(1-groundArrival,3)) * this.viewAmount * .9;
    this.veil.material.uniforms.opacity.value=this.mobile?this.viewAmount:0;
    if(!this.mobile&&this.floor.material.uniforms.opacity.value>.01){
      this.floor.visible=false;
      const captions=this.panels.map(panel=>panel.uniforms.uCaptionPresence.value);
      this.panels.forEach(panel=>{panel.uniforms.uCaptionPresence.value=0;});
      this.renderer.setRenderTarget(this.reflection);this.renderer.render(this.scene,this.reflectionCamera);this.renderer.setRenderTarget(null);
      this.panels.forEach((panel,index)=>{panel.uniforms.uCaptionPresence.value=captions[index];});
      this.floor.visible=true;
    }
    if (this.portal?.active) {
      this.renderer.setRenderTarget(this.backdrop);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.portal.render(now);
    } else this.renderer.render(this.scene, this.camera);
    if(flight&&flightTime===1){this.flight=null;delete this.container.dataset.flight;this.setPaused(this.pauseRequested);}
    const unsettled = this.row.active;
    if(this.returning>=0&&now>=this.captionReturnAt&&Math.abs(this.viewAmount-this.viewTarget)<.001)this.returning=-1;
    if (this.flight || unsettled || this.dragging || now-this.started<2000 || this.portal?.active || Math.abs(this.viewAmount-this.viewTarget)>.001 || this.panels.some(panel=>Math.abs(panel.hover-panel.hoverTarget)>.001||now-panel.arrowStart<750)) this.wake();
    else this.lastTime = 0;
  };
  dispose() {
    this.disposed = true;
    this.stop();
    this.abort.abort();
    this.observer.disconnect();
    for (const p of this.panels) {
      p.mesh.geometry.dispose();
      p.mesh.material.map?.dispose();
      if(p.videoTexture!==p.mesh.material.map)p.videoTexture?.dispose();
      p.nextTexture?.dispose();
      p.caption.dispose();
      p.mesh.material.dispose();
      if(p.video){p.video.pause();p.video.removeAttribute('src');p.video.load();p.video.remove();}
    }
    this.floor.geometry.dispose();
    this.veil.geometry.dispose();this.veil.material.dispose();
    this.backdrop.dispose();
    this.reflection.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
