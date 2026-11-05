import sharp from "sharp";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(here, "..");
const source = await readFile(resolve(repo, "projects.js"), "utf8");
const raw = vm.runInNewContext(
  source + ";JSON.parse(JSON.stringify(PROJECTS))",
);
Object.assign(raw,JSON.parse(await readFile(resolve(here,'src/additional-projects.json'),'utf8')));
const html = await readFile(resolve(repo, "index.html"), "utf8");
const start = html.indexOf("const projects = {");
const end = html.indexOf("// --- MODAL LOGIC ---", start);
const live = vm.runInNewContext(
  html.slice(start, end) + ";JSON.parse(JSON.stringify(projects))",
);
const selected = JSON.parse(
  await readFile(resolve(here, "src/presentations.json"), "utf8"),
).featured;
const treatments = {
  sicater:{title:'SiCater'},
  spekhp:{title:'SpekHP'},
  justspeak:{title:'JustSpeak'},
  '2watuju':{title:'2Watuju'},
  navaraprofile:{title:'Navara City Park'},
  navaraopening:{title:'Navara Opening'},
  perpahmian:{title:'PERPAHMIAN'},
  mental:{title:'Mental Healing'},
  duzz: {
    title: "DUZZ",
    subtitle: "A pocket-sized darkroom.",
    color: "#c7b79f",
    kind: "camera",
    summary:
      "An analog camera lab in your browser. Eighteen film recipes, a custom image pipeline, and photos that stay yours.",
  },
  worldofbooth: {
    title: "World of Booth",
    subtitle: "Take the scenic route.",
    color: "#b6c9b6",
    kind: "world",
    summary:
      "A small 3D city with a reason to explore. Walk, drive, and find photobooths that turn your webcam into a memory.",
  },
  magicpin: {
    title: "Magic Pin",
    subtitle: "Made for the collectors.",
    color: "#b8bced",
    kind: "mobile",
    summary:
      "A connected world for pin collectors. Mobile scanning, custom park maps, trading, and a shared collection.",
  },
  flamboys: {
    title: "Flamboys",
    subtitle: "From roast to record.",
    color: "#d5b6a0",
    kind: "system",
    summary:
      "Connecting the roasting floor to inventory. A web and mobile system built around the work of coffee production.",
  },
  ubmstorage: {
    title: "UBM Storage",
    subtitle: "A different kind of store.",
    color: "#cdccc2",
    kind: "console",
    summary:
      "An interactive storefront inside a retro handheld console. A little nostalgia, running right in the browser.",
  },
  digivass: {
    title: "DIGIVASS",
    subtitle: "Out in the field. In sync.",
    color: "#d9c27d",
    kind: "dashboard",
    summary:
      "A bridge between field teams and the office. Mobile data collection, geolocation, and an admin command center.",
  },
};
await mkdir(resolve(here, "public/media"), { recursive: true });
await mkdir(resolve(here, "src/generated"), { recursive: true });
const cache = new Map();
async function image(file) {
  if (cache.has(file)) return cache.get(file);
  try {
    await stat(resolve(repo, file));
  } catch {
    return null;
  }
  const name =
    file
      .replace(/^image\//, "")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .toLowerCase() + ".webp";
  const dest = resolve(here, "public/media", name);
  await sharp(resolve(repo, file))
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 84 })
    .toFile(dest);
  const m = await sharp(dest).metadata();
  const value = { src: "./media/" + name, width: m.width, height: m.height };
  cache.set(file, value);
  return value;
}
const data = [];
for (const [id, entry] of Object.entries(raw)) {
  const cover = await image(entry.thumb);
  const images = [];
  for (const shot of entry.images) {
    const converted = await image(shot.file);
    if (converted) images.push({ ...converted, label: shot.label });
  }
  if (!cover) continue;
  data.push({
    ...entry,
    ...treatments[id],
    id,
    cover,
    images,
    featured: selected.includes(id),
    live: live[id]?.link && live[id].link !== "#" ? live[id].link : null,
  });
}
for (const [id, entry] of Object.entries(live)) {
  if (data.some((p) => p.id === id)) continue;
  const images = [];
  for (const file of entry.images) {
    const converted = await image(file);
    if (converted)
      images.push({ ...converted, label: entry.title + " interface" });
  }
  if (images.length)
    data.push({
      id,
      name: entry.title,
      title: entry.title,
      ...treatments[id],
      category: "Web & mobile",
      desc: entry.desc,
      role: null,
      timeline: null,
      type: "Project archive",
      cover: images[0],
      images,
      tech: entry.tech.map((name) => ({ name })),
      featured: selected.includes(id),
      live: entry.link !== "#" ? entry.link : null,
    });
}
const profile = await image("image/profile/profile.jpg");
await writeFile(
  resolve(here, "src/generated/projects.json"),
  JSON.stringify({ projects: data, selected, profile }, null, 2) + "\n",
);
await sharp(resolve(repo, "image/worldOfBooth/Gameplay1.png"))
  .resize(1200, 630, { fit: "cover" })
  .webp({ quality: 85 })
  .toFile(resolve(here, "public/media/share.webp"));
console.log(
  `Prepared ${data.length} projects and ${cache.size} original screenshots. No source images changed.`,
);
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
await writeFile(
  resolve(here, "public/archive.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Project archive — Fahmi Bastari</title><style>body{font-family:system-ui,sans-serif;max-width:1000px;margin:auto;padding:40px 24px;background:#101110;color:#eeeee8}a{color:inherit}h1{font-size:48px;letter-spacing:-.05em}article{padding:50px 0}p{font-size:18px;line-height:1.6;max-width:65ch}img{max-width:100%;height:auto}a:focus-visible{outline:3px solid #d7e2b0;outline-offset:5px}</style></head><body><a href="./">Back to the gallery</a><h1>Fahmi Bastari</h1><p>Fullstack developer. Selected work and project archive.</p>${data.map((p) => `<article id="${escape(p.id)}"><h2>${escape(p.title ?? p.name)}</h2><p>${escape(p.summary ?? p.desc)}</p><p>${[p.role, p.timeline, p.type].filter(Boolean).map(escape).join(" / ")}</p><img src="${escape(p.cover.src)}" alt="${escape(p.name)} interface" width="${p.cover.width}" height="${p.cover.height}" loading="lazy">${p.live ? `<p><a href="${escape(p.live)}">Visit project</a></p>` : ""}</article>`).join("")}<a href="mailto:fahmibastari.work@gmail.com">Contact Fahmi</a></body></html>`,
);
