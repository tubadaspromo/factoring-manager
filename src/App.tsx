import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AuthPage }       from '@/pages/AuthPage'
import { Dashboard }      from '@/pages/Dashboard'
import { AdminDashboard } from '@/components/admin/AdminDashboard'

export default function App() {
  const [session, setSession]     = useState<Session | null>(null)
  const [loading, setLoading]     = useState(true)
  const [userRole, setUserRole]   = useState<'user' | 'admin'>('user')
  const [adminView, setAdminView] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) resolveRole(session)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) { setUserRole('user'); setAdminView(false); return }
      resolveRole(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  /**
   * Resolve admin role:
   * 1. Check user_metadata.user_role (baked into JWT — no extra round-trip)
   * 2. Fall back to profiles table query
   * 3. Log errors so they appear in DevTools Console
   */
  async function resolveRole(session: Session) {
    // Primary: read from JWT user_metadata (set via raw_user_meta_data in DB)
    const metaRole = session.user.user_metadata?.user_role
    if (metaRole === 'admin') {
      console.log('[App] role from JWT metadata: admin')
      setUserRole('admin')
      setLoading(false)
      return
    }

    // Fallback: query profiles table
    try {
      const { data, error } = await (supabase.from('profiles') as any)
        .select('user_role')
        .eq('id', session.user.id)
        .single()

      if (error) {
        console.error('[App] profiles query error:', error)
      } else {
        console.log('[App] role from profiles table:', data?.user_role)
      }

      setUserRole(data?.user_role === 'admin' ? 'admin' : 'user')
    } catch (e) {
      console.error('[App] resolveRole exception:', e)
      setUserRole('user')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#4ABCB1', borderTopColor: 'transparent' }} />
          <p className="text-gray-400 text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!session) return <AuthPage />

  if (adminView && userRole === 'admin') {
    return <AdminDashboard onBack={() => setAdminView(false)} />
  }

  return (
    <Dashboard
      userRole={userRole}
      onGoAdmin={userRole === 'admin' ? () => setAdminView(true) : undefined}
    />
  )
}
