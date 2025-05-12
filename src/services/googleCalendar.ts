/**
 * Google Calendar API Service for Agenda3 plugin
 * Handles authentication, token management, and calendar operations
 */
import { AgendaTaskWithStartOrDeadline, AgendaTaskWithStart } from '@/types/task';
import { message } from 'antd';
import dayjs from 'dayjs';

// Add error message handling utility
let lastErrorMessage: string | null = null;
let errorMessageTimeout: NodeJS.Timeout | null = null;

const showErrorMessage = (errorMsg: string) => {
  // If there's already an error message showing, don't show another one
  if (lastErrorMessage === errorMsg) {
    return;
  }

  // Clear any existing timeout
  if (errorMessageTimeout) {
    clearTimeout(errorMessageTimeout);
  }

  // Show the new error message
  message.error(errorMsg);
  lastErrorMessage = errorMsg;

  // Clear the last error message after 3 seconds
  errorMessageTimeout = setTimeout(() => {
    lastErrorMessage = null;
  }, 3000);
};

// API scopes required for reading and writing calendar events
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

// Token storage keys
const TOKEN_STORAGE_KEY = 'logseq_agenda_google_token';

interface GoogleCalendarSettings {
  clientId: string;
  apiKey: string;
  clientSecret?: string;
}

// Global variables
let gapi: any = null;
let tokenClient: any = null;
let settings: GoogleCalendarSettings = {
  clientId: '',
  apiKey: '',
  clientSecret: '',
};

// Track initialization state
let isInitialized = false;
let isInitializing = false;
let initPromise: Promise<boolean> | null = null;

/**
 * Save token to localStorage
 */
const saveToken = (token: any) => {
  if (!token) return;
  
  try {
    // Save the token itself
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
    
    console.log('[GoogleCalendar] Token saved to localStorage');
  } catch (e) {
    console.error('[GoogleCalendar] Failed to save token to localStorage:', e);
  }
};

/**
 * Load token from localStorage
 */
export const loadToken = () => {
  try {
    const tokenStr = localStorage.getItem(TOKEN_STORAGE_KEY);
    
    if (!tokenStr) return null;
    
    return JSON.parse(tokenStr);
  } catch (e) {
    console.error('[GoogleCalendar] Failed to load token from localStorage:', e);
    return null;
  }
};

/**
 * Clear token from localStorage
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
 * Verify token validity by making a simple API call
 */
export const verifyToken = async (): Promise<boolean> => {
  if (!gapi || !gapi.client) {
    console.log('[GoogleCalendar] GAPI not available for token verification');
    return false;
  }
  
  const token = gapi.client.getToken();
  if (!token) {
    console.log('[GoogleCalendar] No token available to verify');
    return false;
  }
  
  try {
    // Make a minimal API call to verify token is working
    // Using calendarList.get is lightweight
    const response = await gapi.client.calendar.calendarList.get({
      'calendarId': 'primary'
    });
    
    if (response && response.status === 200) {
      console.log('[GoogleCalendar] Token verification successful');
      
      return true;
    }
    
    return false;
  } catch (error: any) {
    console.error('[GoogleCalendar] Token verification failed:', error);
    
    // If token is invalid, clear it
    if (error.status === 401) {
      console.log('[GoogleCalendar] Token is invalid, clearing');
      clearToken();
      gapi.client.setToken(null);
    }
    
    return false;
  }
};

/**
 * Initialize Google API client with given settings
 * This loads the necessary scripts and initializes the API client
 */
