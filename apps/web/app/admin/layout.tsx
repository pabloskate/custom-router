import Image from "next/image";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-brand">
          <Link href="/">
            <span className="topbar-logo-lockup">
              <Image
                src="/brand/custom-router-wordmark.webp"
                alt="CustomRouter"
                width={240}
                height={61}
                className="topbar-wordmark"
                priority
              />
            </span>
          </Link>
          <span className="topbar-tagline">Self-hostable router</span>
        </div>
        <nav>
          <Link href="/">Quickstart</Link>
          <Link href="/open-source">Open Source</Link>
          <Link href="/admin" aria-current="page">Admin</Link>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}
