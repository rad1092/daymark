import { formatPlanDate } from "../../lib/daymark";
import type {
  DayReceipt,
  DaySummary,
  DaymarkTask,
  TaskHistoryEntry,
} from "../../types";
import { OUTCOME_LABELS, SUMMARY_COLUMNS } from "../constants";
import { SectionHeader } from "../components/TaskComponents";

export interface RecordsViewModel {
  today: string;
  recentReceipts: DayReceipt[];
  recentSummaries: DaySummary[];
  historyEntries: TaskHistoryEntry[];
  historyQuery: string;
  cleanupCandidates: DaymarkTask[];
}

export interface RecordsViewActions {
  onHistoryQueryChange: (query: string) => void;
  onCleanup: () => void;
}

interface RecordsViewProps {
  viewModel: RecordsViewModel;
  actions: RecordsViewActions;
}

export function RecordsView({
  viewModel,
  actions,
}: RecordsViewProps) {
  const {
    today,
    recentReceipts,
    recentSummaries,
    historyEntries,
    historyQuery,
    cleanupCandidates,
  } = viewModel;
  const visibleEntries = historyEntries.slice(
    0,
    historyQuery.trim() ? 50 : 12,
  );
  return (
    <main id="main" className="workspace records-workspace">
      <section className="records-heading">
        <div>
          <p>지난 흐름</p>
          <h1>기록</h1>
        </div>
        <p>날짜별로 무엇을 끝냈고, 무엇을 미뤘는지 확인합니다.</p>
      </section>

      <section className="receipt-history" aria-labelledby="receipt-title">
        <SectionHeader
          eyebrow="최근 종료"
          title="하루 기록"
          titleId="receipt-title"
        />
        {recentReceipts.length ? (
          <ol>
            {recentReceipts.map((receipt) => (
              <li key={receipt.date}>
                <header>
                  <time dateTime={receipt.date}>
                    {formatPlanDate(receipt.date)}
                  </time>
                  <strong>
                    {
                      receipt.items.filter(
                        (item) => item.outcome === "done",
                      ).length
                    }
                    /{receipt.items.length} 완료
                  </strong>
                </header>
                <ul>
                  {receipt.items.map((item) => (
                    <li key={item.taskId}>
                      <span>{item.title}</span>
                      <span>
                        {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                      </span>
                      {item.nextStep && <p>{item.nextStep}</p>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-copy">아직 닫은 하루가 없습니다.</p>
        )}
      </section>

      <section className="week-record" aria-labelledby="week-record-title">
        <SectionHeader
          eyebrow="최근 7일"
          title="하루 결정"
          titleId="week-record-title"
        />
        <div className="record-table-wrap">
          <table className="record-table" aria-labelledby="week-record-title">
            <thead>
              <tr>
                <th scope="col">날짜</th>
                {SUMMARY_COLUMNS.map((column) => (
                  <th scope="col" key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentSummaries.map((summary) => (
                <tr
                  key={summary.date}
                  className={summary.date === today ? "is-today" : ""}
                >
                  <th scope="row">
                    <time dateTime={summary.date}>
                      {formatPlanDate(summary.date)}
                    </time>
                    {summary.date === today && <span>오늘</span>}
                  </th>
                  {SUMMARY_COLUMNS.map((column) => (
                    <td key={column.key}>
                      <span
                        className={
                          summary.counts[column.key] === 0 ? "is-zero" : ""
                        }
                      >
                        {summary.counts[column.key]}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="history-search" aria-labelledby="history-title">
        <SectionHeader
          eyebrow="지난 작업"
          title="찾기"
          titleId="history-title"
          aside={<span className="count-badge">{historyEntries.length}</span>}
        />
        <label className="history-search-field" htmlFor="history-query">
          <span>제목·메모·막힌 이유 검색</span>
          <input
            id="history-query"
              type="search"
              value={historyQuery}
              onChange={(event) =>
                actions.onHistoryQueryChange(event.target.value)
              }
            placeholder="예: 견적서, 회신, 배포"
            autoComplete="off"
          />
        </label>
        {visibleEntries.length ? (
          <ol className="history-results">
            {visibleEntries.map((entry) => (
              <li key={entry.task.id}>
                <div>
                  <h3>{entry.task.title}</h3>
                  {entry.task.notes && <p>{entry.task.notes}</p>}
                </div>
                <div className="history-result-meta">
                  <span>
                    {OUTCOME_LABELS[entry.outcome] ?? entry.outcome}
                  </span>
                  <time dateTime={entry.date}>
                    {formatPlanDate(entry.date)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-copy">
            {historyQuery.trim()
              ? "검색어와 맞는 지난 작업이 없습니다."
              : "아직 지난 작업 기록이 없습니다."}
          </p>
        )}
      </section>

      <section className="cleanup-panel" aria-labelledby="cleanup-title">
        <div>
          <p>기록 정리</p>
          <h2 id="cleanup-title">30일이 지난 완료·삭제 항목</h2>
          <span>
            {cleanupCandidates.length
              ? `${cleanupCandidates.length}개를 정리할 수 있습니다.`
              : "정리할 오래된 항목이 없습니다."}
          </span>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={actions.onCleanup}
          disabled={cleanupCandidates.length === 0}
        >
          백업 후 정리
        </button>
      </section>
    </main>
  );
}