export const initGoogleApi = async (googleSettings: GoogleCalendarSettings): Promise<boolean> => {
  // Validate required settings
  if (!googleSettings.clientId || !googleSettings.apiKey) {
    console.error('[GoogleCalendar] Missing required settings: clientId or apiKey');
    return false;
  }
  
  // Don't initialize multiple times simultaneously
  if (isInitializing) {
    console.log('[GoogleCalendar] Already initializing, returning existing promise');
    return initPromise!;
  }
  
  // If already initialized with the same settings, return true
  if (isInitialized && 
      settings.clientId === googleSettings.clientId && 
      settings.apiKey === googleSettings.apiKey) {
    console.log('[GoogleCalendar] Already initialized with same settings');
    return true;
  }
  
  // Update settings
  settings = { ...googleSettings };
  
  // Set flags and create promise
  isInitializing = true;
  initPromise = new Promise<boolean>((resolve) => {
    console.log('[GoogleCalendar] Starting initialization');
    
    // Step 1: Load the Google API script
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('[GoogleCalendar] Google API script loaded');
      gapi = window.gapi;
      
      // Step 2: Load the client library
      gapi.load('client', async () => {
        console.log('[GoogleCalendar] GAPI client loaded');
        
        try {
          // Step 3: Initialize the client with API key and discovery docs
          await gapi.client.init({
            apiKey: settings.apiKey,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
          });
          
          console.log('[GoogleCalendar] GAPI client initialized');
          
          // Step 4: Load the Google Identity Services script
          const scriptGis = document.createElement('script');
          scriptGis.src = 'https://accounts.google.com/gsi/client';
          scriptGis.async = true;
          scriptGis.defer = true;
          
          scriptGis.onload = async () => {
            console.log('[GoogleCalendar] Google Identity Services script loaded');
            
            // Step 5: Initialize token client
            const tokenClientConfig: any = {
              client_id: settings.clientId,
              scope: SCOPES.join(' '),
              callback: '', // Will be set during sign-in
              prompt: '', // Will be set during sign-in
            };
            
            // Add client secret if available
            if (settings.clientSecret) {
              tokenClientConfig.client_secret = settings.clientSecret;
            }
            
            tokenClient = window.google.accounts.oauth2.initTokenClient(tokenClientConfig);
            console.log('[GoogleCalendar] Token client initialized');
            
            // Step 6: Try to restore token from localStorage
            const savedToken = loadToken();
            if (savedToken) {
              console.log('[GoogleCalendar] Attempting to restore saved token');
              try {
                gapi.client.setToken(savedToken);
                
                // Verify the token is valid
                const isValid = await verifyToken();
                if (isValid) {
                  console.log('[GoogleCalendar] Token restored and verified successfully');
                } else {
                  console.log('[GoogleCalendar] Restored token is invalid');
                }
              } catch (e) {
                console.error('[GoogleCalendar] Failed to restore token:', e);
                clearToken();
              }
            }
            
            // Complete initialization
            isInitialized = true;
            isInitializing = false;
            console.log('[GoogleCalendar] Initialization complete');
            resolve(true);
          };
          
          scriptGis.onerror = () => {
            console.error('[GoogleCalendar] Failed to load Google Identity Services script');
            isInitializing = false;
            resolve(false);
          };
          
          document.body.appendChild(scriptGis);
          
        } catch (error) {
          console.error('[GoogleCalendar] Error initializing GAPI client:', error);
          isInitializing = false;
          resolve(false);
        }
      });
    };
    
    script.onerror = () => {
      console.error('[GoogleCalendar] Failed to load Google API script');
      isInitializing = false;
      resolve(false);
    };
    
    document.body.appendChild(script);
  });
  
  return initPromise;
};

/**
 * Sign in to Google Calendar
 * This will prompt the user to grant permissions if needed
 */
