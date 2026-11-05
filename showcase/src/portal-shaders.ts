export const screenVertex = `varying vec2 screenUv;void main(){screenUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;

// Radial lens equation: the rim is refracted source imagery, rather than a model.
export const lensFragment = `
uniform sampler2D sceneImage,trailImage;
uniform float aspect,radius,opening,clock,squeeze,pointerStrength;
uniform vec2 texel; varying vec2 screenUv;
vec3 imageAt(vec2 coordinate){
  if(any(lessThan(coordinate,vec2(0.)))||any(greaterThan(coordinate,vec2(1.))))return vec3(0.);
  return texture2D(sceneImage,coordinate).rgb;
}
void main(){
  vec2 basis=vec2(1.+squeeze,1.-squeeze);
  vec2 relative=(screenUv-.5)*vec2(1.,1./aspect)*basis;
  float distanceToCenter=length(relative);
  vec2 radial=relative/max(distanceToCenter,.00001);
  float angle=atan(radial.y,radial.x);
  float boundary=radius*opening*(1.+.015*sin(clock*1.6));
  boundary+=(.6*sin(3.*angle+.7*clock)+.4*sin(5.*angle-.45*clock))*.05*sin(3.14159265*opening);
  float influence=1.-smoothstep(boundary,boundary+.09,distanceToCenter);
  float focal=boundary*1.5;
  float deflection=influence*focal*focal/max(distanceToCenter,.001);
  float orbit=deflection*.3*min(clock,15.);
  float c=cos(orbit),s=sin(orbit);
  vec2 direction=vec2(c*radial.x+s*radial.y,-s*radial.x+c*radial.y);
  vec3 color=vec3(0.);
  for(int channel=0;channel<3;channel++){
    float focus=focal*(1.+float(1-channel)*.004);
    float sampleRadius=distanceToCenter-influence*focus*focus/max(distanceToCenter,.001);
    vec2 sampleUv=.5+direction*sampleRadius/basis*vec2(1.,aspect);
    vec3 sampleColor=imageAt(sampleUv);
    if(channel==0)color.r=sampleColor.r;
    if(channel==1)color.g=sampleColor.g;
    if(channel==2)color.b=sampleColor.b;
  }
  float edge=distanceToCenter-boundary;
  if(opening>.00001)color*=smoothstep(-max(fwidth(edge),.0001),max(fwidth(edge),.0001),edge);
  if(pointerStrength>.001){
    vec2 e=texel*1.5;
    vec2 slope=vec2(texture2D(trailImage,screenUv+vec2(e.x,0.)).r-texture2D(trailImage,screenUv-vec2(e.x,0.)).r,texture2D(trailImage,screenUv+vec2(0.,e.y)).r-texture2D(trailImage,screenUv-vec2(0.,e.y)).r);
    float mask=1.-smoothstep(.22,.5,length((screenUv-.5)*vec2(1.,1./aspect)));
    vec2 offset=slope*-.045*pointerStrength*mask*(1.-opening);
    vec3 warped=imageAt(clamp(screenUv+offset,0.,1.));
    float light=clamp(dot(-slope,normalize(vec2(-.3,1.)))*-1.2*pointerStrength*mask,-.5,.5);
    warped*=1.+light*(1.-smoothstep(.7,.95,dot(warped,vec3(.2126,.7152,.0722))));
    color=mix(color,warped,smoothstep(0.,.002,length(offset)));
  }
  gl_FragColor=vec4(color,1.);
}`;

export const trailFragment = `
uniform sampler2D previous;uniform vec2 texel,point;uniform float aspect,decay,diffusion,strength;varying vec2 screenUv;
void main(){
  float center=texture2D(previous,screenUv).r;
  float around=texture2D(previous,screenUv+vec2(texel.x,0.)).r+texture2D(previous,screenUv-vec2(texel.x,0.)).r+texture2D(previous,screenUv+vec2(0.,texel.y)).r+texture2D(previous,screenUv-vec2(0.,texel.y)).r;
  vec2 q=(screenUv-point)*vec2(1.,1./aspect);
  float value=mix(center,around*.25,diffusion)*decay+strength*exp(-dot(q,q)/.0016);
  gl_FragColor=vec4(min(value,1.5),0.,0.,1.);
}`;
