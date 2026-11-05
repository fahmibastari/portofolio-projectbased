import * as THREE from 'three';

/** Visible ink in the scene; native text and links keep selection and keyboard semantics. */
export class PortalCopy {
  readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private element:HTMLElement|null=null;
  private texture?:THREE.CanvasTexture;
  constructor(){
    this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
      transparent:true,depthTest:false,depthWrite:false,uniforms:{image:{value:null},alpha:{value:1},hoverBox:{value:new THREE.Vector4(-1,-1,0,0)},hovered:{value:0}},
      vertexShader:`varying vec2 texUv;void main(){texUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader:`varying vec2 texUv;uniform sampler2D image;uniform float alpha,hovered;uniform vec4 hoverBox;void main(){vec4 ink=texture2D(image,texUv);float inside=step(hoverBox.x,texUv.x)*step(texUv.x,hoverBox.x+hoverBox.z)*step(hoverBox.y,texUv.y)*step(texUv.y,hoverBox.y+hoverBox.w);gl_FragColor=vec4(ink.rgb*(1.-.4*inside*hovered),ink.a*alpha);}`,
    }));this.mesh.frustumCulled=false;this.mesh.renderOrder=4;this.mesh.visible=false;
  }
  set(element:HTMLElement|null){
    this.element?.removeAttribute('data-portal-rendered');this.element=element;
    this.rebuild();
  }
  rebuild(){
    const root=this.element;if(!root?.isConnected){this.mesh.visible=false;return;}
    const ratio=Math.min(2,Math.max(1,devicePixelRatio*1.5)),canvas=document.createElement('canvas');canvas.width=Math.ceil(innerWidth*ratio);canvas.height=Math.ceil(innerHeight*ratio);
    const ctx=canvas.getContext('2d')!;ctx.scale(ratio,ratio);ctx.textBaseline='alphabetic';
    for(const element of root.querySelectorAll<HTMLElement>(':scope > p,.profile-social a')){
      const style=getComputedStyle(element),font=parseFloat(style.fontSize);ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.fillStyle=element.matches('.profile-social a')?'#fff':style.color;ctx.letterSpacing='0px';
      const metrics=ctx.measureText('Mg'),ascent=metrics.fontBoundingBoxAscent??font*.8,descent=metrics.fontBoundingBoxDescent??font*.2;
      const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),range=document.createRange();let node:Node|null;
      while(node=walker.nextNode()){
        const text=node.textContent||'';
        for(let i=0;i<text.length;){const character=String.fromCodePoint(text.codePointAt(i)!);range.setStart(node,i);i+=character.length;range.setEnd(node,i);if(/\s/.test(character))continue;
          const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;
          const ink=style.textTransform==='uppercase'?character.toUpperCase():character;
          ctx.fillText(ink,r.left,r.top+(r.height-ascent-descent)/2+ascent);
        }
      }
    }
    this.texture?.dispose();this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.NoColorSpace;this.mesh.material.uniforms.image.value=this.texture;
    root.dataset.portalRendered='true';this.mesh.visible=true;
  }
  update(){this.mesh.visible=!!this.element?.isConnected;this.mesh.material.uniforms.alpha.value=this.element?.isConnected?parseFloat(getComputedStyle(this.element).opacity):0;const link=this.element?.querySelector('.profile-social a:hover');this.mesh.material.uniforms.hovered.value=link?1:0;if(link){const r=link.getBoundingClientRect();this.mesh.material.uniforms.hoverBox.value.set(r.x/innerWidth,1-r.bottom/innerHeight,r.width/innerWidth,r.height/innerHeight);}}
  dispose(){this.set(null);this.texture?.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
