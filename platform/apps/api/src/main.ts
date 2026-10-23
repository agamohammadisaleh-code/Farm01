import "reflect-metadata";
import { ValidationPipe, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { resolve } from "node:path";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { runMigrations } from "./db/migrate";
import { DATABASE, type Database } from "./db/database";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false });

  // مهاجرت‌ها پیش از پذیرش درخواست اجرا می‌شوند (idempotent)
  const database = app.get<Database>(DATABASE);
  const applied = await runMigrations(database);
  if (applied.length) new Logger("Migration").log(`اجرا شد: ${applied.join(", ")}`);

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: 400,
    }),
  );
  /**
   * سیاست امنیتی: در حالت نمایشی، صفحه دستیار باید داخل قاب پیش‌نمایش باز شود
   * و اسکریپتش هم از همان مبدأ (`/demo/app.js`) می‌آید؛ پس فقط
   * `frame-ancestors` باز می‌شود و بقیه سیاست‌ها سر جای خود می‌ماند.
   */
  const demoMode = process.env.SERVE_DEMO === "1";
  app.use(
    helmet(
      demoMode
        ? {
            frameguard: false,
            contentSecurityPolicy: {
              directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "frame-ancestors": ["'self'", "*"],
                "upgrade-insecure-requests": null,
              },
            },
          }
        : undefined,
    ),
  );

  // CORS: دامنه‌های وب به‌صورت فهرست سفید از متغیر محیطی
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((o) => o.trim());
  app.enableCors({
    origin: origins.includes("*") ? true : origins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Farm-Id", "X-Client-Id"],
  });

  /**
   * صفحه نمایشی دستیار فارسی (متن و صدا).
   * فقط با SERVE_DEMO=1 روشن می‌شود: در محیط واقعی، فایل‌های نمایشی روی
   * سرور API سرو نمی‌شوند. همان‌مبدأ بودن صفحه با API هم آزمودن دستیار را
   * بدون تنظیم CORS ممکن می‌کند.
   */
  if (demoMode) {
    const demoDir = process.env.DEMO_DIR ?? resolve(process.cwd(), "../../docs/demo");
    app.useStaticAssets(demoDir, { prefix: "/demo" });
    new Logger("Bootstrap").log(`صفحه نمایشی دستیار: /demo (${demoDir})`);
  }

  const swagger = new DocumentBuilder()
    .setTitle("Farm API")
    .setDescription("API مرغ‌یار — مدیریت پرورش مرغ گوشتی")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  new Logger("Bootstrap").log(`API روی http://0.0.0.0:${port}/api/v1 (درایور: ${database.driver})`);
}

bootstrap();
