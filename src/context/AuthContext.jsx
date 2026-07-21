import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [myDeptIds, setMyDeptIds] = useState([])
  const [loading, setLoading] = useState(true)
  const initializedRef = useRef(false)
  const loadingTimerRef = useRef(null)
  const mountedRef = useRef(true)

  function finishLoading() {
    if (mountedRef.current) {
      clearTimeout(loadingTimerRef.current)
      setLoading(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true

    // Hard safety net: never hang more than 6s, no matter what
    loadingTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        console.warn('Auth timeout — forcing unblock')
        setLoading(false)
      }
    }, 6000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return
      initializedRef.current = true

      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setMyDeptIds([])
        finishLoading()
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mountedRef.current || initializedRef.current) return
      initializedRef.current = true
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        finishLoading()
      }
    }).catch((err) => {
      console.error('getSession error:', err)
      if (mountedRef.current && !initializedRef.current) {
        initializedRef.current = true
        finishLoading()
      }
    })

    return () => {
      mountedRef.current = false
      clearTimeout(loadingTimerRef.current)
      subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfile(userId) {
    try {
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (!mountedRef.current) return

      if (error || !prof) {
        setProfile(null)
        setMyDeptIds([])
        finishLoading()
        return
      }

      setProfile(prof)

      // Department membership — best effort, never blocks the UI
      try {
        const isAdminRole = prof.role === 'admin'
        const isSuperAdminRole = !!prof.is_super_admin
        let pd = null

        if (isSuperAdminRole) {
          // Admin (control total): ve todos los departamentos sin restricción
          const res = await supabase.from('departments').select('id')
          if (!mountedRef.current) return
          setMyDeptIds((res.data || []).map(d => d.id))
          finishLoading()
          return
        } else if (isAdminRole) {
          const res = await supabase
            .from('profile_departments')
            .select('department_id')
            .eq('user_id', userId)
            .eq('member_role', 'admin')
          pd = res.data
        } else {
          const res = await supabase
            .from('profile_departments')
            .select('department_id')
            .eq('user_id', userId)
          pd = res.data
        }

        if (!mountedRef.current) return

        if (pd && pd.length > 0) {
          setMyDeptIds(pd.map(r => r.department_id))
        } else {
          setMyDeptIds(prof.department_id ? [prof.department_id] : [])
        }
      } catch (deptErr) {
        console.error('dept fetch error:', deptErr)
        if (mountedRef.current) {
          setMyDeptIds(prof.department_id ? [prof.department_id] : [])
        }
      }
    } catch (err) {
      console.error('fetchProfile error:', err)
      if (mountedRef.current) {
        setProfile(null)
        setMyDeptIds([])
      }
    } finally {
      finishLoading()
    }
  }

  // isSuperAdmin = nuevo nivel Admin con control total sobre todos
  const isSuperAdmin = !!profile?.is_super_admin
  // isAdmin = Supervisor o Admin (Admin hereda automáticamente todos los permisos de Supervisor)
  const isAdmin = profile?.role === 'admin' || isSuperAdmin

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, isSuperAdmin, myDeptIds, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
