import * as THREE from 'three';
import {relatedBounds} from './project-transition';
import type {ScrubFrame} from './detail-scrub';

export class DetailSheets {
  private meshes:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>[]=[];
  private abort=new AbortController();
  private lifts=[{from:.3,to:.3,start:0},{from:.3,to:.3,start:0}];
  constructor(private scene:THREE.Scene,private dialog:HTMLDialogElement,wake:()=>void){
    for(let i=0;i<3;i++){
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1,32,24),new THREE.ShaderMaterial({
        transparent:true,depthTest:false,depthWrite:false,uniforms:{bulge:{value:0},halfHeight:{value:1},aspect:{value:1},corner:{value:0},alpha:{value:i? .3:1}},
        vertexShader:`varying vec2 texUv;uniform float bulge,halfHeight;void main(){texUv=uv;vec4 w=modelMatrix*vec4(position,1.);float y=clamp(w.y/halfHeight,-1.,1.);w.z+=bulge*(1.-y*y);gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader:`varying vec2 texUv;uniform float aspect,corner,alpha;void main(){vec2 q=abs((texUv-.5)*vec2(aspect,1.))-(vec2(aspect,1.)*.5-corner);float d=length(max(q,0.))+min(max(q.x,q.y),0.)-corner;float edge=1.-smoothstep(-max(fwidth(d),.0001),max(fwidth(d),.0001),d);gl_FragColor=vec4(vec3(1.),alpha*edge);}`,
      }));mesh.frustumCulled=false;mesh.renderOrder=i?0:1;this.meshes.push(mesh);scene.add(mesh);
    }
    if(matchMedia('(hover:hover) and (pointer:fine)').matches){
      for(const [index,selector] of ['#previous-project','#next-project'].entries()){
        const button=dialog.querySelector<HTMLElement>(selector)!;
        const set=(to:number)=>{this.lifts[index]={from:this.meshes[index+1].material.uniforms.alpha.value,to,start:performance.now()};wake();};
        button.addEventListener('pointerenter',()=>set(1),{signal:this.abort.signal});button.addEventListener('pointerleave',()=>set(.3),{signal:this.abort.signal});
        if(button.matches(':hover'))set(1);
      }
    }
  }
  update(panel:DOMRect,radius:number,bulge:number,unit:number,halfHeight:number,scrub?:ScrubFrame){
    this.meshes.forEach((mesh,index)=>{
      const rect=index?scrub?{...(index===1?scrub.previous:scrub.next),radius}:relatedBounds(index===1?-1:1):{x:panel.x,y:panel.y,width:panel.width,height:panel.height,radius};
      mesh.visible=rect.width>0&&rect.height>0;
      mesh.position.set((rect.x+rect.width/2-innerWidth/2)*unit,(innerHeight/2-rect.y-rect.height/2)*unit,0);mesh.scale.set(rect.width*unit,rect.height*unit,1);
      const u=mesh.material.uniforms;u.bulge.value=bulge;u.halfHeight.value=halfHeight;u.aspect.value=rect.width/Math.max(rect.height,.001);u.corner.value=rect.radius/Math.max(rect.height,.001);
      if(index){const lift=this.lifts[index-1],p=Math.min(1,(performance.now()-lift.start)/400);u.alpha.value=lift.from+(lift.to-lift.from)*(1-(1-p)**3);}
      if(scrub)u.alpha.value=index===0?scrub.mainAlpha:index===1?scrub.previousAlpha:scrub.nextAlpha;
      else if(index===0)u.alpha.value=1;
    });
    this.dialog.dataset.relatedAlpha=this.meshes.slice(1).map(mesh=>mesh.material.uniforms.alpha.value.toFixed(3)).join(',');
  }
  get active(){return this.lifts.some((lift,index)=>Math.abs(this.meshes[index+1].material.uniforms.alpha.value-lift.to)>.0001);}
  dispose(){this.abort.abort();delete this.dialog.dataset.relatedAlpha;for(const mesh of this.meshes){mesh.geometry.dispose();mesh.material.dispose();this.scene.remove(mesh);}}
}
