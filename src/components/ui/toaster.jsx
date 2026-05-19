import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast
            key={id}
            {...props}
            role="status"
            aria-live="polite"
            className={cn(
              "cursor-pointer select-none",
              props.className
            )}
            onClick={(e) => {
              if (e.target.closest("[toast-close]")) return;
              dismiss(id);
            }}
          >
            <div className="grid gap-1 pr-6">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose
              aria-label="Fechar notificação"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(id);
              }}
            />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
