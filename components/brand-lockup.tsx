export function BrandLockup() {
  return (
    <span className="brand-lockup" aria-hidden="true">
      <svg className="brand-lockup__mark" viewBox="0 0 72 72">
        <path d="M10 58c7-25 24-42 49-47" />
        <path d="m48 5 12 6-9 10" />
        <circle cx="11" cy="58" r="6" />
        <path d="m20 20 10 10m0-10L20 30" />
      </svg>
      <span className="brand-lockup__type">
        <span>Any Given</span>
        <strong>Pick</strong>
      </span>
    </span>
  );
}
