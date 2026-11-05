import * as THREE from 'three';

/** Native email editing with visible form pixels in the foreground-figure composition. */
export class PortalForm {
  readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private element:HTMLFormElement|null=null;private texture?:THREE.CanvasTexture;private abort?:AbortController;
  constructor(private wake:()=>void){
    this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,
      uniforms:{image:{value:null},alpha:{value:1},bounds:{value:new THREE.Vector4()}},
      vertexShader:`varying vec2 texUv;uniform vec4 bounds;void main(){texUv=uv;gl_Position=vec4(position.xy*bounds.zw+bounds.xy,0.,1.);}`,
      fragmentShader:`varying vec2 texUv;uniform sampler2D image;uniform float alpha;void main(){vec4 color=texture2D(image,texUv);gl_FragColor=vec4(color.rgb,color.a*alpha);}`,
    }));this.mesh.frustumCulled=false;this.mesh.renderOrder=4;this.mesh.visible=false;
  }
  set(element:HTMLFormElement|null){
    this.abort?.abort();this.element?.removeAttribute('data-portal-form');this.element=element;
    if(element){this.abort=new AbortController();for(const type of['input','change','select','keyup','pointerup','focusin','focusout'])element.addEventListener(type,()=>this.rebuild(),{signal:this.abort.signal});}
    this.rebuild();
  }
  rebuild(){
    const form=this.element;if(!form?.isConnected){this.mesh.visible=false;return;}
    const input=form.querySelector('input')!,button=form.querySelector('button')!,r=form.getBoundingClientRect(),field=input.getBoundingClientRect(),action=button.getBoundingClientRect(),ratio=Math.min(2,Math.max(1,devicePixelRatio*1.5));
    if(!r.width||!r.height)return;
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(r.width*ratio);canvas.height=Math.ceil(r.height*ratio);const ctx=canvas.getContext('2d')!;ctx.scale(ratio,ratio);
    const x=field.x-r.x,y=field.y-r.y,w=field.width,h=field.height;
    const path=(px:number,py:number,pw:number,ph:number,radius:number)=>{ctx.beginPath();ctx.roundRect(px,py,pw,ph,radius);};
    path(x,y,w,h,h/2);ctx.fillStyle='#fff';ctx.fill();path(x+2,y+2,w-4,h-4,(h-4)/2);ctx.fillStyle='#000';ctx.fill();
    const style=getComputedStyle(input);ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle=input.value?style.color:getComputedStyle(input,'::placeholder').color;
    const metrics=ctx.measureText('Mg'),font=parseFloat(style.fontSize),ascent=metrics.fontBoundingBoxAscent??font*.8,descent=metrics.fontBoundingBoxDescent??font*.2;
    ctx.save();path(x+2,y+2,w-4,h-4,(h-4)/2);ctx.clip();ctx.fillText(input.value||input.placeholder,x+w/2-input.scrollLeft,y+h/2+(ascent-descent)/2);ctx.restore();
    const bx=action.x-r.x,by=action.y-r.y,bw=action.width,bh=action.height;path(bx,by,bw,bh,bh/2);ctx.fillStyle='#fff';ctx.fill();
    const svg=button.querySelector('svg')!,size=svg.getBoundingClientRect().width||20,s=size/24,cx=bx+bw/2-size/2,cy=by+bh/2-size/2;ctx.strokeStyle='#000';ctx.lineWidth=2.2*s;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(cx+4*s,cy+12*s);ctx.lineTo(cx+19*s,cy+12*s);ctx.moveTo(cx+13*s,cy+6*s);ctx.lineTo(cx+19*s,cy+12*s);ctx.lineTo(cx+13*s,cy+18*s);ctx.stroke();
    this.texture?.dispose();this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.NoColorSpace;this.mesh.material.uniforms.image.value=this.texture;this.mesh.material.uniforms.bounds.value.set((r.x+r.width/2)/innerWidth*2-1,1-(r.y+r.height/2)/innerHeight*2,r.width/innerWidth,r.height/innerHeight);
    form.dataset.portalForm='true';this.mesh.visible=true;
    this.wake();
  }
  update(){this.mesh.visible=!!this.element?.isConnected;this.mesh.material.uniforms.alpha.value=this.element?.isConnected?parseFloat(getComputedStyle(this.element.parentElement!).opacity):0;}
  dispose(){this.set(null);this.texture?.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
