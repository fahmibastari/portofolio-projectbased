/** Screen layout and gallery surface parameters. */
export const ribbonSpec = {
  fieldOfView: 53.4,
  cameraDistance: 41.18,
  height: 0.435,
  gapAt1920: 12.8,
  depth: 0.2,
  span: 1.15,
  shift: -0.2,
  bank: -0.16,
  diagonal: 0.03,
  door: -0.12,
};

export const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function frameSize(width: number, height: number) {
  const halfHeight =
    Math.tan((ribbonSpec.fieldOfView * Math.PI) / 360) *
    ribbonSpec.cameraDistance;
  return { halfHeight, halfWidth: halfHeight * width / height,
    unit: (halfHeight * 2) / height };
}

export function panelMetrics(viewWidth:number,viewHeight:number,aspect:number){
  const mobile=viewWidth<650,rem=Math.max(.5,Math.min(2,viewWidth/(mobile?390:1500)));
  const width=mobile?viewWidth-40*rem:viewHeight*ribbonSpec.height*aspect;
  const height=mobile?width/aspect:viewHeight*ribbonSpec.height;
  return {mobile,rem,width,height,font:(mobile?16:18)*rem,padding:(mobile?10:20)*rem,bottom:10*rem,radius:12.5*rem,corner:(mobile?15:20)*rem,gap:(mobile?20:10)*rem};
}

export function doorDepth(x: number, halfWidth: number) {
  const q = Math.max(-1, Math.min(1, x / halfWidth));
  return halfWidth * ribbonSpec.door * q * (1.5 - 0.5 * q * q);
}

export function surfacePoint(
  x: number, y: number, halfWidth: number, activity = 0,strength=1,
) {
  const q = x / halfWidth * ribbonSpec.span + ribbonSpec.shift;
  const envelope = Math.exp(-q * q);
  const wave = Math.sin(Math.PI * q) * envelope;
  const gradient =
    (Math.PI * Math.cos(Math.PI * q) - 2 * q * Math.sin(Math.PI * q)) * envelope;
  const across = x / halfWidth;
  const roll = (ribbonSpec.bank * gradient / Math.PI +
    1.8 * activity * smooth(0.3, 0.9, Math.abs(across)) * Math.sign(across))*strength;
  const near = 1 - smooth(-1, 0.3, across);
  return {
    x,
    y: y * Math.cos(roll) + (ribbonSpec.diagonal * x + halfWidth * activity * near * 0.1)*strength,
    z: y * Math.sin(roll) +(-halfWidth * ribbonSpec.depth * (1 + 1.1 * activity) * wave +
      doorDepth(x, halfWidth) + halfWidth * activity * near * 0.2)*strength,
  };
}

/** Wheel notches feed a short impulse; the row itself has a separate response. */
export class RibbonMotion {
  position = 0;
  target = 0;
  impulse = 0;
  activity = 0;
  bounds:[number,number]|null=null;
  private elapsed = 0;
  private pending = 0;
  private lastWheel = -Infinity;
  private lastFastWheel = -Infinity;
  get active(){return Math.abs(this.pending)>.001||Math.abs(this.impulse)>.001||Math.abs(this.target-this.position)>.00003;}
  jump(position:number){this.position=this.target=position;this.impulse=this.pending=this.elapsed=0;}
  wheel(delta: number, time = performance.now()) {
    const interval=time-this.lastWheel;
    if(interval<30)this.lastFastWheel=time;
    const notch=Math.abs(delta)>=40&&interval>=30&&time-this.lastFastWheel>=500;
    if(notch)this.impulse+=delta*2.5;else this.pending+=delta*1.25;
    this.lastWheel=time;
  }
  push(delta: number, width: number) {
    this.target = !Number.isFinite(width)?this.target+delta:this.position +
      Math.tanh((this.target + delta - this.position) / width) * width;
    if(this.bounds)this.target=Math.max(this.bounds[0],Math.min(this.bounds[1],this.target));
  }
  step(seconds: number, width: number, instant = false) {
    this.elapsed += Math.min(seconds, .05);
    while (this.elapsed >= 1 / 60) {
      this.elapsed -= 1 / 60;
      this.advance(width, instant);
    }
  }
  private advance(width: number, instant: boolean) {
    const ratio = 1;
    const released = this.impulse * (1 - Math.pow(0.78, ratio));
    const direct=this.pending;this.pending=0;
    this.impulse -= released;
    if (Math.abs(this.impulse) < 0.05) {
      this.push(released + this.impulse + direct, width); this.impulse = 0;
    } else this.push(released + direct, width);
    this.position += (this.target - this.position) * (instant ? 1 : Math.min(1, 0.1 * ratio));
    const speed = Math.tanh((this.target - this.position) / 550);
    this.activity = speed * speed;
  }
}
