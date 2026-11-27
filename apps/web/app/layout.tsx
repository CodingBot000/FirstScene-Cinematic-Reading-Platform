import { headers } from "next/headers";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import "@firstscene/tokens/css";
import "@firstscene/ui/css";
import "./site.css";
import "../components/preview/preview-catalog.css";
import "../components/discovery.css";
import "../components/classics.css";
import "../components/cinematic-prologue.css";
import "./mobile-journey.css";
import "./story-cover-motion.css";
export const metadata: Metadata = {
  title: {
    default: "FirstScene — 문장을 읽고, 장면에 머물다.",
    template: "%s | FirstScene",
  },
  description:
    "가입 없이 오리지널 단편 2편과 저작권 보호기간 만료 고전 20편을 읽어보세요. 시네마틱 읽기와 원문 읽기를 선택할 수 있어요.",
};
export default async function Layout({ children }: { children: ReactNode }) {
  await headers();
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
