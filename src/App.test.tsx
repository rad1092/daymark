import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import {
  BACKUP_KEY,
  CORRUPT_PRIMARY_KEY,
  STORAGE_KEY,
  addCapturedTask,
  createEmptyData,
  parseDaymarkData,
} from "./lib/daymark";

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

    fireEvent.click(
      screen.getByText("수집함 0").closest("summary") as HTMLElement,
    );
    const closedInput = screen.getByRole("textbox", { name: "새 일" });
    fireEvent.change(closedInput, { target: { value: "내일 확인할 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "수집함에 추가" }));
    expect(
      screen.getByRole("heading", { name: "내일 확인할 메모" }),
    ).toBeVisible();
  });

  it("오늘과 기록 화면을 제품 안에서 오간다", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "기록 화면" }));
    expect(screen.getByRole("heading", { name: "기록" })).toBeVisible();
    expect(
      screen.getByRole("table", { name: /하루 결정/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: "제목·메모·막힌 이유 검색" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "오늘 화면" }));
    expect(screen.getByRole("heading", { name: "오늘 할 일" })).toBeVisible();
  });

  it("시작 전에는 교체하고, 시작 뒤에는 세 약속을 늘리지 않는다", () => {
    render(<App />);

    const capture = (title: string) => {
      const input = screen.getByRole("textbox", { name: "새 일" });
      fireEvent.change(input, { target: { value: title } });
      fireEvent.click(screen.getByRole("button", { name: "수집함에 추가" }));
    };
    const addToday = (title: string) => {
      const card = screen
        .getByRole("heading", { name: title })
        .closest("article") as HTMLElement;
      fireEvent.click(within(card).getByRole("button", { name: "오늘" }));
    };

    ["첫째", "둘째", "셋째", "교체"].forEach(capture);
    ["첫째", "둘째", "셋째"].forEach(addToday);

    const firstCard = screen
      .getByRole("heading", { name: "첫째" })
      .closest("article") as HTMLElement;
    fireEvent.click(
      within(firstCard).getByRole("button", { name: "오늘에서 빼기" }),
    );
    addToday("교체");
    fireEvent.click(screen.getByRole("button", { name: "이 순서로 시작" }));

    expect(
      screen.getByRole("region", { name: "현재 작업과 다음 2개" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByText("수집함 1").closest("summary") as HTMLElement,
    );
    const removedCard = screen
      .getByRole("heading", { name: "첫째" })
      .closest("article") as HTMLElement;
    expect(
      within(removedCard).getByRole("button", { name: "오늘" }),
    ).toBeDisabled();
  });

  it("미룰 때 날짜와 다음 행동을 받고 최근 변경을 되돌린다", () => {
    render(<App />);
    const input = screen.getByRole("textbox", { name: "새 일" });
    fireEvent.change(input, { target: { value: "배포 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "수집함에 추가" }));
    const inboxCard = screen
      .getByRole("heading", { name: "배포 확인" })
      .closest("article") as HTMLElement;
    fireEvent.click(within(inboxCard).getByRole("button", { name: "오늘" }));
    fireEvent.click(screen.getByRole("button", { name: "이 순서로 시작" }));

    const currentCard = screen
      .getByRole("heading", { name: "배포 확인" })
      .closest("article") as HTMLElement;
    fireEvent.click(within(currentCard).getByText("더보기"));
    fireEvent.click(
      within(currentCard).getByRole("button", { name: "날짜 지정" }),
    );

    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "날짜 저장" });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("다음 행동"), {
      target: { value: "운영 주소에서 응답 확인" },
    });
    fireEvent.change(within(dialog).getByLabelText("다시 볼 날짜"), {
      target: { value: "2099-01-01" },
    });
    fireEvent.click(submit);

    expect(screen.getByRole("button", { name: "되돌리기" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(
      screen.getByRole("heading", { name: "배포 확인" }),
    ).toBeVisible();
    expect(screen.getByText("현재 작업")).toBeVisible();
  });

  it("설치 앱의 저장 공간 차이를 데이터 화면에서 안내한다", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "데이터" }));

    expect(
      screen.getByText(/설치 앱은 Safari와 저장 공간이 다릅니다/),
    ).toBeVisible();
    expect(screen.getByText("복구 지점")).toBeVisible();
  });

  it("손상된 primary 대신 연 정상 백업을 확정 복구한다", async () => {
    const now = new Date("2026-07-29T09:00:00+09:00");
    const backup = addCapturedTask(
      createEmptyData(now),
      "백업에 남은 일",
      now,
    );
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    window.localStorage.setItem(STORAGE_KEY, "{broken");

    render(<App />);

    expect(screen.getAllByText("백업 확인 필요")[0]).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "백업에 남은 일" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "데이터" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "이 백업으로 복구" }),
    );

    await waitFor(() =>
      expect(window.localStorage.getItem(CORRUPT_PRIMARY_KEY)).toBe("{broken"),
    );
    expect(
      parseDaymarkData(window.localStorage.getItem(STORAGE_KEY)!),
    ).toEqual(backup);

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    const input = screen.getByRole("textbox", { name: "새 일" });
    fireEvent.change(input, { target: { value: "복구 뒤 추가" } });
    fireEvent.click(screen.getByRole("button", { name: "수집함에 추가" }));

    await waitFor(() =>
      expect(
        parseDaymarkData(window.localStorage.getItem(STORAGE_KEY)!).tasks,
      ).toHaveLength(2),
    );
  });

  it("같은 revision의 다른 탭 내용을 충돌로 감지한다", async () => {
    render(<App />);
    const now = new Date("2026-07-29T09:00:00+09:00");
    const external = {
      ...addCapturedTask(createEmptyData(now), "다른 탭 작업", now),
      revision: 0,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(external));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: JSON.stringify(external),
      }),
    );

    expect(
      await screen.findByText("다른 탭에서 변경됨"),
    ).toBeVisible();
  });

  it("같은 revision의 저장 CAS 실패도 충돌 화면으로 연결한다", async () => {
    render(<App />);
    const now = new Date("2026-07-29T09:00:00+09:00");
    const external = {
      ...addCapturedTask(
        createEmptyData(now),
        "먼저 저장된 작업",
        now,
      ),
      revision: 0,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(external));

    const input = screen.getByRole("textbox", { name: "새 일" });
    fireEvent.change(input, { target: { value: "현재 탭 작업" } });
    fireEvent.click(screen.getByRole("button", { name: "수집함에 추가" }));

    expect(
      await screen.findByText("다른 탭에서 변경됨"),
    ).toBeVisible();
    expect(
      parseDaymarkData(window.localStorage.getItem(STORAGE_KEY)!),
    ).toEqual(external);
  });

  it("저장이 잠긴 임시 상태에서는 사라질 변경을 만들지 않는다", () => {
    window.localStorage.setItem(STORAGE_KEY, "{broken-primary");
    window.localStorage.setItem(BACKUP_KEY, "{broken-backup");
    render(<App />);

    const input = screen.getByRole("textbox", { name: "새 일" });
    fireEvent.change(input, { target: { value: "저장되지 않을 일" } });
    fireEvent.click(screen.getByRole("button", { name: "수집함에 추가" }));

    expect(screen.getByText("저장 문제를 먼저 해결해 주세요.")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "저장되지 않을 일" }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("{broken-primary");
  });
});
