import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bottom sheet on mobile (or centered if position='center'), centered card on wider screens. */
export function Sheet({
  open,
  onClose,
  children,
  label,
  className,
  position = "bottom",
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  label: string;
  className?: string;
  position?: "bottom" | "center";
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center",
        position === "center" ? "items-center p-4" : "items-end sm:items-center",
      )}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <button
        aria-label="Close"
        className="absolute inset-0 bg-overlay animate-in fade-in"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        className={cn(
          "relative mx-3 w-full max-w-md rounded-3xl bg-card shadow-soft animate-in fade-in duration-200",
          position === "center"
            ? "my-auto zoom-in-95"
            : "mb-[max(0.75rem,env(safe-area-inset-bottom))] sm:mb-0 slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function PrimaryButton({ className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={cn(
        "flex min-h-12 sm:min-h-14 w-full flex-col items-center justify-center rounded-full bg-primary px-6 text-base sm:text-lg font-bold text-primary-foreground shadow-button transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40",
        className,
      )}
    />
  );
}

export function SecondaryButton({
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={cn(
        "relative flex min-h-12 sm:min-h-14 w-full items-center justify-center rounded-full bg-card px-6 text-base sm:text-lg font-bold text-primary shadow-soft transition active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40",
        className,
      )}
    />
  );
}
