import { useState } from 'react'
import { StickyNote, Plus, X } from 'lucide-react'
import { useNotes } from '../hooks/use-notes'
import { NoteCard } from './note-card'

type NotesPanelProps = {
  targetType: 'session' | 'round' | 'finding' | 'run' | 'section' | 'file'
  targetId: string
}

export function NotesPanel({ targetType, targetId }: NotesPanelProps) {
  const { notes, isLoading, createNote, isCreating, updateNote, deleteNote } = useNotes(
    targetType,
    targetId,
  )
  const [isAdding, setIsAdding] = useState(false)
  const [newContent, setNewContent] = useState('')

  async function handleCreate() {
    if (!newContent.trim()) return
    await createNote(newContent.trim())
    setNewContent('')
    setIsAdding(false)
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <span className="text-sm font-medium">Notes</span>
          {notes.length > 0 && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">({notes.length})</span>
          )}
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3 w-3" />
            Add Note
          </button>
        )}
      </div>

      <div className="p-4">
        {isAdding && (
          <div className="mb-4 rounded-lg border border-blue-500/50 bg-white p-3 dark:bg-zinc-900">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Write a note..."
              className="w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-600"
              rows={3}
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false)
                  setNewContent('')
                }}
                className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
              <button
                type="button"
                disabled={isCreating || !newContent.trim()}
                onClick={handleCreate}
                className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isCreating ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Loading notes...</p>
        ) : notes.length === 0 && !isAdding ? (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            No notes yet. Click "Add Note" to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onUpdate={updateNote}
                onDelete={deleteNote}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
