import "reflect-metadata";
import { ValidationPipe, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { runMigrations } from "./db/migrate";
import { DATABASE, type Database } from "./db/database";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });

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
  app.use(helmet());

  // CORS: دامنه‌های وب به‌صورت فهرست سفید از متغیر محیطی
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((o) => o.trim());
  app.enableCors({
    origin: origins.includes("*") ? true : origins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Farm-Id", "X-Client-Id"],
  });

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
