import "./styles.css";
import data from "./generated/projects.json";
import type { Project } from "./types";
import type { WorkGallery } from "./ribbon";
import type { ChromePortal } from "./portal";
import type { FullIndex } from './full-index';
import { createBoard, detailShots, boardPath, galleryAspect,boardAspect,thumbnailPath } from "./boards";
import { DetailLoop } from "./detail-loop";
import { captureProjectShape,morphProject, flyProjectTitle,neighborProject,preserveProjectSheet, type OutlinePoint } from "./project-transition";
import {flatSheet,type SheetPose} from './sheet-pose';
import {panelMetrics} from './ribbon-model';

const projects = data.projects as Project[];
const selected = data.selected
  .map((id) => projects.find((p) => p.id === id)!)
  .filter(Boolean);
const byId = new Map(projects.map((p) => [p.id, p]));
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const safe = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const name = (p: Project) => p.title ?? p.name;
const asset = (src: string) => src.replace(/^\.\//, "/");
const projectDialog = $<HTMLDialogElement>("project-dialog");
const profileDialog = $<HTMLDialogElement>("profile-dialog");
const cache = new Map<string, Promise<HTMLCanvasElement>>();
let gallery: WorkGallery | undefined;
let portal: ChromePortal | undefined;
let view = "selected";
let origin: HTMLElement | null = null;
let previousUrl = "/";
let mockups: HTMLElement | undefined;
let profileClosing = false;
let detailLoop: DetailLoop | undefined;
let viewEpoch = 0;
let portalOrigin: HTMLElement | null = null;
let projectOutline: OutlinePoint[] | null = null;
let projectCaption: ReturnType<WorkGallery['captionRect']> = null;
let projectPose:SheetPose|null=null;
let projectCloseTimer=0;
let projectId:string|null=null;
let portalCloseTimer=0;
let portalEpoch=0;
let portalUnavailable=false;
let fullIndex:FullIndex|undefined;
let fullLoading:Promise<void>|undefined;

function board(p: Project, variant = 0) {
  const key = `${p.id}:${variant}`;
  if (!cache.has(key)) cache.set(key, createBoard(p, variant));
  return cache.get(key)!;
}
function pause() {
  gallery?.setPaused(
    (view !== "selected" && !profileDialog.open) || projectDialog.open,
  );
}
function status(index: number) {
  const p = selected[index];
  $("gallery-status").textContent = `${name(p)}. ${p.category}`;
  document.documentElement.dataset.activeProject = p.id;
}
function route() {
  const u = new URL(location.href);
  const id =
    u.pathname.match(/\/projects\/([^/]+)/)?.[1] ??
    u.searchParams.get("project");
  return {
    view:
      u.pathname === "/full"
        ? "index"
        : (u.searchParams.get("view") ?? "selected"),
    id,
  };
}

async function openProject(id: string, update = true,direction=1,bootRects?:DOMRect[]) {
  const p = byId.get(id);
  if (!p) return;
  if(!p.featured){if(projectDialog.open)closeProject(false);await setView('selected',false);history.replaceState({},'', '/');return;}
  const wasOpen = projectDialog.open;
  projectId=id;
  clearTimeout(projectCloseTimer);
  projectDialog.getAnimations({subtree:true}).forEach(animation=>animation.cancel());
  projectDialog.classList.remove('is-closing');
  if(!wasOpen){
    const handoff=view==='index'?fullIndex?.handoff(id):null;
    projectOutline=view==='selected'?gallery?.projectOutline(id)??null:handoff?.outline??null;
    projectCaption=view==='selected'?gallery?.captionRect(id)??null:handoff?.caption??null;
    projectPose=view==='selected'?gallery?.projectPose(id)??null:handoff?.pose??null;
    if(bootRects&&gallery){const bar=bootRects[1];projectPose={...flatSheet(bar,bar.height/2),kind:'bar'};projectCaption=null;}
  }
  const sourceRect =
    !wasOpen && view === "selected" ? gallery?.projectRect(id) : null;
  const outgoing=wasOpen&&direction!==0&&!matchMedia('(prefers-reduced-motion:reduce)').matches?preserveProjectSheet(projectDialog):null;
  detailLoop?.dispose();
  projectDialog.style.clipPath='';
  if(wasOpen){gallery?.cancelFlight();gallery?.prepareReturn(id);delete projectDialog.dataset.flight;}
  if (!projectDialog.open) {
    origin = document.activeElement as HTMLElement;
    previousUrl = location.pathname.startsWith("/projects/")
      ? "/"
      : location.pathname + location.search;
  }
  const navigation=selected.some(p=>p.id===id)?selected:projects;
  const index = navigation.findIndex((x) => x.id === id);
  const prev = navigation[(index - 1 + navigation.length) % navigation.length];
  const next = navigation[(index + 1) % navigation.length];
  projectDialog.innerHTML = `<button class="project-close" id="close-project" aria-label="Close project">×</button>
    <button class="project-neighbor previous-project" id="previous-project" aria-label="Previous project: ${safe(name(prev))}"><span>←</span></button>
    <button class="project-neighbor next-project" id="next-project" aria-label="Next project: ${safe(name(next))}"><span>→</span></button>
    <div class="project-layout"><aside class="project-story">
      <h2 id="project-title">${safe(name(p))}</h2><p class="project-summary">${safe(p.summary ?? p.desc)}</p>
      <div class="project-credits">${p.live ? `<a class="project-outbound" href="${safe(p.live)}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${safe(name(p))}">↗</a>` : ""}${[
        p.role,
        p.timeline,
        !p.role&&!p.timeline?p.type:null,
      ]
        .filter(Boolean)
        .map((c) => `<span>${safe(c!)}</span>`)
        .join("")}</div>
    </aside><div class="project-media" aria-label="Project images; scroll to explore the repeating gallery"><div class="detail-track"><div class="detail-sequence"><figure id="detail-board"><img src="${p.featured ? boardPath(p.id) : safe(asset(p.cover.src))}" width="1600" height="${Math.round(1600/boardAspect(p))}" alt="${safe(name(p))} presentation" /></figure>
    ${detailShots(p)
      .map(
        (shot) =>
          `<figure class="project-shot ${shot.height > shot.width * 1.5 ? "portrait-shot" : ""}"><img src="${safe(asset(shot.src))}" width="${shot.width}" height="${shot.height}" alt="${safe(shot.label ?? name(p) + " interface")}" decoding="async" /></figure>`,
      )
      .join(
        "",
      )}</div></div></div></div><span class="project-progress" aria-hidden="true"><svg viewBox="0 0 25 25"><circle class="progress-track" cx="12.5" cy="12.5" r="12"/><circle class="progress-value" cx="12.5" cy="12.5" r="12" pathLength="1"/></svg></span>`;
  $("close-project").addEventListener("click", () => closeProject());
  $("previous-project").addEventListener("click", () => openProject(prev.id,true,-1));
  $("next-project").addEventListener("click", () => openProject(next.id,true,1));
  if (!projectDialog.open){projectDialog.tabIndex=-1;projectDialog.showModal();projectDialog.focus({preventScroll:true});}
  if(view==='index'&&!wasOpen&&projectOutline)fullIndex?.blastTo(projectDialog.getBoundingClientRect());
  detailLoop = new DetailLoop(projectDialog,gallery?()=>gallery!.surface:undefined,bootRects?2100:1450);
  if((projectOutline&&!wasOpen||outgoing)&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
    projectDialog.classList.add('is-morphing');
    const started=view==='index'?fullIndex?.flightStarted??performance.now():performance.now();
    if(outgoing)neighborProject(projectDialog,outgoing,direction);else{
      const destination=flatSheet(projectDialog.getBoundingClientRect(),parseFloat(getComputedStyle(projectDialog).borderTopLeftRadius));
      const physical=projectPose&&(view==='index'||gallery?.flyProject(id,projectPose,destination,false,bootRects,started));
      morphProject(projectDialog,projectOutline!,false,undefined,physical?{from:projectPose!,to:destination,duration:bootRects?1500:1000,intro:!!bootRects,started}:undefined);
    }
    if(projectCaption&&!wasOpen){
      const card=projectPose,metrics=panelMetrics(innerWidth,innerHeight,galleryAspect(p));
      const geometry=view==='selected'&&card?{card,sheet:flatSheet(projectDialog.getBoundingClientRect(),parseFloat(getComputedStyle(projectDialog).borderTopLeftRadius)),caption:{u:metrics.padding/card.width,v:(card.height-metrics.bottom-metrics.font*1.4)/card.height,fontSize:metrics.font}}:undefined;
      flyProjectTitle($('project-title'),projectCaption,false,undefined,geometry,started);
    }
    projectDialog.querySelectorAll<HTMLElement>(`${bootRects?'#project-title,':''}.project-summary,.project-credits,.project-close,.project-progress`).forEach((element,index)=>element.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:850,delay:(bootRects?750:350)+index*75,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));
    projectDialog.querySelectorAll<HTMLElement>('.detail-sequence').forEach(sequence=>[...sequence.children].forEach((element,index)=>element.animate([{opacity:0,transform:'translateY(25vh)'},{opacity:1,transform:'none'}],{duration:1250,delay:(bootRects?650:250)+index*100,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'})));
  } else if (sourceRect && !matchMedia("(prefers-reduced-motion:reduce)").matches) {
    const lead =
      projectDialog.querySelector<HTMLImageElement>("#detail-board img")!;
    const targetRect = lead.getBoundingClientRect();
    const shared = lead.cloneNode() as HTMLImageElement;
    shared.className = "shared-project-image";
    shared.setAttribute("aria-hidden", "true");
    Object.assign(shared.style, {
      left: `${targetRect.left}px`,
      top: `${targetRect.top}px`,
      width: `${targetRect.width}px`,
      height: `${targetRect.height}px`,
    });
    projectDialog.append(shared);
    const animation = shared.animate(
      [
        {
          transform: `translate(${sourceRect.left - targetRect.left}px,${sourceRect.top - targetRect.top}px) scale(${sourceRect.width / targetRect.width},${sourceRect.height / targetRect.height})`,
          borderRadius: "16px",
          opacity: 1,
        },
        { transform: "none", borderRadius: "0px", opacity: 1, offset: 0.87 },
        { transform: "none", borderRadius: "0px", opacity: 0 },
      ],
      { duration: 850, easing: "cubic-bezier(.19,1,.22,1)", fill: "both" },
    );
    animation.finished.then(() => shared.remove()).catch(() => shared.remove());
  }
  projectDialog.scrollTop = 0;
  document.title = `${name(p)} — Fahmi Bastari`;
  pause();
  if (update) history.pushState({ project: id }, "", `/projects/${id}`);
}
function closeProject(update = true) {
  if (!projectDialog.open || projectDialog.classList.contains('is-closing')) return;
  const shape=detailLoop?.captureShape()??captureProjectShape(projectDialog),visualTitle=detailLoop?.captureTitle()??$('project-title').getBoundingClientRect(),titleColor=getComputedStyle($('project-title')).color;
  detailLoop?.releaseSurface();
  detailLoop?.freeze();
  if(update&&view!=='selected')void setView('selected',false);
  if(view==='index')fullIndex?.resetHandoff();
  projectDialog.getAnimations({subtree:true}).forEach(animation=>animation.cancel());
  const naturalTitle=$('project-title').getBoundingClientRect(),titleScale=visualTitle.width/naturalTitle.width;
  const titleStart={transform:`matrix(${titleScale},0,0,${titleScale},${visualTitle.left-naturalTitle.left},${visualTitle.top-naturalTitle.top})`,color:titleColor};
  projectDialog.classList.add("is-closing");
  if(projectId&&view==='selected'){
    gallery?.beginReturn(projectId);
    projectOutline=gallery?.projectOutline(projectId)??null;
    projectCaption=gallery?.captionRect(projectId)??null;
  }
  const morph=projectOutline&&!matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(morph){
    const started=performance.now();
    const destination=projectId&&view==='selected'?gallery?.projectPose(projectId):null;
    const physical=destination&&projectId&&gallery?.flyProject(projectId,shape.pose,destination,true,undefined,started);
    morphProject(projectDialog,projectOutline!,true,shape,physical?{from:shape.pose,to:destination!,started}:undefined);
    if(projectCaption){
      const p=projectId?byId.get(projectId):null,metrics=p?panelMetrics(innerWidth,innerHeight,galleryAspect(p)):null;
      const geometry=destination&&shape.pose.kind==='sheet'&&metrics?{card:destination,sheet:shape.pose,caption:{u:metrics.padding/destination.width,v:(destination.height-metrics.bottom-metrics.font*1.4)/destination.height,fontSize:metrics.font}}:undefined;
      flyProjectTitle($('project-title'),projectCaption,true,titleStart,geometry,started);
    }
    projectDialog.querySelectorAll<HTMLElement>('.project-summary,.project-credits,.project-media,.project-close,.project-progress,.project-neighbor').forEach(element=>element.animate([{opacity:1},{opacity:0}],{duration:250,fill:'forwards'}));
  }
  if (update) history.pushState({}, "", '/');
  projectCloseTimer=window.setTimeout(
    () => {
      projectDialog.close();
      detailLoop?.dispose();
      detailLoop = undefined;
      projectDialog.classList.remove("is-closing");
      projectDialog.classList.remove('is-morphing');
      delete projectDialog.dataset.flight;
      pause();
      origin?.focus({ preventScroll: true });
      document.title = "Fahmi Bastari";
    },
    matchMedia("(prefers-reduced-motion:reduce)").matches ? 0 : morph?1000:380,
  );
}

async function openPortal(kind: "profile" | "newsletter") {
  const epoch=++portalEpoch;
  clearTimeout(portalCloseTimer);
  const switching=profileDialog.open&&!profileClosing;
  profileClosing = false;
  profileDialog.classList.remove('is-closing');
  if(switching&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
    const old=profileDialog.querySelector<HTMLElement>('.portal-copy');
    if(old)old.animate([{opacity:getComputedStyle(old).opacity},{opacity:0}],{duration:250,fill:'forwards'});
    await new Promise(resolve=>setTimeout(resolve,350));
    if(epoch!==portalEpoch)return;
  }
  document.documentElement.dataset.portal = kind;
  if(!profileDialog.open)portalOrigin = document.activeElement as HTMLElement;
  document.querySelector<HTMLElement>(".gallery")!.hidden = false;
  fullIndex?.setVisible(false);
  $("index-view").hidden = true;
  gallery?.setViewVisible(true);
  profileDialog.innerHTML = `<button class="portal-close ${kind==='newsletter'?'portal-footer-close':''}" id="close-profile" aria-label="Close ${kind}">Close</button><button class="portal-other ${kind==='profile'?'portal-footer-close':''}" id="switch-portal">${kind==='profile'?'Newsletter':'Profile'}</button><div class="portal-copy">
    ${
      kind === "profile"
        ? `<h2 class="sr-only" id="profile-title">Fahmi Bastari, profile</h2><p>Fahmi Bastari, fullstack developer based in Bandung, Indonesia. Building web and mobile applications, from client systems to camera and 3D browser experiments. Working across interfaces, backend services, and the space between them, on independent projects and collaborations with client teams.</p><p class="profile-caption">Web, mobile & interactive — independent since 2023</p><nav class="profile-social" aria-label="Social links"><a href="https://instagram.com/fahmibastari" target="_blank" rel="noopener noreferrer">Instagram</a><a href="https://github.com/fahmibastari" target="_blank" rel="noopener noreferrer">GitHub</a><a href="https://linkedin.com/in/fahmibastari" target="_blank" rel="noopener noreferrer">LinkedIn</a><a href="mailto:fahmibastari.work@gmail.com">Email</a></nav>`
        : `<h2 class="sr-only" id="profile-title">Newsletter</h2><p>An occasional note on building for the web. Projects, experiments, and things learned along the way.</p><form id="newsletter-form"><label class="sr-only" for="newsletter-email">Email address</label><input id="newsletter-email" type="email" placeholder="Email address" required autocomplete="email" /><button aria-label="Request newsletter updates"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form><p class="newsletter-note">Send a signup request by email.</p>`
    }
    </div>`;
  $("close-profile").addEventListener("click", closePortal);
  $('switch-portal').addEventListener('click',()=>openPortal(kind==='profile'?'newsletter':'profile'));
  if (kind === "newsletter")
    $("newsletter-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const email = $<HTMLInputElement>("newsletter-email").value;
      location.href = `mailto:fahmibastari.work@gmail.com?subject=${encodeURIComponent("Newsletter signup request")}&body=${encodeURIComponent("Please send future project updates to " + email + ".")}`;
    });
  if(!profileDialog.open)profileDialog.showModal();
  pause();
  if (!portal&&!portalUnavailable) {
    try{
    const { ChromePortal } = await import("./portal");
    portal = new ChromePortal(
      $("portal-stage"),
      gallery?.surface,
      () => gallery?.motion ?? 0,
    );
    if (gallery) gallery.attachPortal(portal);
    }catch{portalUnavailable=true;profileDialog.classList.add('no-graphics');}
  }
  if (profileDialog.open && !profileClosing){portal?.setCopy(profileDialog.querySelector('.portal-copy'));portal?.show();}
}
function closePortal() {
  if (profileClosing || !profileDialog.open) return;
  ++portalEpoch;
  profileClosing = true;
  portal?.hide();
  profileDialog.classList.add("is-closing");
  portalCloseTimer=window.setTimeout(
    () => {
      profileDialog.close();
      portal?.setCopy(null);
      profileDialog.classList.remove("is-closing");
      profileClosing = false;
      delete document.documentElement.dataset.portal;
      gallery?.setViewVisible(view === "selected");
      document.querySelector<HTMLElement>(".gallery")!.hidden =
        view !== "selected";
      $("index-view").hidden = view !== "index";
      if (view === "index") layoutIndex();
      fullIndex?.setVisible(view==='index');
      pause();
      portalOrigin?.focus({ preventScroll: true });
    },
    matchMedia("(prefers-reduced-motion:reduce)").matches ? 0 : 650,
  );
}

function buildIndex() {
  $("index-list").innerHTML = projects
    .map(
      (p) =>
        p.featured?`<a class="index-row" href="/projects/${p.id}" data-project="${p.id}" data-case>${safe(name(p))}</a>`:p.live?`<a class="index-row" href="${safe(p.live)}" target="_blank" rel="noopener noreferrer" data-project="${p.id}">${safe(name(p))}</a>`:`<span class="index-row" data-project="${p.id}">${safe(name(p))}</span>`,
    )
    .join(" ");
  for (const link of $("index-list").querySelectorAll<HTMLAnchorElement>("a[data-case]")) {
    const p = byId.get(link.dataset.project!)!;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openProject(p.id);
    });
  }
}

/** Keep the separator between names, including after responsive line wrapping. */
function layoutIndex() {
  const list = $("index-list");
  if (!list.clientWidth) return;
  const links = [...list.querySelectorAll<HTMLElement>(".index-row")];
  list.replaceChildren(...links);
  links.forEach((link,index)=>{
    const next=links[index+1];
    link.toggleAttribute('data-row-end',!next||Math.abs(link.getBoundingClientRect().top-next.getBoundingClientRect().top)>link.getBoundingClientRect().height/2);
  });
}

async function renderMockups() {
  if (mockups) return;
  mockups = document.createElement("section");
  mockups.className = "boards-view";
  mockups.innerHTML =
    '<h2>Project presentations</h2><div class="boards-grid" id="boards-grid"></div>';
  document.querySelector("main")!.append(mockups);
  for (const p of selected) {
    const article = document.createElement("article");
    article.innerHTML = `<a href="/projects/${p.id}" aria-label="Open ${safe(name(p))} project"><img src="${thumbnailPath(p)}" width="1600" height="${Math.round(1600/galleryAspect(p))}" alt="${safe(name(p))} presentation" /></a><p><span>${safe(name(p))}</span><a href="${thumbnailPath(p)}" download="${p.id}-presentation.webp">Save mockup</a></p>`;
    article.querySelector("a")!.addEventListener("click", (e) => {
      e.preventDefault();
      openProject(p.id);
    });
    $("boards-grid").append(article);
    if (new URLSearchParams(location.search).has("compose")) {
      const canvas = await board(
        p,
        Number(new URLSearchParams(location.search).get("slide") ?? 0),
      );
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `${name(p)} presentation`);
      article.querySelector("img")!.replaceWith(canvas);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.92),
      );
      if (blob)
        article.querySelector<HTMLAnchorElement>("a[download]")!.href =
          URL.createObjectURL(blob);
    }
  }
}
async function setView(next: string, update = true) {
  const epoch = ++viewEpoch;
  if (
    view === "selected" &&
    next === "index" &&
    gallery &&
    !matchMedia("(prefers-reduced-motion:reduce)").matches
  ) {
    gallery.setViewVisible(false);
    await new Promise((resolve) => setTimeout(resolve, 380));
    if (epoch !== viewEpoch) return;
  }
  view = ["index", "mockups"].includes(next) ? next : "selected";
  document.documentElement.dataset.view = view;
  document.querySelector<HTMLElement>(".gallery")!.hidden = view !== "selected";
  $("index-view").hidden = view !== "index";
  gallery?.setViewVisible(view === "selected");
  if (view === "index") layoutIndex();
  if(view==='index'&&gallery&&!fullIndex&&!fullLoading){
    fullLoading=import('./full-index').then(({FullIndex})=>{fullIndex=new FullIndex($('index-preview'),$('index-list'),projects,id=>gallery?.motionSource(id)??null);fullIndex.setVisible(view==='index'&&!profileDialog.open);}).catch(error=>console.error('Full preview unavailable',error));
  }
  fullIndex?.setVisible(view==='index'&&!profileDialog.open);
  if (view === "mockups") await renderMockups();
  if (mockups) mockups.hidden = view !== "mockups";
  $("featured-view").setAttribute("aria-pressed", String(view === "selected"));
  $("all-view").setAttribute("aria-pressed", String(view === "index"));
  pause();
  window.scrollTo(0, 0);
  if (update)
    history.pushState(
      {},
      "",
      view === "index" ? "/full" : view === "mockups" ? "/?view=mockups" : "/",
    );
}
function flat(boards: HTMLCanvasElement[]) {
  document.documentElement.classList.add("flat-gallery");
  $("stage").replaceChildren();
  $("project-links").replaceChildren();
  selected.forEach((p, i) => {
    const link = document.createElement("a");
    link.className = "flat-project";
    link.href = `/projects/${p.id}`;
    link.setAttribute("aria-label", `Open ${name(p)} project`);
    link.append(boards[i]);
    link.insertAdjacentHTML("beforeend", `<span>${safe(name(p))}</span>`);
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openProject(p.id);
    });
    $("project-links").append(link);
  });
}