export const signIn = async (): Promise<boolean> => {
  // Make sure Google API is initialized
  if (!gapi || !tokenClient) {
    console.error('[GoogleCalendar] Google API not initialized, cannot sign in');
    showErrorMessage('Google API not initialized. Please refresh the page and try again.');
    return false;
  }
  
  return new Promise<boolean>((resolve) => {
    // Configure the callback for token client
    tokenClient.callback = (resp: any) => {
      if (resp.error) {
        console.error('[GoogleCalendar] Error during sign in:', resp.error);
        clearToken();
        showErrorMessage('Error signing in to Google Calendar');
        resolve(false);
        return;
      }
      
      console.log('[GoogleCalendar] Sign in successful');
      
      // Save the token after successful sign-in
      const token = gapi.client.getToken();
      if (token) {
        saveToken(token);
      }
      
      message.success('Successfully signed in to Google Calendar');
      resolve(true);
    };
    
    // Check for existing token first
    if (gapi.client.getToken() !== null) {
      // Verify existing token is valid
      verifyToken().then(isValid => {
        if (isValid) {
          console.log('[GoogleCalendar] Already signed in with valid token');
          message.success('Already signed in to Google Calendar');
          resolve(true);
        } else {
          console.log('[GoogleCalendar] Existing token invalid, requesting new token');
          // Request a new token
          const useServerSideFlow = !!settings.clientSecret;
          
          tokenClient.requestAccessToken({
            prompt: 'consent',
            include_granted_scopes: true,
            access_type: useServerSideFlow ? 'offline' : 'online'
          });
        }
      });
    } else {
      console.log('[GoogleCalendar] No token found, requesting new token');
      // Determine if we should use server-side flow or client-side flow
      const useServerSideFlow = !!settings.clientSecret;
      
      // Request a token with consent prompt to ensure we get refresh token when using server-side flow
      tokenClient.requestAccessToken({
        prompt: 'consent',
        include_granted_scopes: true,
        access_type: useServerSideFlow ? 'offline' : 'online'
      });
    }
  });
};

/**
 * Sign out from Google Calendar
 * This revokes the token and clears it from storage
 */
export const signOut = (): boolean => {
  if (!gapi) {
    console.error('[GoogleCalendar] Google API not initialized, cannot sign out');
    showErrorMessage('Google API not initialized');
    return false;
  }
  
  const token = gapi.client.getToken();
  if (token !== null) {
    try {
      // Revoke the token
      window.google.accounts.oauth2.revoke(token.access_token, () => {
        console.log('[GoogleCalendar] Token revoked successfully');
      });
      
      // Clear token from client
      gapi.client.setToken('');
      
      // Clear token from storage
      clearToken();
      
      message.success('Signed out from Google Calendar');
      return true;
    } catch (e) {
      console.error('[GoogleCalendar] Error during sign out:', e);
      showErrorMessage('Error signing out from Google Calendar');
      return false;
    }
  } else {
    console.log('[GoogleCalendar] No token to sign out');
    clearToken(); // Clear any lingering token in storage
    return true;
  }
};

/**
 * Check if user is signed in to Google Calendar
 * This checks for token existence and validates it
 */
export const isSignedIn = async (): Promise<boolean> => {
  if (!gapi || !gapi.client) {
    return false;
  }
  
  const token = gapi.client.getToken();
  if (!token) {
    return false;
  }
  
  // For synchronous calls, just check if token exists
  return true;
};

/**
 * Ensure user is authenticated before performing an operation
 * This will attempt to restore token and verify it's valid
 */
export const ensureAuthenticated = async (): Promise<boolean> => {
  if (!gapi || !gapi.client) {
    console.error('[GoogleCalendar] Google API not initialized');
    return false;
  }
  
  // Check if token exists
  let token = gapi.client.getToken();
  if (!token) {
    // Try to restore from localStorage
    const savedToken = loadToken();
    if (savedToken) {
      try {
        gapi.client.setToken(savedToken);
        token = savedToken;
      } catch (e) {
        console.error('[GoogleCalendar] Failed to restore token:', e);
        clearToken();
        return false;
      }
    } else {
      console.log('[GoogleCalendar] No saved token found');
      return false;
    }
  }
  
  // Verify token is valid
  try {
    const isValid = await verifyToken();
    return isValid;
  } catch (e) {
    console.error('[GoogleCalendar] Error verifying token:', e);
    return false;
  }
};

