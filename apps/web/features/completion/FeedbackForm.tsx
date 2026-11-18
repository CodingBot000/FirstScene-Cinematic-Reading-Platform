"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@firstscene/ui";
import type { FeedbackWrite } from "../reading-sync/transport.generated";
import type { FeedbackSendResult, SyncSnapshot } from "../reading-sync/store";
const options = [
  ["helpful", "연출이 몰입에 도움이 됐어요"],
  ["comfortable", "편안하게 읽었어요"],
  ["distracting", "연출이 읽기를 방해했어요"],
  ["too_fast", "글자 연출이 너무 빨랐어요"],
] as const;
export function FeedbackForm({
  storyId,
  remote,
  onSubmit,
}: {
  storyId: string;
  remote: SyncSnapshot;
  onSubmit: (
    input: FeedbackWrite,
    epoch: string,
  ) => Promise<FeedbackSendResult>;
}) {
  const [choice, setChoice] = useState<FeedbackWrite["code"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FeedbackSendResult | null>(null);
  const attempt = useRef<{ input: FeedbackWrite; epoch: string } | null>(null);
  const inFlight = useRef(false);
  const [cooling, setCooling] = useState(false);
  const retryAt =
    result && result.status !== "accepted" ? (result.retryAt ?? 0) : 0;
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setTimeout(
      () => setCooling(false),
      Math.max(0, retryAt - Date.now() + 10),
    );
    return () => clearTimeout(timer);
  }, [retryAt]);
  const offline = remote.status === "offline";
  const unavailable =
    remote.paused ||
    !remote.hydrated ||
    !remote.me ||
    remote.status === "expired";
  const retrying = result?.status === "retryable";
  const message = remote.paused
    ? "기록 삭제 상태를 확인하는 동안 평가는 보내지 않아요."
    : offline
      ? "오프라인에서는 보내지 않아요. 연결 후 직접 다시 보내 주세요."
      : result?.status === "accepted"
        ? "평가가 서버에 저장됐어요. 의견을 남겨 주셔서 고마워요."
        : (result?.message ??
          (!remote.hydrated
            ? "저장 상태를 확인한 뒤 평가할 수 있어요."
            : "선택한 항목만 저장해요. 자유 입력이나 개인정보는 받지 않아요."));
  async function send() {
    if (
      inFlight.current ||
      unavailable ||
      offline ||
      cooling ||
      !choice ||
      !remote.me
    )
      return;
    inFlight.current = true;
    setBusy(true);
    const current = attempt.current ?? {
      input: { storyId, code: choice, operationId: crypto.randomUUID() },
      epoch: remote.me.session.epoch,
    };
    attempt.current = current;
    try {
      const response = await onSubmit(current.input, current.epoch);
      setResult(response);
      setCooling(
        response.status !== "accepted" &&
          Boolean(response.retryAt && response.retryAt > Date.now()),
      );
      if (response.status !== "retryable") {
        attempt.current = null;
        if (response.status === "accepted") setChoice(null);
      }
    } catch {
      setResult({
        status: "retryable",
        message:
          "전송 결과를 확인하지 못했어요. 같은 평가로 다시 시도해 주세요.",
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="reader-feedback"
      aria-labelledby={"feedback-title-" + storyId}
    >
      <h3 id={"feedback-title-" + storyId}>이번 읽기는 어땠나요?</h3>
      <p className="reading-note">
        이 브라우저에서 작품별 하루 5회 · 한국 시간 자정에 초기화돼요.
      </p>
      <fieldset
        className="feedback-options"
        disabled={busy || unavailable || retrying || cooling}
      >
        <legend className="fs-sr-only">연출에 대한 평가 항목</legend>
        {options.map(([code, label]) => (
          <label key={code}>
            <input
              type="radio"
              name={"feedback-" + storyId}
              value={code}
              checked={choice === code}
              onChange={() => {
                setChoice(code);
                setResult(null);
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <Button
        variant="secondary"
        disabled={busy || unavailable || offline || cooling || !choice}
        aria-busy={busy}
        onClick={() => {
          void send();
        }}
      >
        {busy
          ? "평가 보내는 중…"
          : retrying
            ? "같은 평가 다시 보내기"
            : "평가 보내기"}
      </Button>
      <p className="reading-note" role="status">
        {message}
      </p>
    </section>
  );
}
