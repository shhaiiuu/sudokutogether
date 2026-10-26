import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Smile, X } from "lucide-react";
import type { Player, ChatMessage } from "@/lib/room";
import { Avatar } from "./PlayerList";
import { cn } from "@/lib/utils";

export type { ChatMessage };

const EMOJIS = ["🙂", "👍", "🎉", "🤔", "👏"];

export function ChatPanel({
  open,
  onClose,
  messages,
  players,
  typing,
  onSend,
  onRetry,
  onTyping,
}: {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  players: Player[];
  typing: string | null;
  onSend: (t: string) => void;
  onRetry?: (message: ChatMessage) => void;
  onTyping?: (typing: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const nearBottom = useRef(true);
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (!wasOpen.current || nearBottom.current) end.current?.scrollIntoView({ block: "end" });
    wasOpen.current = true;
  }, [messages.length, typing, open]);
  if (!open) return null;
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const opponents = players.filter((p) => !p.isYou);
  const subtitle =
    opponents.length === 0
      ? "Chat with your team"
      : `Chat with ${opponents.length === 1 ? opponents[0]?.name : "your teammates"}`;
  return (
    <aside
      aria-label="Room chat"
      className="fixed inset-x-2 bottom-[max(5rem,env(safe-area-inset-bottom))] z-50 flex h-[min(62dvh,34rem)] flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-2xl animate-in slide-in-from-bottom-6 fade-in sm:inset-x-auto sm:right-5 sm:w-[22rem]"
    >
      <header className="flex items-center gap-3 border-b border-border/70 bg-card px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Match Chat</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <div
        ref={list}
        onScroll={() => {
          const node = list.current;
          if (!node) return;
          nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
        }}
        className="flex-1 space-y-3 overflow-y-auto bg-background/30 px-3 py-4"
      >
        {messages.map((m) => {
          const p = byId[m.playerId];
          const mine = p?.isYou === true;
          const sender = mine ? "You" : (p?.name ?? "Player");
          const failed = m.delivery === "failed";
          return (
            <div key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
              {p && !mine && <Avatar player={p} size="sm" />}
              <div className={cn("flex max-w-[78%] flex-col", mine && "items-end")}>
                <p className="mb-1 px-1 text-xs font-bold text-muted-foreground">{sender}</p>
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm shadow-sm",
                    mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground",
                    failed && "border border-destructive bg-destructive/10 text-destructive",
                  )}
                >
                  <p className="break-words">{m.text}</p>
                  <p
                    className={cn(
                      "mt-1 text-[10px]",
                      mine && !failed ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {failed
                      ? "Failed to send"
                      : m.delivery === "sending"
                        ? "Sending…"
                        : new Date(m.at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                  </p>
                </div>
                {failed && onRetry && (
                  <button
                    onClick={() => onRetry(m)}
                    className="mt-1 px-1 text-xs font-semibold text-destructive underline"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="flex items-center gap-2 px-2">
            <span className="text-xs font-semibold text-muted-foreground">{typing}</span>
            <span className="inline-flex gap-0.5 text-muted-foreground" aria-label="typing">
              <span className="animate-bounce [animation-delay:-0.3s]">•</span>
              <span className="animate-bounce [animation-delay:-0.15s]">•</span>
              <span className="animate-bounce">•</span>
            </span>
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="relative flex items-center gap-2 border-t border-border/70 bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend(text.trim());
          setText("");
          setEmojiOpen(false);
          onTyping?.(false);
        }}
      >
        {emojiOpen && (
          <div
            className="absolute bottom-16 left-3 flex gap-1 rounded-2xl border bg-card p-2 shadow-soft"
            role="menu"
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                onClick={() => {
                  setText((value) => `${value}${emoji}`);
                  setEmojiOpen(false);
                }}
                className="rounded-lg p-1.5 text-lg hover:bg-muted"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          aria-label="Emoji"
          onClick={() => setEmojiOpen((value) => !value)}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted"
        >
          <Smile className="h-5 w-5" />
        </button>
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
          placeholder="Type a message…"
          maxLength={300}
          className="min-h-11 flex-1 rounded-full bg-muted px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-button disabled:opacity-40"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </aside>
  );
}
