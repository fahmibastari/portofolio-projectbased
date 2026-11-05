import type { Project } from "./types";
import presentationData from "./presentations.json";
import { composeCover } from "./project-covers";

type Presentation = { layout: string; color: string; slides: number[][]; details: number[]; aspect?: number;motion?:string;thumbnail?:string;detailAspect?:number };
const presentations = presentationData.projects as Record<string, Presentation>;
const loaded = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  if (!loaded.has(src)) loaded.set(src, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image unavailable: ${src}`));
    image.src = src.startsWith("./") ? "/" + src.slice(2) : src;
  }));
  return loaded.get(src)!;
}
export function galleryAspect(project: Project) {
  return presentations[project.id]?.aspect ?? Math.max(1.6, Math.min(1.85, project.cover.width / project.cover.height));
}
export function galleryMotion(project:Project){return presentations[project.id]?.motion??null;}
export function thumbnailPath(project:Project){return presentations[project.id]?.thumbnail??(project.featured?boardPath(project.id):project.cover.src.replace(/^\.\//,'/'));}
export function boardAspect(project:Project){return presentations[project.id]?.detailAspect??galleryAspect(project);}
export function detailShots(project: Project) {
  const indices = presentations[project.id]?.details;
  return indices ? indices.map(index => project.images[index]).filter(Boolean) : project.images;
}
export function boardPath(id: string, variant = 0) {
  return `/boards/${id}${variant ? "-1" : ""}.webp`;
}

/** Gallery artwork is separate from the authentic interface boards in case studies. */
export async function createBoard(project: Project, variant = 0): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = Math.round(1600 / galleryAspect(project));
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${project.title ?? project.name}: project presentation`);
  canvas.dataset.project = project.id;
  const ctx = canvas.getContext("2d")!, treatment = presentations[project.id];
  if(treatment?.thumbnail){ctx.drawImage(await loadImage(treatment.thumbnail),0,0,canvas.width,canvas.height);return canvas;}
  if (treatment && !new URLSearchParams(location.search).has("compose")) {
    try {
      ctx.drawImage(await loadImage(boardPath(project.id, variant)), 0, 0, canvas.width, canvas.height);
      return canvas;
    } catch { /* Compose a newly added cover before its export is available. */ }
  }
  const indices = treatment?.slides[variant % treatment.slides.length] ?? [0];
  const images = await Promise.all(indices.map(index => loadImage((project.images[index] ?? project.cover).src)));
  ctx.fillStyle = treatment?.color ?? project.color ?? "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!treatment || !composeCover(ctx, images, treatment.layout, canvas.width, canvas.height)) {
    const image = images[0], scale = Math.max(canvas.width / image.width, canvas.height / image.height);
    ctx.drawImage(image, (canvas.width - image.width * scale) / 2, 0, image.width * scale, image.height * scale);
  }
  return canvas;
}