/**
 * Get events from Google Calendar within a specified date range
 */
export const getEvents = async (startDate: Date, endDate: Date) => {
  // First ensure Google API is initialized
  if (!gapi || !gapi.client) {
    console.error('[GoogleCalendar] Google API not initialized, cannot get events');
    showErrorMessage('Google API not initialized');
    return [];
  }
  
  // Make sure user is authenticated
  const isAuthenticated = await ensureAuthenticated();
  if (!isAuthenticated) {
    console.log('[GoogleCalendar] User not authenticated, cannot get events');
    showErrorMessage('Please sign in to Google Calendar first');
    return [];
  }
  
  try {
    // Fetch calendar colors if we haven't done so yet
    if (!fetchedCalendarColors) {
      fetchedCalendarColors = await fetchGoogleCalendarColors();
      if (fetchedCalendarColors) {
        console.log('[GoogleCalendar] Successfully fetched calendar colors');
      }
    }
    
    console.log('[GoogleCalendar] Fetching events:', {
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString()
    });
    
    const response = await gapi.client.calendar.events.list({
      'calendarId': 'primary',
      'timeMin': startDate.toISOString(),
      'timeMax': endDate.toISOString(),
      'showDeleted': false,
      'singleEvents': true,
      'orderBy': 'startTime',
      'maxResults': 100
    });
    
    console.log('[GoogleCalendar] Events fetched successfully:', 
      response.result.items?.length || 0, 'events');

    console.log('events', response)
    
    return response.result.items || [];
  } catch (error: any) {
    console.error('[GoogleCalendar] Error fetching events:', error);
    
    // If unauthorized, try to re-authenticate
    if (error.status === 401 || 
        (error.result && error.result.error && error.result.error.code === 401)) {
      console.log('[GoogleCalendar] Unauthorized, token may be expired');
      
      // Clear token
      gapi.client.setToken(null);
      clearToken();
      
      showErrorMessage('Your Google Calendar session has expired. Please sign in again.');
      return [];
    }
    
    showErrorMessage('Failed to fetch events from Google Calendar');
    return [];
  }
};

export const convertGoogleEventsToAgendaTask = (events: any[]): (AgendaTaskWithStartOrDeadline & {
  rawBlock: any;
  isGCalEvent: boolean;
  extendedProps: any;
  bgColor?: string;
  color?: string;
  borderColor?: string;
  colorId?: string;
})[] => {
  return events.map(event => {
    const start = event.start.dateTime || event.start.date;
    const end = event.end?.dateTime || event.end?.date;
    
    // Get color from the event or use default
    let bgColor = '#4285F4';  // Default blue color
    let textColor = '#FFFFFF'; // Default white text
    
    if (event.colorId) {
      // Try to use fetched colors first if available
      if (fetchedCalendarColors && fetchedCalendarColors.event && fetchedCalendarColors.event[event.colorId]) {
        bgColor = fetchedCalendarColors.event[event.colorId].background;
        textColor = fetchedCalendarColors.event[event.colorId].foreground;
      } 
      // Fall back to predefined colors
      else if (googleCalendarColors[event.colorId]) {
        bgColor = googleCalendarColors[event.colorId].background;
        textColor = googleCalendarColors[event.colorId].foreground;
      }
    }
    
    console.log('[GoogleCalendar] Event colorId:', event.colorId, 'Mapped to bgColor:', bgColor, 'textColor:', textColor);
    
    // Create a compatible rawBlock that matches BlockFromQuery structure
    const rawBlock: any = {
      id: `gcal_${event.id}`,
      uuid: `gcal_${event.id}`,
      content: event.summary || 'Untitled Event',
      format: 'markdown',
      marker: 'TODO',
      left: { id: 0 },
      parent: { id: 0 },
      page: {
        id: 'google_calendar',
        originalName: 'Google Calendar', 
        isJournal: false,
        journalDay: undefined,
        'journal?': false
      },
      properties: {
        'google-calendar': 'true',
        'description': event.description || '',
        'location': event.location || ''
      },
      repeated: false,
      unordered: false
    };
    
    const task: AgendaTaskWithStart & { 
      rawBlock: any;
      isGCalEvent: boolean;
      extendedProps: any;
      bgColor: string;
      color: string;
      borderColor: string;
      colorId?: string;
    } = {
      id: `gcal_${event.id}`, // Prefix to identify Google Calendar events
      title: event.summary || 'Untitled Event',
      showTitle: event.summary || 'Untitled Event',
      status: 'todo',
      allDay: !event.start.dateTime, // If no time component, it's an all-day event
      start: dayjs(start),
      end: end ? dayjs(end) : undefined,
      project: {
        id: 'google_calendar',
        originalName: 'Google Calendar',
        isJournal: false,
        properties: {
          'agenda-color': bgColor
        }
      },
      rawBlock: rawBlock,
      isGCalEvent: true,
      extendedProps: {
        source: 'google_calendar',
        originalEvent: event
      },
      colorId: event.colorId,
      // Add colors for styling in calendar
      bgColor: bgColor,
      color: textColor,
      borderColor: bgColor
    };
    
    return task;
  });
};

