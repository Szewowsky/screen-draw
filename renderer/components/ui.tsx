import {
  createContext,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import { clsx } from "clsx";

type Tone = "secondary" | "tertiary";

export const toast = {
  error: (message: string) => console.error(message),
};

export function Toaster() {
  return null;
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({ children }: { children: ReactNode }) {
  return <span className="group/tooltip relative inline-flex items-center">{children}</span>;
}

export function TooltipTrigger({ children }: { asChild?: boolean; children: ReactElement }) {
  return children;
}

export function TooltipContent({
  children,
  shortcut,
  side = "top",
}: {
  children: ReactNode;
  shortcut?: string[];
  side?: "top" | "bottom";
}) {
  return (
    <span
      className={clsx(
        "pointer-events-none absolute left-1/2 z-50 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-zinc-100 shadow-xl group-hover/tooltip:block",
        side === "top" && "bottom-full mb-2",
        side === "bottom" && "top-full mt-2",
      )}
    >
      {children}
      {shortcut?.length ? <span className="ml-2 text-zinc-400">{shortcut.join(" ")}</span> : null}
    </span>
  );
}

export function Button({
  variant = "filled",
  size = "medium",
  iconOnly = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "accent" | "filled" | "transparent";
  size?: "small" | "medium" | "large";
  iconOnly?: boolean;
}) {
  return (
    <button
      {...props}
      className={clsx(
        "no-drag inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        variant === "accent" &&
          "rounded-full bg-orange-500 text-white shadow-sm hover:bg-orange-400 active:bg-orange-600",
        variant === "filled" && "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:bg-zinc-900",
        variant === "transparent" &&
          "bg-transparent text-zinc-100 hover:bg-white/8 active:bg-white/12",
        size === "small" && (iconOnly ? "size-8" : "h-8 px-3 text-sm"),
        size === "medium" && (iconOnly ? "size-9" : "h-9 px-4 text-sm"),
        size === "large" && (iconOnly ? "size-10" : "h-12 px-5 text-base"),
        className,
      )}
    />
  );
}

export function Switch({
  checked,
  disabled = false,
  onCheckedChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={clsx(
        "no-drag relative h-7 w-12 shrink-0 rounded-full border border-white/10 transition disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-orange-500" : "bg-[#2a2a2a]",
      )}
    >
      <span
        className={clsx(
          "absolute top-1 size-5 rounded-full bg-white shadow-sm transition",
          checked ? "left-6" : "left-1",
        )}
      />
    </button>
  );
}

export function ColorWell({
  value,
  onChange,
  onCommit,
  size: _size,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "size" | "type" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  /** Fires with the final color when the picker is dismissed (native change event). */
  onCommit?: (value: string) => void;
  size?: "small" | "medium";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // React's onChange maps to the continuous input event; the native change
  // event fires once with the final color when the picker closes.
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !onCommit) return;
    const handler = () => onCommit(input.value);
    input.addEventListener("change", handler);
    return () => input.removeEventListener("change", handler);
  }, [onCommit]);

  return (
    <label
      className={clsx(
        "no-drag relative inline-flex size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/10 shadow-inner",
        className,
      )}
      style={{ backgroundColor: value }}
    >
      <input
        {...props}
        ref={inputRef}
        type="color"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  );
}

