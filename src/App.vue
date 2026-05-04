<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from './firebase'
import { signInWithGoogle, signOutFromGoogle } from './auth'
import {
  addNote,
  fetchNotes,
  deleteNote,
  toggleLike,
  isLiked,
  addComment,
  fetchComments,
  type Note,
  type Comment,
} from './noteService'
import { getDailyCount, DAILY_LIMIT } from './activityService'
import { format } from 'date-fns'

const user = ref<User | null>(null)
const notes = ref<Note[]>([])
const likedMap = ref<Record<string, boolean>>({})
const title = ref('')
const body = ref('')
const loading = ref(false)
const errorMsg = ref('')

// コメント関連
const openCommentNoteId = ref<string | null>(null)
const commentsMap = ref<Record<string, Comment[]>>({})
const commentBodyMap = ref<Record<string, string>>({})

// 書き込み制限
const dailyCount = ref(0)
const isLimitReached = computed(() => dailyCount.value >= DAILY_LIMIT)
const remainingCount = computed(() => DAILY_LIMIT - dailyCount.value)

onMounted(() => {
  onAuthStateChanged(auth, async (u) => {
    user.value = u
    if (u) {
      await Promise.all([loadNotes(u.uid), refreshDailyCount(u.uid)])
    } else {
      notes.value = []
      likedMap.value = {}
      dailyCount.value = 0
    }
  })
})

async function refreshDailyCount(userId: string) {
  dailyCount.value = await getDailyCount(userId)
}

async function loadNotes(userId: string) {
  notes.value = await fetchNotes()
  const entries = await Promise.all(
    notes.value.map(async (note) => [note.id, await isLiked(note.id, userId)] as const),
  )
  likedMap.value = Object.fromEntries(entries)
}

async function handleSubmit() {
  if (!title.value.trim() || !body.value.trim() || !user.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    await addNote(title.value, body.value, user.value.uid)
    title.value = ''
    body.value = ''
    await Promise.all([loadNotes(user.value.uid), refreshDailyCount(user.value.uid)])
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '投稿に失敗しました'
  } finally {
    loading.value = false
  }
}

async function handleToggleLike(noteId: string) {
  if (!user.value) return
  errorMsg.value = ''
  try {
    await toggleLike(noteId, user.value.uid)
    await Promise.all([loadNotes(user.value.uid), refreshDailyCount(user.value.uid)])
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'いいねに失敗しました'
  }
}

function formatDate(timestamp: { toDate(): Date } | null): string {
  if (!timestamp) return ''
  return format(timestamp.toDate(), 'yyyy-MM-dd')
}

async function toggleCommentSection(noteId: string) {
  if (openCommentNoteId.value === noteId) {
    openCommentNoteId.value = null
    return
  }
  openCommentNoteId.value = noteId
  commentsMap.value[noteId] = await fetchComments(noteId)
}

async function handleDeleteNote(noteId: string) {
  if (!user.value) return
  errorMsg.value = ''
  try {
    await deleteNote(noteId)
    if (openCommentNoteId.value === noteId) openCommentNoteId.value = null
    await loadNotes(user.value.uid)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '削除に失敗しました'
  }
}

async function handleAddComment(noteId: string) {
  if (!user.value || !commentBodyMap.value[noteId]?.trim()) return
  errorMsg.value = ''
  try {
    await addComment(noteId, user.value.uid, commentBodyMap.value[noteId])
    commentBodyMap.value[noteId] = ''
    await Promise.all([
      (async () => {
        commentsMap.value[noteId] = await fetchComments(noteId)
      })(),
      refreshDailyCount(user.value.uid),
    ])
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'コメントに失敗しました'
  }
}
</script>

