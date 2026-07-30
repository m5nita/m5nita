import { ne } from 'drizzle-orm'
import type { BroadcastRecipient, UserDirectory } from '../../application/ports/UserDirectory.port'
import type { DbExecutor } from '../../db/client'
import { user } from '../../db/schema/auth'

export class DrizzleUserDirectory implements UserDirectory {
  constructor(private readonly db: DbExecutor) {}

  async listAllExcept(userId: string): Promise<BroadcastRecipient[]> {
    const rows = await this.db
      .select({ userId: user.id, phoneNumber: user.phoneNumber })
      .from(user)
      .where(ne(user.id, userId))
    return rows
  }
}