/**
 * Fetch Google Calendar colors directly from the API
 * This loads the actual color palette used by the calendar
 */
export const fetchGoogleCalendarColors = async (): Promise<any> => {
  // First ensure Google API is initialized
  if (!gapi || !gapi.client) {
    console.error('[GoogleCalendar] Google API not initialized, cannot fetch colors');
    return null;
  }
  
  // Make sure user is authenticated
  const isAuthenticated = await ensureAuthenticated();
  if (!isAuthenticated) {
    console.log('[GoogleCalendar] User not authenticated, cannot fetch colors');
    return null;
  }
  
  try {
    console.log('[GoogleCalendar] Fetching calendar colors');
    
    const response = await gapi.client.calendar.colors.get({});
    
    console.log('[GoogleCalendar] Colors fetched successfully:', response.result);
    
    return response.result;
  } catch (error) {
    console.error('[GoogleCalendar] Error fetching calendar colors:', error);
    return null;
  }
};

// Google Calendar color mapping
// These are approximate colors used by Google Calendar
// Will be used as fallback if we can't fetch actual colors from the API
const googleCalendarColors = {
  '1': { background: '#7986CB', foreground: '#FFFFFF' }, // Lavender
  '2': { background: '#33B679', foreground: '#FFFFFF' }, // Sage
  '3': { background: '#8E24AA', foreground: '#FFFFFF' }, // Grape
  '4': { background: '#E67C73', foreground: '#FFFFFF' }, // Flamingo
  '5': { background: '#F6BF26', foreground: '#000000' }, // Banana
  '6': { background: '#F4511E', foreground: '#FFFFFF' }, // Tangerine
  '7': { background: '#039BE5', foreground: '#FFFFFF' }, // Peacock
  '8': { background: '#616161', foreground: '#FFFFFF' }, // Graphite
  '9': { background: '#3F51B5', foreground: '#FFFFFF' }, // Blueberry
  '10': { background: '#0B8043', foreground: '#FFFFFF' }, // Basil
  '11': { background: '#D50000', foreground: '#FFFFFF' }, // Tomato
};

// Store fetched colors from the API
let fetchedCalendarColors: any = null;

/**
 * Create a new event in Google Calendar
 */
