"use client";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
import * as D from "@radix-ui/react-dialog";
import { Button } from "./controls.js";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactNode;
  contentClassName?: string;
  onCloseAutoFocus?: (event: Event) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
};
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  contentClassName = "",
  onCloseAutoFocus,
  returnFocusTo,
}: DialogProps) {
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) returnFocus.current = document.activeElement as HTMLElement;
  }, [open]);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className="fs-dialog-overlay" />
        <D.Content
          className={`fs-dialog ${contentClassName}`}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (event.defaultPrevented) return;
            const target = returnFocusTo?.current ?? returnFocus.current;
            if (target?.isConnected && target !== document.body) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
        >
          <D.Title className="fs-type-title">{title}</D.Title>
          <D.Description
            className={description ? "fs-dialog-description" : "fs-sr-only"}
          >
            {description ?? title}
          </D.Description>
          {children}
          <D.Close asChild>
            <Button variant="secondary">닫기</Button>
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
export function Sheet({
  side = "bottom",
  ...props
}: DialogProps & { side?: "bottom" | "right" }) {
  return <Dialog {...props} contentClassName={`fs-sheet fs-sheet-${side}`} />;
}
