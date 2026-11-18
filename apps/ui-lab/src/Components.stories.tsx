import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  Button,
  IconButton,
  Typography,
  StoryCard,
  Tag,
  Dialog,
  Sheet,
  Tabs,
  ToggleGroup,
  Slider,
  Progress,
  Toast,
  EmptyState,
  ErrorState,
  ResponsiveAsset,
  ReadingToolbar,
} from "@firstscene/ui";
function DialogExample({ sheet = false }: { sheet?: boolean }) {
  const [open, setOpen] = useState(false);
  const Component = sheet ? Sheet : Dialog;
  return (
    <>
      <Button onClick={() => setOpen(true)}>설정 열기</Button>
      <Component
        open={open}
        onOpenChange={setOpen}
        title="읽기 설정"
        description="즉시 반영되는 설정입니다."
      >
        <p>Escape로 닫고 원래 버튼으로 돌아갈 수 있어요.</p>
        <Button variant="secondary">포커스 검사</Button>
      </Component>
    </>
  );
}
function Controls() {
  const [value, setValue] = useState("cinematic");
  const [range, setRange] = useState(40);
  return (
    <>
      <ToggleGroup
        label="읽기 모드"
        value={value}
        onValueChange={setValue}
        options={[
          { value: "cinematic", label: "연출 읽기" },
          { value: "plain", label: "일반 읽기" },
          { value: "disabled", label: "사용 불가", disabled: true },
        ]}
      />
      <Slider
        label="예제 값"
        value={range}
        onChange={setRange}
        valueText={range + "%"}
      />
      <Tabs
        value={value}
        onValueChange={setValue}
        items={[
          {
            value: "cinematic",
            label: "연출",
            content: <p>장면과 함께 읽습니다.</p>,
          },
          { value: "plain", label: "일반", content: <p>본문에 집중합니다.</p> },
        ]}
      />
    </>
  );
}
const meta = {
  title: "FirstScene/Components",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const ButtonStates: Story = {
  render: () => (
    <div className="lab lab-row">
      <Button>첫 장면 읽기</Button>
      <Button variant="secondary">내 서재에 저장</Button>
      <Button variant="ghost">목차</Button>
      <Button disabled>사용 불가</Button>
      <Button loading>저장 중</Button>
      <Button variant="destructive">독서 기록 삭제</Button>
    </div>
  ),
};
export const IconButtonStates: Story = {
  render: () => (
    <div className="lab lab-row">
      <IconButton label="이 문장 저장" icon="☆" />
      <IconButton label="문장 저장 해제" icon="★" pressed />
      <IconButton label="사용 불가" icon="☆" disabled />
    </div>
  ),
};
export const TypeScale: Story = {
  render: () => (
    <div className="lab">
      <Typography as="h1" variant="display">
        문장을 읽고,
        <br />
        장면에 머물다.
      </Typography>
      <Typography as="h2" variant="title">
        두 편의 이야기
      </Typography>
      <Typography variant="reading">
        글을 읽는 속도는 스스로 고를 수 있어야 합니다.
      </Typography>
      <Typography variant="caption">
        가입 없이 첫 장면부터 읽어보세요.
      </Typography>
    </div>
  ),
};
export const StoryCardStates: Story = {
  render: () => (
    <div className="lab">
      <StoryCard
        id="sample"
        title="읽기 예제"
        summary="이 이야기는 UI Lab의 독립 소비 예제입니다. 실제 작품 원고를 import하지 않습니다."
        cover={{ variants: [], alt: "에셋 미연결 상태" }}
        href="#sample"
        tags={["잔잔함", "예제"]}
        progress={0.4}
      />
    </div>
  ),
};
export const TagStates: Story = {
  render: () => (
    <div className="lab lab-row">
      <Tag>잔잔함</Tag>
      <Tag tone="accent">미스터리</Tag>
    </div>
  ),
};
export const DialogStates: Story = {
  render: () => (
    <div className="lab">
      <DialogExample />
    </div>
  ),
};
export const SheetStates: Story = {
  render: () => (
    <div className="lab">
      <DialogExample sheet />
    </div>
  ),
};
export const TabsStates: Story = {
  render: () => (
    <div className="lab">
      <Controls />
    </div>
  ),
};
export const ToggleGroupStates: Story = TabsStates;
export const SliderStates: Story = TabsStates;
export const ProgressStates: Story = {
  render: () => (
    <div className="lab">
      읽은 범위
      <Progress value={0.4} label="읽은 범위" />
      <Progress value={0} label="아직 읽지 않음" />
      <Progress value={1} label="끝까지 읽음" />
    </div>
  ),
};
export const ToastStates: Story = {
  render: () => (
    <div className="lab">
      <Toast message="문장을 저장했어요." tone="success" onDismiss={() => {}} />
      <Toast
        message="연결이 끊겼어요. 이 기기에 임시 저장하고 있어요."
        tone="error"
      />
    </div>
  ),
};
export const EmptyStateStates: Story = {
  render: () => (
    <div className="lab">
      <EmptyState
        title="아직 저장한 이야기가 없어요."
        description="마음에 드는 이야기를 만나보세요."
        action={<a href="#discover">작품 탐색</a>}
      />
    </div>
  ),
};
export const ErrorStateStates: Story = {
  render: () => (
    <div className="lab">
      <ErrorState
        title="기록을 불러오지 못했어요."
        message="본문은 계속 읽을 수 있어요."
        onRetry={() => {}}
      />
    </div>
  ),
};
export const ResponsiveAssetStates: Story = {
  render: () => (
    <div className="lab">
      <ResponsiveAsset variants={[]} alt="아직 이미지가 연결되지 않은 상태" />
      <ResponsiveAsset variants={[]} alt="" decorative />
    </div>
  ),
};
export const ReadingToolbarStates: Story = {
  render: () => (
    <ReadingToolbar
      title="독립 패키지 읽기 예제"
      sceneIndex={1}
      sceneCount={6}
      saveStatus="이 기기에 임시 저장 중"
      onBack={() => {}}
      onSettings={() => {}}
      onToc={() => {}}
    />
  ),
};
export const Overview: Story = {
  render: () => (
    <div className="lab">
      <h1>FirstScene</h1>
      <p>책의 여백과 영화의 장면</p>
      <section className="lab-example">
        <Typography as="h2" variant="title">
          읽기는 편안하게, 연출은 선택으로
        </Typography>
        <Typography variant="reading">
          문장은 장면이 사라져도 남아 있습니다. 그림보다 먼저, 읽는 사람의
          속도를 생각합니다.
        </Typography>
      </section>
      <section className="lab-example lab-row">
        <Button>첫 장면 읽기</Button>
        <Button variant="secondary">내 서재에 저장</Button>
        <IconButton label="설정" icon="⚙" />
        <Tag>잔잔함</Tag>
      </section>
      <section className="lab-example">
        <Controls />
      </section>
      <section className="lab-example">
        <DialogExample />
        <EmptyState
          title="아직 저장한 이야기가 없어요."
          description="두 편의 이야기에서 첫 장면을 골라보세요."
        />
      </section>
    </div>
  ),
};
