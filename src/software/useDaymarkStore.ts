import { useCallback, useEffect, useRef, useState } from "react";
import { createEmptyData } from "../lib/daymark";
import type { DaymarkRepository } from "../storage/repository";
import type { DaymarkData } from "../types";

export type StoreStatus = "loading" | "ready" | "saving" | "failed";

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "요청을 처리하지 못했습니다.";
}

export type CommitData = (
  operation: (current: DaymarkData) => DaymarkData,
  success?: string,
) => Promise<boolean>;

export function useDaymarkStore(repository: DaymarkRepository) {
  const [data, setData] = useState<DaymarkData | null>(null);
  const dataRef = useRef<DaymarkData | null>(null);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [status, setStatus] = useState<StoreStatus>("loading");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      let loaded = await repository.load();
      if (!loaded) {
        loaded = createEmptyData();
        await repository.save(loaded, null);
      }
      dataRef.current = loaded;
      setData(loaded);
      setStatus("ready");
      setNotice("");
    } catch (error) {
      setStatus("failed");
      setNotice(errorMessage(error));
    }
  }, [repository]);

  useEffect(() => {
    let cancelled = false;
    const openRepository = async () => {
      try {
        let loaded = await repository.load();
        if (!loaded) {
          loaded = createEmptyData();
          await repository.save(loaded, null);
        }
        if (cancelled) return;
        dataRef.current = loaded;
        setData(loaded);
        setStatus("ready");
        setNotice("");
      } catch (error) {
        if (cancelled) return;
        setStatus("failed");
        setNotice(errorMessage(error));
      }
    };
    void openRepository();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const commit = useCallback<CommitData>(
    (operation, success) => {
      const run = async (): Promise<boolean> => {
        const current = dataRef.current;
        if (!current) {
          setStatus("failed");
          setNotice("Daymark 저장소가 아직 준비되지 않았습니다.");
          return false;
        }
        try {
          const next = operation(current);
          if (next === current) return true;
          setStatus("saving");
          await repository.save(next, current.revision);
          dataRef.current = next;
          setData(next);
          setStatus("ready");
          if (success) setNotice(success);
          return true;
        } catch (error) {
          setStatus("failed");
          setNotice(errorMessage(error));
          return false;
        }
      };
      const scheduled = saveQueueRef.current.then(run, run);
      saveQueueRef.current = scheduled.then(
        () => undefined,
        () => undefined,
      );
      return scheduled;
    },
    [repository],
  );

  return {
    data,
    status,
    notice,
    setNotice,
    commit,
    reload: load,
  };
}
