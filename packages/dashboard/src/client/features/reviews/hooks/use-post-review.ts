import { useCallback, useEffect, useRef, useState } from 'react'
import { useSocket, useSocketEvent } from '../../../providers/socket-provider'
import type { PostReviewStep, PostCheckResult, ChatToolStatus } from '../../../lib/api-types'

export type ActivityLogEntry = {
  tool: string
  detail: string
  timestamp: number
}

type UsePostReviewReturn = {
  step: PostReviewStep
  checkResult: PostCheckResult | null
  streamingContent: string
  generatedContent: string
  toolStatus: ChatToolStatus | null
  activityLog: ActivityLogEntry[]
  elapsedSeconds: number
  postResult: { success: boolean; commentUrl?: string | null; error?: string } | null
  error: string | null
  checkGitHub: (sessionId: string) => void
  generate: (sessionId: string, roundNumber: number) => void
  cancelGeneration: (sessionId: string, roundNumber: number) => void
  saveDraft: (sessionId: string, roundNumber: number, content: string) => void
  submitToGitHub: (prNumber: number, content: string) => void
  reset: () => void
  setStep: (step: PostReviewStep) => void
}

export function usePostReview(): UsePostReviewReturn {
  const { socket } = useSocket()

  const [step, setStep] = useState<PostReviewStep>('idle')
  const [checkResult, setCheckResult] = useState<PostCheckResult | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [generatedContent, setGeneratedContent] = useState('')
  const [toolStatus, setToolStatus] = useState<ChatToolStatus | null>(null)
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [postResult, setPostResult] = useState<{ success: boolean; commentUrl?: string | null; error?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const streamingRef = useRef('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Elapsed timer — ticks every second while generating
  useEffect(() => {
    if (step === 'generating') {
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [step])

  // ── GitHub check result ──
  useSocketEvent<PostCheckResult>(
    'post:gh-result',
    useCallback((data) => {
      setCheckResult(data)
      if (data.authenticated && data.prNumber) {
        setStep('ready')
      } else {
        setError(data.error ?? 'GitHub check failed')
        setStep('error')
      }
    }, []),
  )

  // ── Streaming tokens ──
  useSocketEvent<{ token: string }>(
    'post:token',
    useCallback((data) => {
      streamingRef.current += data.token
      setStreamingContent(streamingRef.current)
    }, []),
  )

  // ── Clear stream (reasoning text discarded when a tool fires) ──
  useSocketEvent(
    'post:clear-stream',
    useCallback(() => {
      streamingRef.current = ''
      setStreamingContent('')
    }, []),
  )

  // ── Tool status ──
  useSocketEvent<{ tool: string; detail: string }>(
    'post:status',
    useCallback((data) => {
      const entry: ActivityLogEntry = {
        tool: data.tool,
        detail: data.detail,
        timestamp: Date.now(),
      }
      setToolStatus(entry)
      setActivityLog((prev) => [...prev, entry])
    }, []),
  )

  // ── Generation done ──
  useSocketEvent<{ content: string }>(
    'post:done',
    useCallback((data) => {
      setGeneratedContent(data.content)
      setStreamingContent('')
      setToolStatus(null)
      streamingRef.current = ''
      setStep('preview')
    }, []),
  )

  // ── Generation cancelled ──
  useSocketEvent(
    'post:cancelled',
    useCallback(() => {
      setStreamingContent('')
      setToolStatus(null)
      streamingRef.current = ''
      setStep('ready')
    }, []),
  )

  // ── Error ──
  useSocketEvent<{ error: string }>(
    'post:error',
    useCallback((data) => {
      setError(data.error)
      setStreamingContent('')
      setToolStatus(null)
      streamingRef.current = ''
      setStep('error')
    }, []),
  )

  // ── Save result ──
  useSocketEvent<{ success: boolean; error?: string }>(
    'post:save-result',
    useCallback((data) => {
      if (!data.success) {
        setError(data.error ?? 'Failed to save draft')
      }
    }, []),
  )

  // ── Submit result ──
  useSocketEvent<{ success: boolean; commentUrl?: string | null; error?: string }>(
    'post:submit-result',
    useCallback((data) => {
      setPostResult(data)
      if (data.success) {
        setStep('posted')
      } else {
        setError(data.error ?? 'Failed to post to GitHub')
        setStep('error')
      }
    }, []),
  )

  // ── Actions ──

  const checkGitHub = useCallback(
    (sessionId: string) => {
      if (!socket) return
      setStep('checking')
      setError(null)
      setCheckResult(null)
      socket.emit('post:check-gh', { sessionId })
    },
    [socket],
  )

  const generate = useCallback(
    (sessionId: string, roundNumber: number) => {
      if (!socket) return
      setStep('generating')
      setError(null)
      setStreamingContent('')
      setGeneratedContent('')
      setToolStatus(null)
      setActivityLog([])
      streamingRef.current = ''
      socket.emit('post:generate', { sessionId, roundNumber })
    },
    [socket],
  )

  const cancelGeneration = useCallback(
    (sessionId: string, roundNumber: number) => {
      if (!socket) return
      socket.emit('post:cancel', { sessionId, roundNumber })
    },
    [socket],
  )

  const saveDraft = useCallback(
    (sessionId: string, roundNumber: number, content: string) => {
      if (!socket) return
      socket.emit('post:save', { sessionId, roundNumber, content })
    },
    [socket],
  )

  const submitToGitHub = useCallback(
    (prNumber: number, content: string) => {
      if (!socket) return
      setStep('posting')
      setError(null)
      socket.emit('post:submit', { prNumber, content })
    },
    [socket],
  )

  const reset = useCallback(() => {
    setStep('idle')
    setCheckResult(null)
    setStreamingContent('')
    setGeneratedContent('')
    setToolStatus(null)
    setActivityLog([])
    setPostResult(null)
    setError(null)
    streamingRef.current = ''
  }, [])

  return {
    step,
    checkResult,
    streamingContent,
    generatedContent,
    toolStatus,
    activityLog,
    elapsedSeconds,
    postResult,
    error,
    checkGitHub,
    generate,
    cancelGeneration,
    saveDraft,
    submitToGitHub,
    reset,
    setStep,
  }
}
