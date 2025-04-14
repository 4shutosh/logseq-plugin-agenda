// Google Calendar API service for Agenda3 plugin
import { message } from 'antd'

// API scopes required for reading and writing calendar events
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
]

// Token storage keys
const TOKEN_STORAGE_KEY = 'logseq_agenda_google_token';

interface GoogleCalendarSettings {
  clientId: string;
  apiKey: string;
  clientSecret?: string;
}

let gapi: any = null
let tokenClient: any = null
let settings: GoogleCalendarSettings = {
  clientId: '',
  apiKey: '',
  clientSecret: '',
}

/**
 * Save token to localStorage
 */
const saveToken = (token: any) => {
  if (token) {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
      console.log('[GoogleCalendar] Token saved to localStorage');
    } catch (e) {
      console.error('[GoogleCalendar] Failed to save token to localStorage:', e);
    }
  }
};

/**
 * Load token from localStorage
 */
export const loadToken = () => {
  try {
    const tokenStr = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (tokenStr) {
      return JSON.parse(tokenStr);
    }
  } catch (e) {
    console.error('[GoogleCalendar] Failed to load token from localStorage:', e);
  }
  return null;
};

/**
 * Clear saved token from localStorage
 */
const clearToken = () => {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    console.log('[GoogleCalendar] Token cleared from localStorage');
  } catch (e) {
    console.error('[GoogleCalendar] Failed to clear token from localStorage:', e);
  }
};

/**
 * Initialize Google API client
 */
export const initGoogleApi = async (googleSettings: GoogleCalendarSettings): Promise<boolean> => {
  if (!googleSettings.clientId || !googleSettings.apiKey) {
    message.error('Google Calendar client ID or API key is not configured')
    return false
  }
  
  settings = googleSettings
  
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => {
      gapi = window.gapi
      gapi.load('client', async () => {
        await gapi.client.init({
          apiKey: settings.apiKey,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
        })
        
        // Also load the identity services library
        const scriptGis = document.createElement('script')
        scriptGis.src = 'https://accounts.google.com/gsi/client'
        scriptGis.onload = () => {
          // Configure token client with client secret if available
          const tokenClientConfig: any = {
            client_id: settings.clientId,
            scope: SCOPES.join(' '),
            callback: '', // Will be defined later
          }
          
          // Add client secret if available (for server-side flow)
          if (settings.clientSecret) {
            tokenClientConfig.client_secret = settings.clientSecret
          }
          
          tokenClient = window.google.accounts.oauth2.initTokenClient(tokenClientConfig)
          
          // Try to restore token from localStorage
          const savedToken = loadToken();
          if (savedToken) {
            console.log('[GoogleCalendar] Restoring saved token');
            try {
              gapi.client.setToken(savedToken);
              console.log('[GoogleCalendar] Token restored successfully');
            } catch (e) {
              console.error('[GoogleCalendar] Failed to restore token:', e);
              clearToken(); // Clear invalid token
            }
          }
          
          resolve(true)
        }
        document.body.appendChild(scriptGis)
      })
    }
    document.body.appendChild(script)
  })
}

/**
 * Sign in to Google Calendar
 */
export const signIn = (): Promise<boolean> => {
  if (!tokenClient) {
    message.error('Google API not initialized')
    return Promise.resolve(false)
  }
  
  return new Promise((resolve) => {
    tokenClient.callback = (resp: any) => {
      if (resp.error) {
        message.error('Error signing in to Google Calendar')
        clearToken(); // Clear any existing token
        resolve(false)
      } else {
        // Save the token after successful sign-in
        const token = gapi.client.getToken();
        if (token) {
          saveToken(token);
        }
        message.success('Successfully signed in to Google Calendar')
        resolve(true)
      }
    }
    
    // Check if we should use server-side flow or client-side flow
    const useServerSideFlow = !!settings.clientSecret;
    
    if (gapi.client.getToken() === null) {
      // Prompt the user to select a Google Account and ask for consent
      tokenClient.requestAccessToken({ 
        prompt: 'consent',
        // If client secret is provided, we're using the server-side flow
        // which allows offline access (refresh token)
        include_granted_scopes: true,
        // Only request refresh token if using server-side flow
        access_type: useServerSideFlow ? 'offline' : 'online'
      })
    } else {
      // Skip display of account chooser and consent dialog
      tokenClient.requestAccessToken({ prompt: '' })
    }
  })
}

