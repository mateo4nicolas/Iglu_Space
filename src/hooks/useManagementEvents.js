import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'

// assigned_to_ids es un array (uuid[]); no se puede resolver con un join de
// Supabase, así que los nombres de los asignados se arman en el frontend
// cruzando contra teamProfiles.
const SELECT = '*, created_by_profile:profiles!management_events_created_by_fkey(id, full_name, display_name, username)'

export function useManagementEvents(rangeStart, rangeEnd) {
  const { profile, isSuperAdmin } = useAuth()
  const [events, setEvents] = useState([])
  const [teamProfiles, setTeamProfiles] = useState([]) // administradores + supervisores (asignables)
  const [loading, setLoading] = useState(true)

  const rangeStartStr = format(rangeStart, 'yyyy-MM-dd')
  const rangeEndStr = format(rangeEnd, 'yyyy-MM-dd')

  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('management_events')
      .select(SELECT)
      .gte('event_date', rangeStartStr)
      .lte('event_date', rangeEndStr)
      .order('time_start', { ascending: true })
    if (!error) setEvents(data || [])
    setLoading(false)
  }, [rangeStartStr, rangeEndStr])

  const fetchTeamProfiles = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, display_name, username, role, is_super_admin')
      .order('full_name')
    setTeamProfiles((data || []).filter(p => p.role === 'admin' || p.is_super_admin))
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    fetchTeamProfiles()
  }, [fetchTeamProfiles])

  useEffect(() => {
    const channel = supabase
      .channel('management-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'management_events' }, fetchEvents)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchEvents])

  async function createEvent(data) {
    const assignedIds = isSuperAdmin && data.assigned_to_ids?.length ? data.assigned_to_ids : [profile.id]
    const { error } = await supabase.from('management_events').insert({
      title: data.title,
      description: data.description || null,
      event_date: data.event_date,
      time_start: data.time_start,
      time_end: data.time_end || null,
      color: data.color || '#5b5fcf',
      created_by: profile.id,
      assigned_to_ids: assignedIds,
    })
    if (!error) fetchEvents()
    return { error }
  }

  async function updateEvent(id, data) {
    const payload = {
      title: data.title,
      description: data.description || null,
      event_date: data.event_date,
      time_start: data.time_start,
      time_end: data.time_end || null,
      color: data.color || '#5b5fcf',
      updated_at: new Date().toISOString(),
    }
    if (isSuperAdmin && data.assigned_to_ids?.length) payload.assigned_to_ids = data.assigned_to_ids
    const { error } = await supabase.from('management_events').update(payload).eq('id', id)
    if (!error) fetchEvents()
    return { error }
  }

  async function deleteEvent(id) {
    const { error } = await supabase.from('management_events').delete().eq('id', id)
    if (!error) fetchEvents()
    return { error }
  }

  return { events, teamProfiles, loading, createEvent, updateEvent, deleteEvent, refetch: fetchEvents }
}
