import * as THREE from 'three';

const vertex=`varying vec2 texUv;uniform float bulge,halfHeight;void main(){texUv=uv;vec4 w=modelMatrix*vec4(position,1.);float y=clamp(w.y/halfHeight,-1.,1.);w.z+=bulge*(1.-y*y);gl_Position=projectionMatrix*viewMatrix*w;}`;
const stroke=`float line(vec2 p,vec2 a,vec2 b,float width){vec2 d=b-a;float t=clamp(dot(p-a,d)/max(dot(d,d),.000001),0.,1.);float distance=length(p-a-d*t)-width*.5;return 1.-smoothstep(-max(fwidth(distance),.0001),max(fwidth(distance),.0001),distance);}
float delayed(float t,float lag){return clamp((t-lag)/(1.-lag),0.,1.);}
float crossStroke(vec2 p,vec2 direction,float t,float width){return line(p,direction*(.95*t-.12*(1.+.5*abs(t))),direction*(.95*t+.12*(1.+.5*abs(t))),width);}
float arrowStroke(vec2 p,vec2 a,vec2 b,vec2 direction,float o,float i,float width){return max(line(p,a+direction*.95*o,b+direction*.95*o,width),line(p,a+direction*.95*(i-1.),b+direction*.95*(i-1.),width));}`;

type Ink={element:HTMLElement;mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;pill:boolean;padding:number};
type Control=Ink&{hover:number;from:number;target:number;time:number;out:number;incoming:number;outFrom:number;inFrom:number};

