import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  loading?: boolean;
};

/** DS button. `loading` keeps the label and sets aria-busy; it never changes width. */
export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = ["sh-btn", `sh-btn--${variant}`, size !== "md" && `sh-btn--${size}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 size={14} className="sh-spin" aria-hidden /> : Icon ? <Icon size={14} aria-hidden /> : null}
      {children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /** Required: an icon-only control has no other accessible name. */
  label: string;
  icon: LucideIcon;
  size?: "sm" | "md";
  active?: boolean;
  outline?: boolean;
  children?: ReactNode;
};

export function IconButton({ label, icon: Icon, size = "md", active, outline, className, type = "button", ...rest }: IconButtonProps) {
  const cls = [
    "sh-iconbtn",
    size === "sm" && "sh-iconbtn--sm",
    active && "sh-iconbtn--active",
    outline && "sh-iconbtn--outline",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} aria-label={label} title={label} {...rest}>
      <Icon size={16} aria-hidden />
    </button>
  );
}