$("profile-toggle").addEventListener("click", () => openPortal("profile"));
$("newsletter-toggle").addEventListener("click", () =>
  openPortal("newsletter"),
);
$("featured-view").addEventListener("click", () => setView("selected"));
$("all-view").addEventListener("click", () => setView("index"));
projectDialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeProject();
});
profileDialog.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey || !profileDialog.open) return;
    e.preventDefault();
    gallery?.scroll(
      (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) *
        (e.deltaMode === 1 ? 18 : 1),
    );
  },
  { passive: false },
);
let portalDrag: { x:number;y:number;startX:number;startY:number;delta:number;time:number;touch:boolean;engaged:boolean } | null = null;
let portalTravel=0;
profileDialog.addEventListener("pointerdown", (e) => {
  portalTravel=0;
  if (
    (e.target as HTMLElement).closest("a,button,input")
  )
    return;
  portalDrag = { x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,delta:0,time:e.timeStamp,touch:e.pointerType==='touch',engaged:false };
});
profileDialog.addEventListener("pointermove", (e) => {
  if (!portalDrag) return;
  const dx = portalDrag.x - e.clientX,
    dy = portalDrag.y - e.clientY;
  portalTravel=Math.hypot(e.clientX-portalDrag.startX,e.clientY-portalDrag.startY);
  const delta=innerWidth<650||(portalDrag.touch&&Math.abs(dy)>Math.abs(dx))?dy:dx;
  if(portalDrag.engaged)gallery?.drag(delta,portalDrag.touch);
  else if(portalTravel>10){portalDrag.engaged=true;profileDialog.classList.add('is-dragging');}
  Object.assign(portalDrag,{x:e.clientX,y:e.clientY,delta,time:e.timeStamp});
});
profileDialog.addEventListener("pointerup", (event) => {
  if(portalDrag&&portalTravel>10&&event.timeStamp-portalDrag.time<100)gallery?.drag(portalDrag.delta,portalDrag.touch,true);
  portalDrag=null;
  profileDialog.classList.remove('is-dragging');
});
profileDialog.addEventListener("pointercancel", () => {portalDrag=null;profileDialog.classList.remove('is-dragging');});
profileDialog.addEventListener('click',event=>{
  if(portalTravel>10||(event.target as HTMLElement).closest('a,button,input,form,.portal-copy'))return;
  const radius=innerWidth*(innerWidth>=650?.2:420/390/2);
  if(Math.hypot(event.clientX-innerWidth/2,event.clientY-innerHeight/2)>radius)closePortal();
});
profileDialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closePortal();
});
document.addEventListener("keydown", (e) => {
  if (projectDialog.open || profileDialog.open || view !== "selected") return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    gallery?.move(1);
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    gallery?.move(-1);
  }
});
window.addEventListener("popstate", () => {
  const state = route();
  if (state.id) openProject(state.id, false);
  else if (projectDialog.open) closeProject(false);
  if (state.view !== view) setView(state.view, false);
});
buildIndex();
window.addEventListener("resize", () => {
  if (view === "index") layoutIndex();
  if(projectDialog.open&&projectId&&projectDialog.querySelector('.project-layout')?.classList.contains('is-mobile-detail')!==(innerWidth<650))void openProject(projectId,false,0);
});
try {
  let loadingValue=0,loadingFrame=0,loadingDone=Promise.resolve();
  const loadingStarted=performance.now();
  const loadingBars=[...document.querySelectorAll<HTMLElement>('.loading-bars span')];
  let bootRects:DOMRect[]|undefined;
  const updateLoading=(target:number)=>{
    cancelAnimationFrame(loadingFrame);
    const from=loadingValue,start=performance.now();
    loadingDone=new Promise<void>(resolve=>{
      const paint=(now:number)=>{
        const t=matchMedia('(prefers-reduced-motion:reduce)').matches?1:Math.min(1,(now-start)/800);
        loadingValue=from+(target-from)*(1-Math.pow(1-t,4));
        loadingBars.forEach((bar,index)=>bar.style.setProperty('--unfilled',`${(1-Math.max(0,Math.min(1,loadingValue*3-index)))*100}%`));
        if(t<1)loadingFrame=requestAnimationFrame(paint);else resolve();
      };
      loadingFrame=requestAnimationFrame(paint);
    });
  };
  const localTypeface = await document.fonts
    .load('400 12px "Portfolio Sans"')
    .catch(() => []);
  if (localTypeface.length)
    document.documentElement.classList.add("has-portfolio-font");
  await document.fonts.ready;
  let loadedCount=0;
  const boards = await Promise.all(selected.map(async(p)=>{const image=await board(p);updateLoading(++loadedCount/selected.length);return image;}));
  await loadingDone;
  if(performance.now()-loadingStarted<1300&&!matchMedia('(prefers-reduced-motion:reduce)').matches)
    await new Promise(resolve=>setTimeout(resolve,500));
  if (!matchMedia("(prefers-reduced-motion:reduce)").matches) {
    try {
      const { WorkGallery } = await import("./ribbon");
      gallery = new WorkGallery(
        $("stage"),
        $("project-links"),
        selected,
        boards,
        status,
        (id) => {
          void openProject(id);
        },
      );
      const { ChromePortal } = await import("./portal");
      portal = new ChromePortal($("portal-stage"), gallery.surface, () => gallery?.motion ?? 0);
      gallery.attachPortal(portal);
      await Promise.all([gallery.ready,portal.ready]);
      bootRects=loadingBars.map(bar=>bar.getBoundingClientRect());gallery.startIntro(bootRects);
    } catch (error) {
      console.error(error);
      flat(boards);
    }
  } else flat(boards);
  $("loading-message").hidden = true;
  document.documentElement.classList.add("is-ready");
  setTimeout(()=>document.querySelectorAll<HTMLElement>(".site-header,.site-footer").forEach(element => { element.inert=false; }),gallery?750:0);
  const state = route();
  await setView(state.view, false);
  if (state.id) await openProject(state.id, false,1,bootRects);
} catch (error) {
  console.error(error);
  $("loading-message").innerHTML =
    'The gallery could not load. <a href="/archive.html">View the project archive</a>';
}
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  portal?.dispose();
  gallery?.dispose();
  detailLoop?.dispose();
  fullIndex?.dispose();
});
