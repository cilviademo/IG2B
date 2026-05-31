import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Dark, observatory-styled toasts. No next-themes dependency — fixed dark theme.
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      toastOptions={{
        style: {
          background: "oklch(0.14 0.02 280)",
          border: "1px solid oklch(0.2 0.04 264 / 0.5)",
          color: "oklch(0.92 0.01 280)",
          fontFamily: '"Space Grotesk", system-ui, sans-serif',
        },
      }}
      {...props}
    />
  );
}
