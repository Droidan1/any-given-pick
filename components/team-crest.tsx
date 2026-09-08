import Image from "next/image";
import { canonicalTeamCode, getTeamLogoUrl } from "@/lib/team-logos";

type TeamCrestSize = "xs" | "sm" | "md" | "lg";

const PIXEL_SIZE: Record<TeamCrestSize, number> = {
  xs: 24,
  sm: 30,
  md: 38,
  lg: 46,
};

export function TeamCrest({
  code,
  size = "md",
  className,
}: {
  code: string;
  size?: TeamCrestSize;
  className?: string;
}) {
  const canonicalCode = canonicalTeamCode(code);
  const logoUrl = getTeamLogoUrl(canonicalCode);
  const pixelSize = PIXEL_SIZE[size];

  return (
    <span className={`team-crest team-crest--${size}${className ? ` ${className}` : ""}`} aria-hidden="true">
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt=""
          width={pixelSize}
          height={pixelSize}
          sizes={`${pixelSize}px`}
        />
      ) : (
        <span className="team-crest__fallback">{canonicalCode.slice(0, 2)}</span>
      )}
    </span>
  );
}

export function TeamCode({
  code,
  size = "sm",
  className,
}: {
  code: string;
  size?: TeamCrestSize;
  className?: string;
}) {
  return (
    <span className={`team-code${className ? ` ${className}` : ""}`}>
      <TeamCrest code={code} size={size} />
      <strong>{canonicalTeamCode(code)}</strong>
    </span>
  );
}

