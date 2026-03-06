import { useState } from 'react'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import type { Note } from '../hooks/use-notes'
import { formatDateTime } from '../../../lib/date-utils'

type NoteCardProps = {
  note: Note
  onUpdate: (id: string, content: string) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}

export function NoteCard({ note, onUpdate, onDelete }: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(note.content)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const wasEdited = note.updated_at !== note.created_at

  async function handleSave() {
    if (!editContent.trim() || editContent === note.content) {
      setIsEditing(false)
      setEditContent(note.content)
      return
    }
    setIsSaving(true)
    await onUpdate(note.id, editContent.trim())
    setIsSaving(false)
    setIsEditing(false)
  }

  async function handleDelete() {
    await onDelete(note.id)
    setIsConfirmingDelete(false)
  }

  if (isEditing) {
    return (
      <div className="rounded-lg border border-blue-500/50 bg-white p-3 dark:bg-zinc-900">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
          rows={3}
          autoFocus
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setIsEditing(false)
              setEditContent(note.content)
            }}
            className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
          {note.content}
        </p>
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Edit note"
            title="Edit note"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {isConfirmingDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
              aria-label="Delete note"
              title="Delete note"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-3 text-[11px] text-zinc-400 dark:text-zinc-500">
        <span>{formatDateTime(note.created_at)}</span>
        {wasEdited && <span>(edited {formatDateTime(note.updated_at)})</span>}
      </div>
    </div>
  )
}
