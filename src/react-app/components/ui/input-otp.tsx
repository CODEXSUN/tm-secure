import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { cn } from "@/react-app/lib/utils";

function InputOTP({ className, containerClassName, ...props }: React.ComponentProps<typeof OTPInput>) {
	return <OTPInput
		data-slot="input-otp"
		containerClassName={cn("flex items-center gap-2 has-disabled:opacity-50", containerClassName)}
		className={cn("disabled:cursor-not-allowed", className)}
		{...props}
	/>;
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="input-otp-group" className={cn("flex w-full items-center justify-between gap-2", className)} {...props}/>;
}

function InputOTPSlot({ index, className, ...props }: React.ComponentProps<"div"> & { index: number }) {
	const context = React.useContext(OTPInputContext);
	const { char, hasFakeCaret, isActive } = context.slots[index];

	return <div
		data-slot="input-otp-slot"
		data-active={isActive}
		className={cn("relative flex size-12 items-center justify-center rounded-md border border-input bg-background text-xl font-semibold shadow-xs transition-[color,box-shadow] data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50", className)}
		{...props}
	>
		{char}
		{hasFakeCaret && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-5 w-px animate-caret-blink bg-foreground"/></div>}
	</div>;
}

export { InputOTP, InputOTPGroup, InputOTPSlot };
