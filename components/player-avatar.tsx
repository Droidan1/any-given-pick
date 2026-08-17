export function PlayerAvatar({
  displayName,
  photoUrl,
  size = 40,
}: {
  displayName: string;
  photoUrl: string | null;
  size?: number;
}) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "P";

  return (
    <span className="player-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {photoUrl ? (
        <span
          className="player-avatar__photo"
          style={{ backgroundImage: `url(${JSON.stringify(photoUrl)})` }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}
