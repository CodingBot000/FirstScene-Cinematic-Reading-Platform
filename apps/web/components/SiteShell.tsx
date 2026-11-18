import Link from "next/link";
import type { ReactNode } from "react";
export function SiteHeader() {
  return (
    <>
      <a href="#main" className="skip-link">
        본문 바로가기
      </a>
      <header className="site-header">
        <Link href="/" className="wordmark">
          FirstScene<span aria-hidden="true">.</span>
        </Link>
        <nav aria-label="주 메뉴">
          <Link href="/discover">탐색</Link>
          <Link href="/library">내 서재</Link>
          <Link href="/settings">설정</Link>
        </nav>
      </header>
    </>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link href="/" className="wordmark">
        FirstScene.
      </Link>
      <p>문장을 읽고, 장면에 머물다.</p>
      <Link href="/about">AI 제작·개인정보 안내</Link>
      <Link href="/design-system">디자인 시스템</Link>
    </footer>
  );
}
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="site-main">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
