import type { CSSProperties } from "react";

type BrandMarkProps = {
  className?: string;
  size?: number;
  style?: CSSProperties;
  title?: string;
};

export function BrandMark({ className, size, style, title }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      style={style}
      viewBox="0 0 160 160"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="160" height="160" rx="24" fill="#f7f0df" />
      <rect
        x="24"
        y="37"
        width="73"
        height="112"
        rx="10"
        fill="#123f31"
        stroke="#fffdf7"
        strokeWidth="4.5"
        transform="rotate(-12 60.5 93)"
      />
      <rect x="57" y="14" width="92" height="132" rx="13" fill="#123f31" stroke="#fffdf7" strokeWidth="4.5" />
      <path d="M57 63h15M57 79h15M134 63h15M134 79h15" fill="none" stroke="#fffdf7" strokeWidth="5" />
      <path
        d="M76 30h31c20 0 33 11 33 27s-13 27-33 27H99v17H76V30Z"
        fill="#f2c928"
      />
      <path
        d="m91 55 9 9 19-21"
        fill="none"
        stroke="#123f31"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m77 115 14 14m0-14-14 14" fill="none" stroke="#f2c928" strokeWidth="7" strokeLinecap="square" />
      <circle cx="130" cy="124" r="10" fill="none" stroke="#f2c928" strokeWidth="7" />
      <path
        d="M67 138c28 1 49-14 49-43"
        fill="none"
        stroke="#f2c928"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="m107 103 9-10 10 10" fill="none" stroke="#f2c928" strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M57 122v24h25L57 122Z" fill="#bc4f25" />
      <path d="m57 122 25 24" fill="none" stroke="#fffdf7" strokeWidth="5" />
    </svg>
  );
}
