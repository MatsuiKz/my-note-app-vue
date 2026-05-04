import { doc, getDoc, type Transaction } from 'firebase/firestore'
import { db } from './firebase'

export const DAILY_LIMIT = 3

function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function checkActivityInTransaction(
  transaction: Transaction,
  userId: string,
): Promise<void> {
  const activityRef = doc(db, 'userActivity', userId)
  const activitySnap = await transaction.get(activityRef)
  const data = activitySnap.data()
  const today = todayString()
  const currentCount: number = data?.date === today ? (data.count as number) : 0
  if (currentCount >= DAILY_LIMIT) {
    throw new Error(`1日の書き込み上限（${DAILY_LIMIT}件）に達しました`)
  }
  transaction.set(activityRef, { date: today, count: currentCount + 1 })
}

export async function getDailyCount(userId: string): Promise<number> {
  const activitySnap = await getDoc(doc(db, 'userActivity', userId))
  const data = activitySnap.data()
  const today = todayString()
  return data?.date === today ? (data.count as number) : 0
}
