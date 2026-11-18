import { SiteShell } from "../components/SiteShell";
export default function NotFound() {
  return (
    <SiteShell>
      <article className="prose-page">
        <h1>
          이 장면은
          <br />
          찾을 수 없어요.
        </h1>
        <p>주소를 다시 확인하거나 두 편의 이야기로 돌아가 주세요.</p>
        <a href="/discover" className="fs-button fs-primary">
          이야기 탐색
        </a>
      </article>
    </SiteShell>
  );
}
