import Link from "next/link";

export function PublicSiteFooter() {
  return (
    <footer className="public-site-footer">
      <nav aria-label="Beta information">
        <Link href="/rules">Beta rules</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/support">Support</Link>
      </nav>
      <p>Built by <a href="https://droidan1.dev">Droidan1</a> · Any Given Pick beta</p>
    </footer>
  );
}
