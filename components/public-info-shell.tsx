import Link from "next/link";
import { BrandLockup } from "./brand-lockup";
import { PublicSiteFooter } from "./public-site-footer";

export function PublicInfoShell({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <main className="public-info-shell">
      <header className="public-info-header">
        <Link href="/" className="public-info-brand" aria-label="Any Given Pick home"><BrandLockup /></Link>
        <nav aria-label="Information pages">
          <Link href="/rules">Rules</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/support">Support</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>
      <article className="public-info-sheet">
        <header className="public-info-intro">
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          <span>{summary}</span>
        </header>
        <div className="public-info-content">{children}</div>
      </article>
      <PublicSiteFooter />
    </main>
  );
}
