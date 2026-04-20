import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { prizeWithdrawal } from '../db/schema/prizeWithdrawal'
import { encryptPixKey, isEncryptedPixKey } from '../lib/pixKeyCrypto'

async function main(): Promise<void> {
  const rows = await db
    .select({ id: prizeWithdrawal.id, pixKey: prizeWithdrawal.pixKey })
    .from(prizeWithdrawal)

  let encrypted = 0
  let alreadyEncrypted = 0

  for (const row of rows) {
    if (isEncryptedPixKey(row.pixKey)) {
      alreadyEncrypted++
      continue
    }
    const ciphertext = encryptPixKey(row.pixKey)
    await db
      .update(prizeWithdrawal)
      .set({ pixKey: ciphertext, updatedAt: new Date() })
      .where(eq(prizeWithdrawal.id, row.id))
    encrypted++
    console.log(`[backfill] encrypted row ${row.id}`)
  }

  console.log(
    `[backfill] done. total=${rows.length} encrypted=${encrypted} already-encrypted=${alreadyEncrypted}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill] failed:', err)
    process.exit(1)
  })
