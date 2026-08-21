/**
 * The contract, against IndexedDB. Always runs — no network, no account.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach } from 'vitest'
import { deleteDB, type IDBPDatabase } from 'idb'
import { createIndexedDbRepositories } from '../idb/indexedDbRepositories'
import { DB_NAME, openHealthDB, type HealthDB } from '../idb/schema'
import { runRepositoryContract, type ContractContext } from './contract'
import type { UserId } from '@/domain'

let connection: IDBPDatabase<HealthDB> | undefined

afterEach(() => {
  connection?.close()
  connection = undefined
})

beforeEach(async () => {
  await deleteDB(DB_NAME)
})

runRepositoryContract('IndexedDB', async (): Promise<ContractContext> => {
  const db = openHealthDB()
  connection = await db
  return {
    repositories: createIndexedDbRepositories(db),
    userId: 'contract-user' as UserId,
    prefix: 'idb',
  }
})