export function ScrollArea({ toolbar, children }: { toolbar?: ReactNode; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  return (
    <div ref={scrollRef} className="h-screen overflow-y-auto bg-app text-primary">
      {toolbar}
      {children}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="drag-region sticky top-0 z-20 flex h-[72px] items-center justify-center bg-app/95 px-7 backdrop-blur-xl">
      {children}
    </div>
  );
}

export function ToolbarContent({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-3">{children}</div>;
}

export function ToolbarTitle({ children }: { children: ReactNode }) {
  return <h1 className="truncate text-[21px] font-bold leading-none text-zinc-50">{children}</h1>;
}

export function Text({
  children,
  variant,
  color,
  className,
}: {
  children: ReactNode;
  variant?: "small";
  color?: Tone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "leading-relaxed",
        variant === "small" ? "text-[13px] font-semibold" : "text-[16px] font-semibold",
        color === "secondary" && "text-secondary",
        color === "tertiary" && "text-tertiary",
        !color && "text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Separator({
  orientation = "horizontal",
}: {
  orientation?: "horizontal" | "vertical";
}) {
  return orientation === "vertical" ? (
    <div className="mx-0.5 h-4 w-px bg-white/10" />
  ) : (
    <div className="h-px w-full bg-white/10" />
  );
}

export function FieldSet({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      {title || description ? (
        <div className="flex flex-col gap-1">
          {title ? (
            <h2 className="text-[19px] font-bold leading-tight text-zinc-50">{title}</h2>
          ) : null}
          {description ? (
            <p className="text-[15px] font-semibold leading-snug text-zinc-400">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-[18px] bg-[#181818] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        {children}
      </div>
    </section>
  );
}

export function Field({
  label,
  orientation = "horizontal",
  children,
}: {
  label?: string;
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "flex gap-4 px-7 py-5",
        orientation === "horizontal" ? "items-center justify-between" : "flex-col",
      )}
    >
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {children}
    </div>
  );
}

export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-white/8">{children}</div>;
}

export function FieldContent({ children }: { children: ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[17px] font-bold leading-none text-zinc-50">
      {children}
    </label>
  );
}

const SegmentedContext = createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
} | null>(null);

export function SegmentedControl({
  value,
  onValueChange,
  children,
  className,
}: {
  type?: "single";
  size?: "small";
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <SegmentedContext.Provider value={{ value, onValueChange }}>
      <div
        className={clsx(
          "no-drag inline-flex items-center rounded-[14px] bg-[#242424] p-1.5",
          className,
        )}
      >
        {children}
      </div>
    </SegmentedContext.Provider>
  );
}

export function SegmentedControlItem({
  value,
  children,
  iconOnly,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
  iconOnly?: boolean;
}) {
  const context = useContext(SegmentedContext);
  const selected = context?.value === value;

  return (
    <button
      {...props}
      type="button"
      aria-pressed={selected}
      onClick={(event) => {
        props.onClick?.(event);
        context?.onValueChange?.(value);
      }}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-md text-zinc-200 transition hover:bg-white/8",
        iconOnly ? "size-8" : "h-8 px-3 text-sm font-semibold",
        selected && "bg-orange-500/95 text-white shadow-sm hover:bg-orange-500",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onValueChange,
  startContent,
  endContent,
  className,
  endContentClassName,
}: {
  variant?: "filled";
  size?: "small";
  value: number[];
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number[]) => void;
  startContent?: ReactNode;
  endContent?: (value: number) => ReactNode;
  className?: string;
  endContentClassName?: string;
  "aria-label"?: string;
}) {
  const current = value[0] ?? min;
  const fill = Math.min(100, Math.max(0, ((current - min) / (max - min)) * 100));

  return (
    <div
      className={clsx(
        "no-drag relative flex h-11 items-center overflow-hidden rounded-xl bg-[#242424] text-zinc-50",
        className,
      )}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 bg-[#5d3924]/55"
        style={{ width: `${Math.max(18, fill)}%` }}
      />
      {startContent ? (
        <span className="pointer-events-none relative z-10 flex h-full w-12 items-center justify-center text-zinc-100">
          {startContent}
        </span>
      ) : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(event) => onValueChange([Number(event.currentTarget.value)])}
        className="absolute inset-0 z-20 cursor-pointer opacity-0"
      />
      {endContent ? (
        <span
          className={clsx(
            "pointer-events-none relative z-10 ml-auto min-w-9 pr-4 text-right text-base font-bold",
            endContentClassName,
          )}
        >
          {endContent(current)}
        </span>
      ) : null}
    </div>
  );
}

export function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-white/10 bg-[#1d1d1d] px-1.5 text-[12px] font-bold leading-none text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {children}
    </kbd>
  );
}

export function KeyGroup({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1">{children}</span>;
}

export function RadioGroup({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal";
  children: ReactNode;
}) {
  return (
    <SegmentedContext.Provider value={{ value, onValueChange }}>
      <div className="no-drag flex items-center gap-2">{children}</div>
    </SegmentedContext.Provider>
  );
}

export function RadioGroupItem({ value }: { value: string }) {
  const context = useContext(SegmentedContext);
  const selected = context?.value === value;

  return (
    <span
      aria-hidden
      onClick={() => context?.onValueChange?.(value)}
      className={clsx(
        "inline-flex size-4 rounded-full border border-zinc-500",
        selected && "border-orange-400 bg-orange-500 shadow-[inset_0_0_0_3px_rgba(24,24,27,1)]",
      )}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="no-drag inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-zinc-200">
      {children}
    </span>
  );
}

export function ErrorBoundaryView() {
  return (
    <div className="flex h-screen items-center justify-center bg-app px-6 text-center text-sm font-semibold text-red-300">
      Something went wrong.
    </div>
  );
}
