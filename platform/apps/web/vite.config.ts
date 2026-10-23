import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * پیکربندی Vite.
 *
 * نکته‌ی مهم برای پیش‌نمایش و استقرار: مرورگر همیشه به مسیر نسبی `/api/v1`
 * درخواست می‌زند و Vite آن را به API واقعی پروکسی می‌کند. بنابراین نه
 * localhost در مرورگر کاربر لازم است، نه CORS، و نه آدرس API داخل باندل
 * سخت‌کد می‌شود. در تولید هم همان مسیر را nginx پروکسی می‌کند.
 */
const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:4000";

/**
 * `test` کلید مخصوص Vitest است و در تایپ‌های Vite نیست؛ همین یک کلید را
 * جدا اعلام می‌کنیم تا نه تایپ‌ها را دور بزنیم و نه نسخه‌ی دومی از Vite
 * (که Vitest با خودش می‌آورد) وارد پروژه شود.
 */
const config: UserConfig & { test?: Record<string, unknown> } = {
  plugins: [react()],
  // بسته دامنه به‌صورت CommonJS ساخته می‌شود (چون API آن را با require می‌خواند).
  // Vite باید آن را از پیش بسته‌بندی/تبدیل کند تا ایمپورت‌های نام‌دار مثل can() درست حل شوند.
  optimizeDeps: { include: ["@farm/domain"] },
  // در مونوریپو ممکن است بیش از یک نسخه React در درخت باشد (Expo نسخه خودش را
  // نگه می‌دارد). یک نسخه شدن، خطای «Invalid hook call» را از بین می‌برد.
  // یک نسخه React برای همه؛ Expo نسخه خودش را زیر apps/mobile نگه می‌دارد
  resolve: { dedupe: ["react", "react-dom"] },
  build: {
    commonjsOptions: { include: [/node_modules/, /packages[\\/]domain/] },
    // شکستن باندل: نمودارها سنگین‌اند و فقط در داشبورد لازم می‌شوند
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          vendor: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // دامنه‌ی پیش‌نمایش سندباکس باید پذیرفته شود، وگرنه صفحه سفید می‌ماند
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: { host: "0.0.0.0", port: 4173, allowedHosts: true },
  // آزمون‌های رابط کاربری با jsdom اجرا می‌شوند تا رندر واقعی کامپوننت‌ها
  // بررسی شود، نه فقط توابع خالص.
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // بسته‌های node_modules به‌صورت پیش‌فرض از Vite بیرون گذاشته می‌شوند و
    // aliasهای بالا را نمی‌بینند؛ درون‌سازی می‌کنیم تا همه از یک React بخوانند.
    server: {
      deps: {
        inline: ["react-router-dom", "react-router", "recharts", "@testing-library/react"],
      },
    },
  },
};

export default defineConfig(config as UserConfig);
