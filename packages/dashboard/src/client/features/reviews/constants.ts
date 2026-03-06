import { User, Shield, TestTube, Sparkles } from 'lucide-react'

export const REVIEWER_ICONS: Record<string, typeof User> = {
  principal: Sparkles,
  quality: User,
  security: Shield,
  testing: TestTube,
}
