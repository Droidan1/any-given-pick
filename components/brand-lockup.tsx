import { BrandMark } from "./brand-mark";

export function BrandLockup() {
  return (
    <span className="brand-lockup" aria-hidden="true">
      <BrandMark className="brand-lockup__mark" />
      <span className="brand-lockup__type">
        <span>Any Given</span>
        <strong>Pick</strong>
      </span>
    </span>
  );
}
