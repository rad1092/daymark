export const OUTCOME_LABELS: Record<string, string> = {
  done: "완료",
  tomorrow: "내일",
  later: "날짜 지정",
  blocked: "막힘",
  deleted: "삭제",
  carried: "다시 선택",
  planned: "계획",
  inbox: "수집",
};

export const SUMMARY_COLUMNS = [
  { key: "done", label: "완료" },
  { key: "tomorrow", label: "내일" },
  { key: "later", label: "나중" },
  { key: "blocked", label: "막힘" },
  { key: "deleted", label: "삭제" },
] as const;
