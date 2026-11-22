type BrandMarkProps = { className?: string };

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="6" fill="#2458E6" />
      <path d="M10.5 13.1c0-1.16.94-2.1 2.1-2.1h7.8c1.16 0 2.1.94 2.1 2.1v9.8c0 1.16-.94 2.1-2.1 2.1h-7.8a2.1 2.1 0 0 1-2.1-2.1v-9.8Z" fill="white" />
      <path d="m23.75 15.23 4.31-2.54a.62.62 0 0 1 .94.55v9.52a.62.62 0 0 1-.94.55l-4.31-2.54v-5.54Z" fill="white" />
    </svg>
  );
}
