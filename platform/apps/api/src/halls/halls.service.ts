import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Hall } from "@farm/domain";
import { DATABASE, type Database } from "../db/database";
import { flocks, halls } from "../db/schema";
import { toHall } from "../common/mappers";
import type { CreateHallDto, UpdateHallDto } from "./halls.dto";

@Injectable()
export class HallsService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  private get db(): any {
    return this.database.db;
  }

  async list(farmId: string): Promise<(Hall & { activeFlocks: number; occupiedBirds: number })[]> {
    const rows = await this.db
      .select()
      .from(halls)
      .where(and(eq(halls.farmId, farmId), isNull(halls.deletedAt)))
      .orderBy(asc(halls.name));

    const active = await this.db
      .select()
      .from(flocks)
      .where(and(eq(flocks.farmId, farmId), eq(flocks.status, "active"), isNull(flocks.deletedAt)));

    return rows.map((r: any) => {
      const mine = active.filter((f: any) => f.hallId === r.id);
      return {
        ...toHall(r),
        activeFlocks: mine.length,
        occupiedBirds: mine.reduce((s: number, f: any) => s + Number(f.initialCount), 0),
      };
    });
  }

  async get(farmId: string, id: string): Promise<Hall> {
    const rows = await this.db
      .select()
      .from(halls)
      .where(and(eq(halls.farmId, farmId), eq(halls.id, id), isNull(halls.deletedAt)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("سالن یافت نشد.");
    return toHall(rows[0]);
  }

  async create(farmId: string, dto: CreateHallDto): Promise<Hall> {
    const name = dto.name.trim().slice(0, 40);
    const dup = await this.db
      .select()
      .from(halls)
      .where(and(eq(halls.farmId, farmId), eq(halls.name, name), isNull(halls.deletedAt)))
      .limit(1);
    if (dup[0]) throw new ConflictException("سالنی با این نام در مزرعه وجود دارد.");

    const id = randomUUID();
    await this.db.insert(halls).values({ id, farmId, name, capacity: dto.capacity });
    return this.get(farmId, id);
  }

  async update(farmId: string, id: string, dto: UpdateHallDto): Promise<Hall> {
    await this.get(farmId, id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name.trim().slice(0, 40);
    if (dto.capacity !== undefined) patch.capacity = dto.capacity;
    await this.db.update(halls).set(patch).where(and(eq(halls.id, id), eq(halls.farmId, farmId)));
    return this.get(farmId, id);
  }

  /** حذف سالن فقط وقتی مجاز است که گله‌ای (حتی بسته‌شده) به آن وابسته نباشد */
  async remove(farmId: string, id: string) {
    await this.get(farmId, id);
    const used = await this.db
      .select()
      .from(flocks)
      .where(and(eq(flocks.hallId, id), isNull(flocks.deletedAt)))
      .limit(1);
    if (used[0]) throw new ConflictException("این سالن گله دارد و قابل حذف نیست.");
    await this.db.update(halls).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(halls.id, id));
    return { ok: true };
  }
}
