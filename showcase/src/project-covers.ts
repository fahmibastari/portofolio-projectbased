/** Deliberate crops of Fahmi's supplied screens. No invented interface content. */
export function composeCover(ctx:CanvasRenderingContext2D,images:HTMLImageElement[],layout:string,width:number,height:number){
  const fill=(image:HTMLImageElement,x=0,y=0,w=width,h=height,top=false)=>{
    const scale=Math.max(w/image.width,h/image.height),sw=w/scale,sh=h/scale;
    ctx.drawImage(image,(image.width-sw)/2,top?0:(image.height-sh)/2,sw,sh,x,y,w,h);
  };
  const fit=(image:HTMLImageElement,x:number,y:number,w:number,h:number)=>{
    const scale=Math.min(w/image.width,h/image.height);
    ctx.drawImage(image,x+(w-image.width*scale)/2,y+(h-image.height*scale)/2,image.width*scale,image.height*scale);
  };
  switch(layout){
    case 'screen':fill(images[0],0,0,width,height,true);return true;
    case 'camera-output':{
      // The photographed output, excluding the camera UI and capture controls.
      const image=images[0],sx=image.width*.1,sy=image.height*.13,sw=image.width*.8,sh=image.height*.667;
      const crop=document.createElement('canvas');crop.width=sw;crop.height=sh;
      crop.getContext('2d')!.drawImage(image,sx,sy,sw,sh,0,0,sw,sh);
      const scale=Math.max(width/sw,height/sh);
      ctx.drawImage(crop,(width-sw*scale)/2,(height-sh*scale)/2,sw*scale,sh*scale);
      return true;
    }
    case 'world-scene':{
      // Help panel is left of x400 and HUD is above y175 in the supplied frame.
      const image=images[0],sx=image.width*.25,sy=image.height*.217;
      const sw=image.width-sx,sh=image.height-sy,scale=Math.max(width/sw,height/sh);
      const dw=sw*scale,dh=sh*scale;
      ctx.drawImage(image,sx,sy,sw,sh,(width-dw)/2,(height-dh)/2,dw,dh);
      return true;
    }
    case 'poster-pair':
      fit(images[0],width*.025,height*.055,width*.46,height*.88);
      fit(images[1],width*.515,height*.055,width*.46,height*.88);
      return true;
    case 'poster-screen':
      fit(images[0],width*.025,height*.035,width*.43,height*.93);
      fit(images[1],width*.425,height*.14,width*.55,height*.72);
      return true;
    default:return false;
  }
}
