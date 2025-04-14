// src/components/GoogleCalendarSettings.tsx

import React, { useState, useEffect } from 'react';

const GoogleCalendarSettings = () => {
  const [clientId, setClientId] = useState('');
  const [apiKey, setApiKey] = useState('');
  
  useEffect(() => {
    // Load saved credentials if any
    const savedClientId = localStorage.getItem('gcal_client_id');
    const savedApiKey = localStorage.getItem('gcal_api_key');
    
    if (savedClientId) setClientId(savedClientId);
    if (savedApiKey) setApiKey(savedApiKey);
  }, []);
  
  const saveSettings = () => {
    localStorage.setItem('gcal_client_id', clientId);
    localStorage.setItem('gcal_api_key', apiKey);
    
    // Update the global variables in the service
    window.googleCalendarConfig = {
      clientId,
      apiKey
    };
    
    logseq.App.showMsg('Google Calendar settings saved!', 'success');
    
    // Reinitialize the API with new credentials
    if (typeof window.initGoogleCalendarAPI === 'function') {
      window.initGoogleCalendarAPI();
    }
  };
  
  return (
    <div className="google-calendar-settings">
      <h3>Google Calendar Integration</h3>
      
      <div className="setting-group">
        <label htmlFor="client-id">Client ID:</label>
        <input
          id="client-id"
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Google OAuth Client ID"
        />
      </div>
      
      <div className="setting-group">
        <label htmlFor="api-key">API Key:</label>
        <input
          id="api-key"
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Google API Key"
        />
      </div>
      
      <div className="setting-instructions">
        <p>To use Google Calendar integration:</p>
        <ol>
          <li>Create a project in the <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
          <li>Enable the Google Calendar API</li>
          <li>Create OAuth 2.0 credentials (Web Application type)</li>
          <li>Add authorized JavaScript origins (including http://localhost:3000 for testing)</li>
          <li>Add authorized redirect URIs</li>
          <li>Paste your Client ID and API Key above</li>
        </ol>
      </div>
      
      <button onClick={saveSettings} className="save-button">
        Save Settings
      </button>
    </div>
  );
};

export default GoogleCalendarSettings;