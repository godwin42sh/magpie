type LogoProps = {
  /** Rendered width/height in px. */
  size?: number;
  className?: string;
};

/**
 * The Magpie mark: a perched magpie (signature long tail) on an accent roundel.
 * Self-contained SVG (fixed colors) so it renders identically in the top bar,
 * and mirrors public/favicon.svg used as the browser tab icon.
 */
export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Magpie logo"
    >
      <circle cx="32" cy="32" r="32" fill="#5b8cff" />
      <path d="M34 33 C 27 40 19 48 12 54 L 17 57 C 25 50 33 43 39 37 Z" fill="#14233f" />
      <ellipse cx="35" cy="37" rx="12" ry="11" fill="#ffffff" />
      <path
        d="M23 37 C 23 28 30 22 39 24 C 47 25 50 33 45 41 C 45 35 40 32 35 33 C 30 34 25 36 23 37 Z"
        fill="#14233f"
      />
      <circle cx="45" cy="23" r="8" fill="#14233f" />
      <path d="M52 21 L 60 23 L 52 26 Z" fill="#14233f" />
      <ellipse cx="32" cy="31" rx="4" ry="2.3" fill="#ffffff" />
      <circle cx="46.5" cy="22" r="1.7" fill="#ffffff" />
    </svg>
  );
}
