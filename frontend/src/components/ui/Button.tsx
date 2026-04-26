import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-gradient-to-r from-violet-500 to-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/30 hover:from-violet-400 hover:to-cyan-300",
  secondary: "border border-white/10 bg-white/10 text-slate-100 hover:border-cyan-300/40 hover:bg-white/20",
  ghost: "text-slate-300 hover:bg-white/10 hover:text-white",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

const baseClasses = "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-300/60 focus:ring-offset-2 focus:ring-offset-slate-950";

function classes(variant: Variant, size: Size, className?: string) {
  return [baseClasses, variantClasses[variant], sizeClasses[size], className].filter(Boolean).join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return <button className={classes(variant, size, className)} {...props} />;
}

export type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
};

export function ButtonLink({ to, variant = "secondary", size = "md", className, children, ...props }: ButtonLinkProps) {
  return (
    <Link to={to} className={classes(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