/** Measured native layout supplies accessible text; its visible ink follows the media sheet. */
export class DetailFurniture {
  private ink:Ink[]=[];private controls:Control[]=[];private textures:THREE.CanvasTexture[]=[];
  private abort=new AbortController();private unit=1;private halfHeight=1;
  constructor(private dialog:HTMLDialogElement,private scene:THREE.Scene,private wake:()=>void){
    const canHover=matchMedia('(hover:hover) and (pointer:fine)').matches;
    const cache=new Map<string,THREE.CanvasTexture>();
    for(const element of dialog.querySelectorAll<HTMLElement>('h2,.project-summary,.project-credits > span')){
      const bounds=element.getBoundingClientRect(),style=getComputedStyle(element),pill=element.matches('.project-credits > span'),ratio=2,padding=2;
      const key=[element.textContent,style.font,style.color,bounds.width,bounds.height].join('|');let texture=cache.get(key);
      if(!texture){
        const canvas=document.createElement('canvas');canvas.width=Math.ceil((bounds.width+padding*2)*ratio);canvas.height=Math.ceil((bounds.height+padding*2)*ratio);const ctx=canvas.getContext('2d')!;ctx.scale(ratio,ratio);ctx.fillStyle=style.color;ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.textBaseline='alphabetic';ctx.letterSpacing='0px';
        const metrics=ctx.measureText('Mg'),font=parseFloat(style.fontSize),ascent=metrics.fontBoundingBoxAscent??font*.8,descent=metrics.fontBoundingBoxDescent??font*.2;
        const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),range=document.createRange();let node:Node|null;
        while(node=walker.nextNode()){const text=node.textContent||'';for(let i=0;i<text.length;){const character=String.fromCodePoint(text.codePointAt(i)!);range.setStart(node,i);i+=character.length;range.setEnd(node,i);if(/\s/.test(character))continue;const r=range.getBoundingClientRect();if(!r.width)continue;ctx.fillText(style.textTransform==='uppercase'?character.toUpperCase():character,r.left-bounds.left+padding,r.top-bounds.top+padding+(r.height-ascent-descent)/2+ascent);}}
        texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;cache.set(key,texture);this.textures.push(texture);
      }
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,32,8),new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,vertexShader:vertex,
        uniforms:{image:{value:texture},bulge:{value:0},halfHeight:{value:1},pill:{value:pill?1:0},size:{value:new THREE.Vector2(bounds.width,bounds.height)},padding:{value:padding},opacity:{value:1}},
        fragmentShader:`varying vec2 texUv;uniform sampler2D image;uniform float pill,padding,opacity;uniform vec2 size;void main(){vec4 ink=texture2D(image,texUv);if(pill>.5){vec2 q=(texUv-.5)*(size+padding*2.);float r=size.y*.5;float d=length(vec2(max(abs(q.x)-(size.x*.5-r),0.),q.y))-r;float edge=1.-smoothstep(-max(fwidth(d),.001),max(fwidth(d),.001),d);vec3 color=mix(vec3(.933333),ink.rgb,ink.a);gl_FragColor=vec4(color,max(ink.a,edge));}else gl_FragColor=ink;gl_FragColor.a*=opacity;}`,
      }));mesh.frustumCulled=false;mesh.renderOrder=4;this.scene.add(mesh);this.ink.push({element,mesh,pill,padding});
    }
    for(const element of dialog.querySelectorAll<HTMLElement>('.project-outbound,.project-close')){
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,vertexShader:vertex,
        uniforms:{bulge:{value:0},halfHeight:{value:1},hover:{value:0},outgoing:{value:0},incoming:{value:0},width:{value:2/element.getBoundingClientRect().height},cross:{value:element.matches('.project-close')?1:0},opacity:{value:1}},
        fragmentShader:`varying vec2 texUv;uniform float hover,outgoing,incoming,width,cross,opacity;${stroke}
        void main(){vec2 p=texUv-.5;float d=length(p)-.5,aa=max(fwidth(d),.0001),outline=1.-smoothstep(-aa,aa,d);float disc=1.-smoothstep(-aa,aa,length(p)-mix(-.02,.5,hover));float inner=1.-smoothstep(-aa,aa,d+width);float mark=0.;
        if(cross>.5){for(int j=0;j<2;j++){float lag=float(j)*.16;vec2 direction=normalize(vec2(j==0?1.:-1.,1.));float o=delayed(outgoing,lag),i=delayed(incoming,lag);mark=max(mark,max(crossStroke(p,direction,o,width),crossStroke(p,direction,i-1.,width)));}}
        else{vec2 direction=vec2(.70710678),tip=direction*.17;mark=arrowStroke(p,-tip,tip,direction,delayed(outgoing,.44),incoming,width);mark=max(mark,arrowStroke(p,tip-vec2(.11,0.),tip,vec2(1.,0.),delayed(outgoing,.22),delayed(incoming,.22),width));mark=max(mark,arrowStroke(p,tip-vec2(0.,.11),tip,vec2(0.,1.),outgoing,delayed(incoming,.44),width));}
        mark*=outline;float alpha=max(outline*(1.-disc*inner),mark);gl_FragColor=vec4(vec3((1.-disc)*mark),alpha*opacity);}`,
      }));mesh.frustumCulled=false;mesh.renderOrder=5;this.scene.add(mesh);
      const control:Control={element,mesh,pill:true,padding:0,hover:0,from:0,target:0,time:0,out:0,incoming:0,outFrom:0,inFrom:0};this.controls.push(control);
      if(canHover&&element.matches(':hover,:focus-visible')){control.target=1;control.time=performance.now();}
      const enter=(target:number)=>{control.from=control.hover;control.outFrom=control.out;control.inFrom=control.incoming;control.target=target;control.time=performance.now();this.wake();};
      element.addEventListener('pointerenter',()=>canHover&&enter(1),{signal:this.abort.signal});element.addEventListener('pointerleave',()=>enter(0),{signal:this.abort.signal});element.addEventListener('focus',()=>canHover&&enter(1),{signal:this.abort.signal});element.addEventListener('blur',()=>enter(0),{signal:this.abort.signal});
    }
  }
  update(bulge:number,unit:number,halfHeight:number,now:number,opacity=1){
    this.unit=unit;this.halfHeight=halfHeight;
    for(const ink of [...this.ink,...this.controls]){
      const r=ink.element.getBoundingClientRect();ink.mesh.visible=r.bottom>-200&&r.top<innerHeight+200;
      if(!ink.mesh.visible)continue;ink.mesh.position.set((r.left+r.width/2-innerWidth/2)*unit,(innerHeight/2-r.top-r.height/2)*unit,0);ink.mesh.scale.set((r.width+ink.padding*2)*unit,(r.height+ink.padding*2)*unit,1);ink.mesh.material.uniforms.bulge.value=ink.pill?0:bulge;ink.mesh.material.uniforms.halfHeight.value=halfHeight;ink.mesh.material.uniforms.opacity.value=opacity;
    }
    const expo=(time:number,duration:number)=>{const t=Math.min(1,time/duration);return t===1?1:1-Math.pow(2,-10*t);};
    for(const control of this.controls){const elapsed=now-control.time;control.hover=control.from+(control.target-control.from)*expo(elapsed,control.target?700:500);control.out=control.outFrom+(control.target-control.outFrom)*expo(elapsed,control.target?750:1000);control.incoming=control.inFrom+(control.target-control.inFrom)*expo(elapsed,control.target?1000:750);const u=control.mesh.material.uniforms;u.hover.value=control.hover;u.outgoing.value=control.out;u.incoming.value=control.incoming;}
  }
  get active(){return this.controls.some(control=>Math.abs(control.hover-control.target)+Math.abs(control.out-control.target)+Math.abs(control.incoming-control.target)>.0001);}
  dispose(){this.abort.abort();[...this.ink,...this.controls].forEach(({mesh})=>{mesh.geometry.dispose();mesh.material.dispose();this.scene.remove(mesh);});this.textures.forEach(texture=>texture.dispose());}
}
