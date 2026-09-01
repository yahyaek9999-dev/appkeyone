import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("card", {
  variants: {
    padding: {
      none: "",
      sm: "p-4",
      md: "p-5",
      lg: "p-6",
      xl: "p-8",
    },
  },
  defaultVariants: {
    padding: "md",
  },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ padding }), className)}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

export { Card, cardVariants };
