import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/react-app/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50", {
	variants: { variant: { default: "bg-primary text-primary-foreground hover:bg-primary/90", outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground", ghost: "hover:bg-accent hover:text-accent-foreground", destructive: "bg-destructive text-white hover:bg-destructive/90" }, size: { default: "h-10 px-4 py-2", sm: "h-8 rounded-md px-3 text-xs", lg: "h-11 rounded-md px-6", icon: "size-10" } },
	defaultVariants: { variant: "default", size: "default" },
});

function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "button";
	return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props}/>;
}

export { Button };