export const createEvent = async (title: string, start: Date, end: Date, isAllDay: boolean = false) => {
  // First ensure Google API is initialized
  if (!gapi || !gapi.client) {
    console.error('[GoogleCalendar] Google API not initialized, cannot create event');
    showErrorMessage('Google API not initialized');
    return null;
  }
  
  // Make sure user is authenticated
  const isAuthenticated = await ensureAuthenticated();
  if (!isAuthenticated) {
    console.log('[GoogleCalendar] User not authenticated, cannot create event');
    showErrorMessage('Please sign in to Google Calendar first');
    return null;
  }
  
  const event = {
    'summary': title,
    'start': isAllDay ? { 'date': start.toISOString().split('T')[0] } : { 'dateTime': start.toISOString() },
    'end': isAllDay ? { 'date': end.toISOString().split('T')[0] } : { 'dateTime': end.toISOString() }
  };
  
  try {
    console.log('[GoogleCalendar] Creating new event:', event);
    
    const response = await gapi.client.calendar.events.insert({
      'calendarId': 'primary',
      'resource': event
    });
    
    console.log('[GoogleCalendar] Event created successfully');
    
    message.success('Event created in Google Calendar');
    return response.result;
  } catch (error) {
    console.error('[GoogleCalendar] Error creating event:', error);
    showErrorMessage('Failed to create event in Google Calendar');
    return null;
  }
};

/**
 * Update an existing event in Google Calendar
 */
export const updateGoogleEvent = async (eventId: string, title: string, 
  start: Date, end: Date, isAllDay: boolean = false, colorId?: string) => {
  // First ensure Google API is initialized
  if (!gapi || !gapi.client) {
    console.error('[GoogleCalendar] Google API not initialized, cannot update event');
    showErrorMessage('Google API not initialized');
    return null;
  }
  
  // Make sure user is authenticated
  const isAuthenticated = await ensureAuthenticated();
  if (!isAuthenticated) {
    console.log('[GoogleCalendar] User not authenticated, cannot update event');
    showErrorMessage('Please sign in to Google Calendar first');
    return null;
  }
  
  const event: any = {
    'summary': title,
    'start': isAllDay ? { 'date': start.toISOString().split('T')[0] } : { 'dateTime': start.toISOString() },
    'end': isAllDay ? { 'date': end.toISOString().split('T')[0] } : { 'dateTime': end.toISOString() }
  };
  
  // Only add colorId if provided (to maintain the original color)
  if (colorId) {
    event.colorId = colorId;
  }
  
  try {
    console.log('[GoogleCalendar] Updating event:', eventId);
    
    const response = await gapi.client.calendar.events.update({
      'calendarId': 'primary',
      'eventId': eventId,
      'resource': event
    });
    
    console.log('[GoogleCalendar] Event updated successfully');
    
    message.success('Event updated in Google Calendar');
    return response.result;
  } catch (error) {
    console.error('[GoogleCalendar] Error updating event:', error);
    showErrorMessage('Failed to update event in Google Calendar');
    return null;
  }
};

/**
 * Delete an event from Google Calendar
 */
export const deleteEvent = async (eventId: string) => {
  // First ensure Google API is initialized
  if (!gapi || !gapi.client) {
    console.error('[GoogleCalendar] Google API not initialized, cannot delete event');
    showErrorMessage('Google API not initialized');
    return false;
  }
  
  // Make sure user is authenticated
  const isAuthenticated = await ensureAuthenticated();
  if (!isAuthenticated) {
    console.log('[GoogleCalendar] User not authenticated, cannot delete event');
    showErrorMessage('Please sign in to Google Calendar first');
    return false;
  }
  
  try {
    console.log('[GoogleCalendar] Deleting event:', eventId);
    
    await gapi.client.calendar.events.delete({
      'calendarId': 'primary',
      'eventId': eventId
    });
    
    console.log('[GoogleCalendar] Event deleted successfully');
    
    message.success('Event deleted from Google Calendar');
    return true;
  } catch (error) {
    console.error('[GoogleCalendar] Error deleting event:', error);
    showErrorMessage('Failed to delete event from Google Calendar');
    return false;
  }
};

// Global type declarations
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Export gapi for use in other modules
export { gapi };