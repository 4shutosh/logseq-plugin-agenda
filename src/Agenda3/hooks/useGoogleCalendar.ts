import { useState, useCallback, useEffect } from 'react'
import { message } from 'antd'

import { 
  getEvents, 
  convertGoogleEventsToAgendaTask, 
  isSignedIn, 
  initGoogleApi, 
  signIn,
  loadToken,
  gapi
} from '@/services/googleCalendar'
import useSettings from './useSettings'
import { useAtom } from 'jotai'
import { googleCalendarTasks } from '../models/entities/tasks'

const useGoogleCalendar = () => {
  const { settings } = useSettings()
  const [googleTasks, setGoogleTasks] = useAtom(googleCalendarTasks)
  const [isLoading, setIsLoading] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  
  // Initialize Google API when settings change
  useEffect(() => {
    const initialize = async () => {
      const googleSettings = settings.googleCalendar
      if (googleSettings?.enabled && googleSettings?.clientId && googleSettings?.apiKey) {
        await initGoogleApi({
          clientId: googleSettings.clientId,
          apiKey: googleSettings.apiKey,
          clientSecret: googleSettings.clientSecret
        })
        setIsInitialized(true)
      }
    }
    
    initialize()
  }, [settings.googleCalendar?.enabled, settings.googleCalendar?.clientId, settings.googleCalendar?.apiKey, settings.googleCalendar?.clientSecret])
  
  const fetchGoogleEvents = useCallback(async (startDate: Date, endDate: Date) => {
    if (!isInitialized) {
      console.log('[GoogleCalendar Debug] Not initialized yet')
      return []
    }
    
    if (!isSignedIn()) {
      console.log('[GoogleCalendar Debug] Not signed in yet')
      return []
    }
    
    if (!settings.googleCalendar?.enabled) {
      console.log('[GoogleCalendar Debug] Google Calendar integration not enabled')
      return []
    }
    
    setIsLoading(true)
    try {
      console.log(`[GoogleCalendar Debug] Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()}`)
      const events = await getEvents(startDate, endDate)
      console.log(`[GoogleCalendar Debug] Received ${events.length} events from Google Calendar API`)
      
      if (events.length === 0) {
        console.log('[GoogleCalendar Debug] No events received from Google Calendar API')
      } else {
        console.log('[GoogleCalendar Debug] First event:', events[0])
      }
      
      const schedules = convertGoogleEventsToAgendaTask(events)
      console.log(`[GoogleCalendar Debug] Converted to ${schedules.length} schedules`)
      
      // Apply colors from settings ONLY if the event doesn't have its own colorId
      if (settings.googleCalendar?.calendar) {
        const { bgColor, textColor, borderColor } = settings.googleCalendar.calendar
        schedules.forEach((schedule: any) => {
          // Only override colors if the event doesn't have its own colorId
          const originalEvent = schedule.extendedProps?.originalEvent
          if (!originalEvent?.colorId) {
            schedule.bgColor = bgColor || schedule.bgColor
            schedule.color = textColor || schedule.color
            schedule.borderColor = borderColor || schedule.borderColor
          }
          schedule.isGCalEvent = true
        })
      }
      
      setGoogleTasks(schedules)
      return schedules
    } catch (error) {
      console.error('[GoogleCalendar Debug] Error fetching Google Calendar events:', error)
      message.error('Failed to fetch Google Calendar events')
      return []
    } finally {
      setIsLoading(false)
    }
  }, [isInitialized, settings.googleCalendar])
  
  const syncGoogleEvents = useCallback(async () => {
    console.log('[GoogleCalendar Debug] Syncing Google Calendar events')
    console.log('[GoogleCalendar Debug] Enabled:', settings.googleCalendar?.enabled)
    console.log('[GoogleCalendar Debug] Signed in:', isSignedIn())
    console.log('[GoogleCalendar Debug] Initialized:', isInitialized)
    
    if (!settings.googleCalendar?.enabled || !isInitialized) {
      console.log('[GoogleCalendar Debug] Not syncing Google Calendar (conditions not met)')
      return []
    }
    
    // Try to sign in if not already signed in
    if (!isSignedIn()) {
      const savedToken = loadToken();
      if (savedToken) {
        try {
          console.log('[GoogleCalendar Debug] Attempting to restore token for sync');
          gapi.client.setToken(savedToken);
        } catch (e) {
          console.error('[GoogleCalendar Debug] Failed to restore token for sync:', e);
        }
      }
      
      // Still not signed in after token restore attempt
      if (!isSignedIn()) {
        console.log('[GoogleCalendar Debug] Not signed in, auto-signing in...');
        try {
          const success = await signIn();
          if (!success) {
            console.log('[GoogleCalendar Debug] Auto sign-in failed');
            return [];
          }
        } catch (e) {
          console.error('[GoogleCalendar Debug] Error during auto sign-in:', e);
          return [];
        }
      }
    }
    
    // Calculate date range (1 month before and after current date)
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0)
    
    console.log(`[GoogleCalendar Debug] Fetching events from ${startDate.toDateString()} to ${endDate.toDateString()}`)
    return fetchGoogleEvents(startDate, endDate)
  }, [fetchGoogleEvents, settings.googleCalendar?.enabled, isInitialized])
  
  useEffect(() => {
    if (isInitialized && settings.googleCalendar?.enabled && settings.googleCalendar?.syncEnabled) {
      syncGoogleEvents()
    }
  }, [isInitialized, syncGoogleEvents, settings.googleCalendar?.enabled, settings.googleCalendar?.syncEnabled])

  useEffect(() => {
    if (isInitialized && 
        settings.googleCalendar?.enabled && 
        settings.googleCalendar?.syncEnabled) {
      
      console.log('[GoogleCalendar Debug] Setting up periodic sync interval');
      
      const syncIntervalMs = (2) * 60 * 1000;
      
      const intervalId = setInterval(() => {
        console.log('[GoogleCalendar Debug] Running periodic sync');
        syncGoogleEvents();
      }, syncIntervalMs);
      
      // Clean up interval on unmount or when conditions change
      return () => {
        console.log('[GoogleCalendar Debug] Cleaning up sync interval');
        clearInterval(intervalId);
      };
    }
  }, [
    isInitialized, 
    syncGoogleEvents, 
    settings.googleCalendar?.enabled, 
    settings.googleCalendar?.syncEnabled,
  ]);
  
  return {
    googleTasks,
    isLoading,
    isInitialized,
    fetchGoogleEvents,
    syncGoogleEvents
  }
}

export default useGoogleCalendar