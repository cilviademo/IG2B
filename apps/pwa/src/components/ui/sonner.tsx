import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Light-themed toasts. No next-themes dependency — fixed light theme.
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      toastOptions={{
        style: {
          background: "oklch(0.93 0.008 280)",
          border: "1px solid oklch(0.55 0.03 264 / 0.35)",
          color: "oklch(0.22 0.02 280)",
          fontFamily: '"Space Grotesk", system-ui, sans-serif',
        },
      }}
      {...props}
    />
  );
}