/**
 * Sign out from Google Calendar
 */
export const signOut = () => {
  if (!gapi) {
    message.error('Google API not initialized')
    return
  }
  
  const token = gapi.client.getToken()
  if (token !== null) {
    // Revoke the token
    window.google.accounts.oauth2.revoke(token.access_token)
    gapi.client.setToken('')
    // Clear the token from localStorage
    clearToken();
    message.success('Signed out from Google Calendar')
  }
}

/**
 * Check if user is signed in
 */
export const isSignedIn = (): boolean => {
  if (!gapi || !gapi.client) return false
  return gapi.client.getToken() !== null
}

/**
 * Get events from Google Calendar within a specified date range
 */
export const getEvents = async (startDate: Date, endDate: Date) => {
  if (!gapi) {
    message.error('Google API not initialized')
    return []
  }
  
  if (!isSignedIn()) {
    console.log('[GoogleCalendar] Not signed in, trying to use saved token');
    // Try to restore the token if available
    const savedToken = loadToken();
    if (savedToken) {
      try {
        gapi.client.setToken(savedToken);
      } catch (e) {
        console.error('[GoogleCalendar] Failed to restore token:', e);
        clearToken();
        message.error('Please sign in to Google Calendar first')
        return [];
      }
    } else {
      message.error('Please sign in to Google Calendar first')
      return []
    }
  }
  
  try {
    console.log('[GoogleCalendar Debug] Calling Google Calendar API with:', {
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString()
    })
    
    try {
      const response = await gapi.client.calendar.events.list({
        'calendarId': 'primary',
        'timeMin': startDate.toISOString(),
        'timeMax': endDate.toISOString(),
        'showDeleted': false,
        'singleEvents': true,
        'orderBy': 'startTime',
        'maxResults': 100 // Increase max results to ensure we get all events
      })
      
      console.log('[GoogleCalendar Debug] API response status:', response.status)
      console.log('[GoogleCalendar Debug] Events returned:', response.result.items?.length || 0)
      
      // Add debugging for first event if available
      if (response.result.items && response.result.items.length > 0) {
        console.log('[GoogleCalendar Debug] First event:', JSON.stringify(response.result.items[0], null, 2))
      }
      
      // Save the token after successful API call in case it was refreshed
      const token = gapi.client.getToken();
      if (token) {
        saveToken(token);
      }
      
      return response.result.items || []
    } catch (apiError: any) {
      // Handle token expired error
      if (apiError.status === 401 || (apiError.result && apiError.result.error && apiError.result.error.code === 401)) {
        console.log('[GoogleCalendar] Token expired, attempting to refresh');
        
        // Clear the token
        gapi.client.setToken(null);
        clearToken();
        
        // Request a new token - this will prompt the user
        const refreshSuccess = await signIn();
        if (refreshSuccess) {
          // Retry the API call
          const retryResponse = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': startDate.toISOString(),
            'timeMax': endDate.toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'orderBy': 'startTime',
            'maxResults': 100
          });
          
          return retryResponse.result.items || [];
        }
      }
      
      // Other API errors
      throw apiError;
    }
  } catch (error) {
    console.error('[GoogleCalendar Debug] Error fetching events from Google Calendar:', error)
    message.error('Failed to fetch events from Google Calendar')
    return []
  }
}

/**
 * Convert Google Calendar events to the format used by the Agenda plugin
 */
