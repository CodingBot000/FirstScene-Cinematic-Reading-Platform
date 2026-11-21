import { headers } from "next/headers";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import "@firstscene/tokens/css";
import "@firstscene/ui/css";
import "./site.css";
import "../components/preview/preview-catalog.css";
import "../components/discovery.css";
import "../components/cinematic-prologue.css";
import "./mobile-journey.css";
export const metadata: Metadata = {
  title: {
    default: "FirstScene — 문장을 읽고, 장면에 머물다.",
    template: "%s | FirstScene",
  },
  description:
    "가입 없이 두 편의 오리지널 단편을 만나보세요. 장면 연출과 편안한 일반 읽기를 선택할 수 있어요.",
};
export default async function Layout({ children }: { children: ReactNode }) {
  await headers();
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
