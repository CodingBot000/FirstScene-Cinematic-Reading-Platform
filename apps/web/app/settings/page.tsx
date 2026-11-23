import { SiteShell } from "../../components/SiteShell";
import { SettingsPanel } from "./_components/SettingsPanel";
export const metadata = { title: "읽기 설정" };
export default function Settings() {
  return (
    <SiteShell>
      <article className="prose-page">
        <h1>
          나의 속도로,
          <br />
          편안하게 읽기.
        </h1>
        <p>연출과 읽기 환경을 고르고, 이 브라우저에 임시 저장하세요.</p>
        <SettingsPanel />
        <p>
          <a href="/about" className="fs-text-link">
            AI 제작·개인정보 안내
          </a>
        </p>
      </article>
    </SiteShell>
  );
}
