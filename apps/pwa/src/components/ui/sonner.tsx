import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Vault toasts — token-driven so they track the active theme (dark default).
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        style: {
          background: "var(--surface)",
          border: "1px solid var(--line)",
          color: "var(--text)",
          borderRadius: "10px",
          fontFamily: '"Inter Tight", system-ui, sans-serif',
        },
      }}
      {...props}
    />
  );
}
