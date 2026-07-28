import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("Daymark 첫 사용 흐름", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("입력에서 오늘 실행과 하루 닫기 뒤 수집까지 이어진다", () => {
    render(<App />);

    const input = screen.getByRole("textbox", { name: "새 일" });
    const inbox = screen.getByRole("region", {
      name: "분류를 기다리는 일",
    });
    const emptyPlan = screen.getByRole("region", { name: "할 일 0/3" });

    expect(
      input.compareDocumentPosition(inbox) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      inbox.compareDocumentPosition(emptyPlan) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "01 빈 자리 할 일 추가",
      }),
    );
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: "견적서 검토" } });
    fireEvent.click(screen.getByRole("button", { name: "수집함에 추가" }));
    expect(
      screen.getByRole("heading", { name: "견적서 검토" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    const draftInbox = screen.getByRole("region", {
      name: "분류를 기다리는 일",
    });
    const draftPlan = screen.getByRole("region", { name: "할 일 1/3" });
    expect(
      draftInbox.compareDocumentPosition(draftPlan) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "이 순서로 시작" }));
    expect(screen.getByText("현재 작업")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(screen.getByText("완료")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "하루 정리" }));
    fireEvent.click(screen.getByRole("button", { name: "오늘 닫기" }));
    expect(
      screen.getByRole("heading", { name: "오늘 정리 완료" }),
    ).toBeVisible();

    const closedInput = screen.getByRole("textbox", { name: "새 일" });
    fireEvent.change(closedInput, { target: { value: "내일 확인할 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "수집함에 추가" }));
    expect(
      screen.getByRole("heading", { name: "내일 확인할 메모" }),
    ).toBeVisible();
  });
});
