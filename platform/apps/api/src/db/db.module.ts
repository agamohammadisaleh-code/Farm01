import { Global, Module } from "@nestjs/common";
import { DATABASE, DatabaseService } from "./database";

/**
 * ماژول سراسری پایگاه داده.
 * DATABASE به‌صورت توکن سراسری ارائه می‌شود تا هر ماژول دامنه فقط با
 * `@Inject(DATABASE)` به همان اتصال دسترسی داشته باشد.
 */
@Global()
@Module({
  providers: [
    DatabaseService,
    { provide: DATABASE, useFactory: (svc: DatabaseService) => svc.handle, inject: [DatabaseService] },
  ],
  exports: [DATABASE, DatabaseService],
})
export class DatabaseModule {}
