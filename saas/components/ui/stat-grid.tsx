import { cn } from "@/lib/utils";

export interface StatGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: 2 | 3 | 4;
}

const COLS_CLASS: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

export function StatGrid({ cols = 4, className, children, ...props }: StatGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2",
        COLS_CLASS[cols],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
