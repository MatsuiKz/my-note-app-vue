import {
  collection,
  getDocs,
  getDoc,
  doc,
  orderBy,
  query,
  where,
  runTransaction,
  writeBatch,
  increment,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { checkActivityInTransaction } from './activityService'

export interface Note {
  id: string
  title: string
  body: string
  likeCount: number
  userId: string
  createdAt: Timestamp
}

export async function addNote(title: string, body: string, userId: string): Promise<void> {
  const newDocRef = doc(collection(db, 'notes'))
  await runTransaction(db, async (transaction) => {
    await checkActivityInTransaction(transaction, userId)
    transaction.set(newDocRef, {
      title,
      body,
      likeCount: 0,
      userId,
      createdAt: Timestamp.now(),
    })
  })
}

export async function fetchNotes(): Promise<Note[]> {
  const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Note)
}

export async function toggleLike(noteId: string, userId: string): Promise<void> {
  const likeDocRef = doc(db, 'likes', `${noteId}_${userId}`)
  const noteDocRef = doc(db, 'notes', noteId)

  await runTransaction(db, async (transaction) => {
    const likeSnap = await transaction.get(likeDocRef)
    if (likeSnap.exists()) {
      // いいね取り消し：カウントしない
      transaction.delete(likeDocRef)
      transaction.update(noteDocRef, { likeCount: increment(-1) })
    } else {
      // いいね：上限チェック
      await checkActivityInTransaction(transaction, userId)
      transaction.set(likeDocRef, { noteId, userId })
      transaction.update(noteDocRef, { likeCount: increment(1) })
    }
  })
}

export async function isLiked(noteId: string, userId: string): Promise<boolean> {
  const likeSnap = await getDoc(doc(db, 'likes', `${noteId}_${userId}`))
  return likeSnap.exists()
}

export interface Comment {
  id: string
  noteId: string
  userId: string
  body: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// fetchComments は noteId + createdAt の複合インデックスが必要です。
// Firestore コンソール > インデックス > 複合インデックスを追加:
//   コレクション: comments, フィールド: noteId (昇順), createdAt (降順)
export async function addComment(
  noteId: string,
  userId: string,
  body: string,
): Promise<void> {
  const newDocRef = doc(collection(db, 'comments'))
  const now = Timestamp.now()
  await runTransaction(db, async (transaction) => {
    await checkActivityInTransaction(transaction, userId)
    transaction.set(newDocRef, {
      noteId,
      userId,
      body,
      createdAt: now,
      updatedAt: now,
    })
  })
}

export async function deleteNote(noteId: string): Promise<void> {
  const [commentsSnap, likesSnap] = await Promise.all([
    getDocs(query(collection(db, 'comments'), where('noteId', '==', noteId))),
    getDocs(query(collection(db, 'likes'), where('noteId', '==', noteId))),
  ])
  const batch = writeBatch(db)
  commentsSnap.docs.forEach((d) => batch.delete(d.ref))
  likesSnap.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(db, 'notes', noteId))
  await batch.commit()
}

export async function fetchComments(noteId: string): Promise<Comment[]> {
  const q = query(
    collection(db, 'comments'),
    where('noteId', '==', noteId),
    orderBy('createdAt', 'desc'),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Comment)
}