<template>
  <div class="container">
    <header>
      <h1>My Note App</h1>
      <div v-if="user" class="user-info">
        <span>{{ user.displayName }}</span>
        <span class="daily-count" :class="{ 'limit-reached': isLimitReached }">
          本日の残り書き込み: {{ remainingCount }} / {{ DAILY_LIMIT }}件
        </span>
        <button @click="signOutFromGoogle">ログアウト</button>
      </div>
      <button v-else @click="signInWithGoogle">Googleでログイン</button>
    </header>

    <template v-if="user">
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

      <form class="note-form" @submit.prevent="handleSubmit">
        <input v-model="title" type="text" placeholder="タイトル" required />
        <textarea v-model="body" placeholder="本文" required></textarea>
        <button type="submit" :disabled="loading || isLimitReached">
          {{ loading ? '投稿中...' : isLimitReached ? '本日の上限に達しました' : '投稿' }}
        </button>
      </form>

      <ul class="note-list">
        <li v-for="note in notes" :key="note.id" class="note-card">
          <div class="note-header">
            <h2>{{ note.title }}</h2>
            <button
              class="delete-btn"
              :disabled="note.userId !== user!.uid"
              @click="handleDeleteNote(note.id)"
            >
              削除
            </button>
          </div>
          <p>{{ note.body }}</p>
          <div class="note-meta">
            <div class="like-area">
              <button
                class="like-btn"
                :disabled="isLimitReached && !likedMap[note.id]"
                @click="handleToggleLike(note.id)"
              >
                {{ likedMap[note.id] ? 'いいね済み' : 'いいね' }}
              </button>
              <span>{{ note.likeCount }}</span>
            </div>
            <span>{{ formatDate(note.createdAt) }}</span>
          </div>

          <div class="comment-section">
            <button class="comment-toggle-btn" @click="toggleCommentSection(note.id)">
              {{ openCommentNoteId === note.id ? 'コメントを閉じる' : 'コメントする' }}
            </button>

            <template v-if="openCommentNoteId === note.id">
              <form class="comment-form" @submit.prevent="handleAddComment(note.id)">
                <textarea
                  v-model="commentBodyMap[note.id]"
                  placeholder="コメントを入力"
                  required
                ></textarea>
                <button type="submit" :disabled="isLimitReached">
                  {{ isLimitReached ? '本日の上限に達しました' : '投稿' }}
                </button>
              </form>

              <ul class="comment-list">
                <li v-for="comment in commentsMap[note.id]" :key="comment.id" class="comment-item">
                  <p>{{ comment.body }}</p>
                  <span class="comment-date">{{ formatDate(comment.createdAt) }}</span>
                </li>
              </ul>
            </template>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.container {
  max-width: 640px;
  margin: 0 auto;
  padding: 1rem;
  font-family: sans-serif;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.daily-count {
  font-size: 0.85rem;
  color: #555;
}

.daily-count.limit-reached {
  color: #c0392b;
  font-weight: bold;
}

.error-msg {
  color: #c0392b;
  background: #fdecea;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.note-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 2rem;
}

.note-form input,
.note-form textarea {
  padding: 0.5rem;
  font-size: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.note-form textarea {
  min-height: 100px;
  resize: vertical;
}

.note-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.note-card {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 1rem;
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.note-card h2 {
  margin: 0;
  font-size: 1.1rem;
}

.delete-btn {
  flex-shrink: 0;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  color: #c0392b;
  border: 1px solid #c0392b;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.delete-btn:disabled {
  color: #ccc;
  border-color: #ccc;
  cursor: not-allowed;
}

.note-card p {
  margin: 0 0 0.75rem;
  white-space: pre-wrap;
}

.note-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: #666;
}

.like-area {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.like-btn {
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}

.like-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.comment-section {
  margin-top: 0.75rem;
  border-top: 1px solid #eee;
  padding-top: 0.75rem;
}

.comment-toggle-btn {
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0.2rem 0.6rem;
}

.comment-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.75rem;
}

.comment-form textarea {
  padding: 0.4rem;
  font-size: 0.9rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  min-height: 60px;
  resize: vertical;
}

.comment-list {
  list-style: none;
  padding: 0;
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.comment-item {
  background: #f9f9f9;
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
}

.comment-item p {
  margin: 0 0 0.25rem;
  font-size: 0.9rem;
  white-space: pre-wrap;
}

.comment-date {
  font-size: 0.75rem;
  color: #999;
}
</style>
