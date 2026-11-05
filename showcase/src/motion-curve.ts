const revealSegments = [
  [0,0,.094,.026,.124,.127,.157,.29],
  [.157,.29,.197,.486,.254,.8,.348,.884],
  [.348,.884,.42,.949,.374,1,1,1],
];
const cubic = (t:number,a:number,b:number,c:number,d:number) =>
  (1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d;

/** Shared monotone reveal and flight easing. */
export function revealProgress(time:number) {
  if(time<=0)return 0;if(time>=1)return 1;
  const [x0,y0,x1,y1,x2,y2,x3,y3]=revealSegments.find(segment=>time<=segment[6])!;
  let low=0,high=1;
  for(let i=0;i<20;i++){const mid=(low+high)/2;if(cubic(mid,x0,x1,x2,x3)<time)low=mid;else high=mid;}
  return cubic((low+high)/2,y0,y1,y2,y3);
}

export function flightProgress(time:number){
  if(time<=0)return 0;if(time>=1)return 1;
  return time<.5?Math.pow(2,20*time-10)/2:(2-Math.pow(2,-20*time+10))/2;
}
