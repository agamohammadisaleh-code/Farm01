import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "مرغ‌یار — مدیریت مرغداری گوشتی",
    short_name: "مرغ‌یار",
    description:
      "مدیریت چرخه پرورش مرغ گوشتی از جوجه‌ریزی تا فروش، ثبت سریع آمار روزانه، هزینه‌ها و مشاور هوشمند",
    lang: "fa",
    dir: "rtl",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f2ec",
    theme_color: "#0f3b30",
    categories: ["productivity", "business", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "ثبت سریع آمار", short_name: "ثبت آمار", url: "/m/quick", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "مشاور هوشمند", short_name: "مشاور", url: "/m/assistant", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "داشبورد وب", short_name: "داشبورد", url: "/" },
    ],
  };
}
