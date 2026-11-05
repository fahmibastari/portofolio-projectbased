export interface Shot {
  src: string;
  width: number;
  height: number;
  label?: string;
}
export interface Project {
  id: string;
  name: string;
  title?: string;
  subtitle?: string;
  summary?: string;
  category: string;
  desc: string;
  role: string | null;
  timeline: string | null;
  type: string;
  cover: Shot;
  images: Shot[];
  tech: { name: string }[];
  live: string | null;
  color?: string;
  kind?: string;
  featured: boolean;
}
