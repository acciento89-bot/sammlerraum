import type { IconName } from "./workspace-navigation";
const paths: Record<IconName, string> = {
  home: "m3 10 9-7 9 7v10H3z M9 20v-7h6v7",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  spark: "m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z",
  book: "M12 5C8 2 4 3 2 4v15c3-2 7-2 10 0 3-2 7-2 10 0V4c-3-1-7-2-10 1v14",
  compass: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M16 8l-3 5-5 3 3-5z",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M18 3a4 4 0 0 1 0 8 M18 15a4 4 0 0 1 4 4v2",
  upload: "M12 16V3 M7 8l5-5 5 5 M3 15v6h18v-6",
  download: "M12 3v13 M7 11l5 5 5-5 M3 17v4h18v-4",
  shield: "m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z m-5 10 3 3 7-7",
  star: "m12 2 3 6.5 7 1-5 5 1 7-6-3.5L6 21l1-6.5-5-5 7-1z",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  lock: "M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4",
  arrow: "M4 12h16 m-6-6 6 6-6 6",
  plus: "M12 4v16 M4 12h16",
  check: "m5 12 4 4L19 6",
  layers: "m12 2 10 5-10 5L2 7z M2 12l10 5 10-5 M2 17l10 5 10-5",
};
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`sr-icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
