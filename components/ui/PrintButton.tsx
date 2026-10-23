"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button className="btn btn-outline btn-sm no-print" onClick={() => window.print()}>
      <Printer size={14} />
      چاپ / خروجی PDF
    </button>
  );
}
