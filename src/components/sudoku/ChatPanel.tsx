import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import type { Player, ChatMessage } from "@/lib/room";
import { Avatar } from "./PlayerList";
import { cn } from "@/lib/utils";

export type { ChatMessage };

export function ChatPanel({
  open,
  onClose,
  messages,
  players,
  typing,
  onSend,
  onTyping,
}: {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  players: Player[];
  typing: string | null;
  onSend: (t: string) => void;
  onTyping?: (typing: boolean) => void;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, typing, open]);
  if (!open) return null;
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  return (
    <aside
      aria-label="Room chat"
      className="fixed inset-x-2 bottom-2 z-40 flex h-[min(55dvh,28rem)] flex-col rounded-3xl border bg-card shadow-soft animate-in slide-in-from-bottom-6 fade-in sm:inset-x-auto sm:right-4 sm:w-80"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="font-bold">Room chat</h2>
          <p className="text-[11px] text-muted-foreground">
            Server-confirmed messages · room history is saved
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((m) => {
          const p = byId[m.playerId];
          const mine = p?.isYou;
          return (
            <div key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
              {p && !mine && <Avatar player={p} size="sm" />}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                  mine
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted",
                )}
              >
                {!mine && <p className="text-xs font-bold text-muted-foreground">{p?.name}</p>}
                <p className="break-words">{m.text}</p>
                <p
                  className={cn(
                    "mt-0.5 text-[10px]",
                    mine ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {mine && " · sent"}
                </p>
              </div>
            </div>
          );
        })}
        {typing && <p className="px-2 text-xs italic text-muted-foreground">{typing} is typing…</p>}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend(text.trim());
          setText("");
          onTyping?.(false);
        }}
      >
        <label className="sr-only" htmlFor="chat-input">
          Message
        </label>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            onTyping?.(Boolean(next.trim()));
          }}
          onBlur={() => onTyping?.(false)}
          placeholder="Message your team…"
          maxLength={300}
          className="min-h-11 flex-1 rounded-full bg-muted px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </aside>
  );
}
