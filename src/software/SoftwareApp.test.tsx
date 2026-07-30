import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import SoftwareApp from "./SoftwareApp";
import { CaptureBar } from "./components/CaptureBar";

describe("installed software surface", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("captures, commits, resumes, and closes a daily promise", async () => {
    render(<SoftwareApp />);

    expect(
      await screen.findByRole("heading", {
        name: "오늘 끝낼 약속",
      }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("빠른 수집"), {
      target: { value: "배포 문서 검토" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(
      await screen.findByText("배포 문서 검토"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    await waitFor(() =>
      expect(screen.getByText("1 / 3")).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "이 순서로 시작" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "배포 문서 검토",
      }),
    ).toBeInTheDocument();

    const nextStep = screen.getByLabelText("다시 시작할 지점");
    fireEvent.change(nextStep, {
      target: { value: "배포 전제 표부터 확인" },
    });
    fireEvent.blur(nextStep);
    await waitFor(() => {
      expect(
        window.localStorage.getItem(
          "daymark:software-preview:data:v3",
        ),
      ).toContain("배포 전제 표부터 확인");
    });

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(
      await screen.findByRole("heading", {
        name: "세 약속을 모두 결정했습니다.",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "오늘 닫기" }));
    expect(
      await screen.findByRole("heading", {
        name: "오늘의 약속을 닫았습니다.",
      }),
    ).toBeInTheDocument();
  });

  it("keeps capture text when the repository rejects a save", async () => {
    const inputRef = { current: null };
    render(
      <CaptureBar
        inputRef={inputRef}
        busy={false}
        onCapture={async () => false}
      />,
    );
    const input = screen.getByLabelText("빠른 수집");
    fireEvent.change(input, { target: { value: "사라지면 안 되는 입력" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() =>
      expect(input).toHaveValue("사라지면 안 되는 입력"),
    );
  });
});
