import { type FormEvent, type RefObject, useState } from "react";

interface CaptureBarProps {
  inputRef: RefObject<HTMLInputElement | null>;
  busy: boolean;
  onCapture: (title: string) => Promise<boolean>;
}

export function CaptureBar({
  inputRef,
  busy,
  onCapture,
}: CaptureBarProps) {
  const [title, setTitle] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    void onCapture(clean).then((saved) => {
      if (saved) setTitle("");
    });
  };

  return (
    <form className="software-capture" onSubmit={submit}>
      <label htmlFor="software-capture-input">빠른 수집</label>
      <div>
        <input
          ref={inputRef}
          id="software-capture-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="떠오른 일을 적고 Enter"
          autoComplete="off"
        />
        <button type="submit" disabled={!title.trim() || busy}>
          추가
        </button>
      </div>
    </form>
  );
}