export const convertGoogleEventsToSchedules = (events: any[]) => {
  console.log('[GoogleCalendar Debug] Converting', events.length, 'Google events to schedules')
  
  if (events.length === 0) {
    return []
  }
  
  const result = events.map(event => {
    try {
      // Make sure we have valid start/end values
      if (!event.start || !event.end) {
        console.warn('[GoogleCalendar Debug] Event missing start or end:', event.id)
        return null
      }
      
      const startDate = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date)
      const endDate = event.end.dateTime ? new Date(event.end.dateTime) : new Date(event.end.date)
      const isAllDay = !event.start.dateTime
      
      return {
        id: event.id,
        calendarId: 'google_calendar',
        title: event.summary || 'No title',
        body: event.description || '',
        start: startDate,
        end: endDate,
        isAllDay,
        category: isAllDay ? 'allday' : 'time',
        dueDateClass: '',
        location: event.location || '',
        raw: {
          id: event.id,
          googleEvent: true,
          content: event.summary,
          originalStart: startDate,
          originalEnd: endDate,
          rawTime: {
            timeFrom: 'google_calendar',
            start: startDate,
            end: endDate
          }
        }
      }
    } catch (err) {
      console.error('[GoogleCalendar Debug] Error converting event:', err, event)
      return null
    }
  }).filter(Boolean) // Remove any null entries
  
  console.log('[GoogleCalendar Debug] Converted to', result.length, 'schedules')
  if (result.length > 0) {
    console.log('[GoogleCalendar Debug] First converted schedule:', result[0])
  }
  
  return result
}

/**
 * Create a new event in Google Calendar
 */
export const createEvent = async (title: string, start: Date, end: Date, isAllDay: boolean = false) => {
  if (!gapi || !isSignedIn()) {
    message.error('Please sign in to Google Calendar first')
    return null
  }
  
  const event = {
    'summary': title,
    'start': isAllDay ? { 'date': start.toISOString().split('T')[0] } : { 'dateTime': start.toISOString() },
    'end': isAllDay ? { 'date': end.toISOString().split('T')[0] } : { 'dateTime': end.toISOString() }
  }
  
  try {
    const response = await gapi.client.calendar.events.insert({
      'calendarId': 'primary',
      'resource': event
    })
    
    message.success('Event created in Google Calendar')
    return response.result
  } catch (error) {
    console.error('Error creating event in Google Calendar:', error)
    message.error('Failed to create event in Google Calendar')
    return null
  }
}

/**
 * Update an existing event in Google Calendar
 */
export const updateEvent = async (eventId: string, title: string, start: Date, end: Date, isAllDay: boolean = false) => {
  if (!gapi || !isSignedIn()) {
    message.error('Please sign in to Google Calendar first')
    return null
  }
  
  const event = {
    'summary': title,
    'start': isAllDay ? { 'date': start.toISOString().split('T')[0] } : { 'dateTime': start.toISOString() },
    'end': isAllDay ? { 'date': end.toISOString().split('T')[0] } : { 'dateTime': end.toISOString() }
  }
  
  try {
    const response = await gapi.client.calendar.events.update({
      'calendarId': 'primary',
      'eventId': eventId,
      'resource': event
    })
    
    message.success('Event updated in Google Calendar')
    return response.result
  } catch (error) {
    console.error('Error updating event in Google Calendar:', error)
    message.error('Failed to update event in Google Calendar')
    return null
  }
}

/**
 * Delete an event from Google Calendar
 */
export const deleteEvent = async (eventId: string) => {
  if (!gapi || !isSignedIn()) {
    message.error('Please sign in to Google Calendar first')
    return false
  }
  
  try {
    await gapi.client.calendar.events.delete({
      'calendarId': 'primary',
      'eventId': eventId
    })
    
    message.success('Event deleted from Google Calendar')
    return true
  } catch (error) {
    console.error('Error deleting event from Google Calendar:', error)
    message.error('Failed to delete event from Google Calendar')
    return false
  }
}

// Declare global for TypeScript
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Export gapi for use in other modules
export { gapi }; 