"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export default function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingText = "در حال ذخیره…",
  icon,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  icon?: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? <Loader2 size={15} className="spin" /> : icon}
      {pending ? pendingText : children}
    </button>
  );
}
