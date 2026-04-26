import type { HTMLAttributes, ReactNode } from "react";

type Tone = "default" | "muted" | "highlight";

const toneClasses: Record<Tone, string> = {
  default: "border-white/10 bg-white/[0.06] shadow-2xl shadow-slate-950/20",
  muted: "border-white/10 bg-slate-950/35",
  highlight: "border-cyan-300/25 bg-gradient-to-br from-cyan-400/15 via-violet-500/10 to-white/[0.05] shadow-2xl shadow-cyan-950/20",
};

export function Card({ className, tone = "default", ...props }: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return <div className={["rounded-2xl border backdrop-blur", toneClasses[tone], className].filter(Boolean).join(" ")} {...props} />;
}

export function CardHeader({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-300">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={["p-5", className].filter(Boolean).join(" ")} {...props} />;
}
