import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 overflow-hidden rounded-md px-2.5 py-1.5 text-xs",
          className,
        )}
        style={{
          background: "oklch(0.93 0.008 280)",
          border: "1px solid oklch(0.55 0.03 264 / 0.35)",
          color: "oklch(0.22 0.02 280)",
        }}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
