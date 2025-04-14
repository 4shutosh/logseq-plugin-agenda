import { useState, useEffect } from 'react'
import { Input, Switch, Button, Divider, message } from 'antd'
import { useTranslation } from 'react-i18next'

import useSettings from '@/Agenda3/hooks/useSettings'
import { initGoogleApi, isSignedIn, signIn, signOut } from '@/services/googleCalendar'
import ColorPicker from '@/components/ColorPicker'

const GoogleCalendarForm = () => {
  const { t } = useTranslation()
  const { settings, setSettings } = useSettings()
  const [googleSignedIn, setGoogleSignedIn] = useState(false)
  
  // Check if user is signed in when component mounts
  useEffect(() => {
    const checkSignIn = async () => {
      const googleSettings = settings.googleCalendar
      if (googleSettings?.enabled && googleSettings?.clientId && googleSettings?.apiKey) {
        await initGoogleApi({
          clientId: googleSettings.clientId,
          apiKey: googleSettings.apiKey,
          clientSecret: googleSettings.clientSecret
        })
        setGoogleSignedIn(isSignedIn())
      }
    }
    
    checkSignIn()
  }, [settings.googleCalendar])
  
  // Handle Google Sign-in button click
  const handleGoogleSignIn = async () => {
    const googleSettings = settings.googleCalendar
    if (!googleSettings?.clientId || !googleSettings?.apiKey) {
      return message.error('Please enter Google API client ID and API key first')
    }

    await initGoogleApi({
      clientId: googleSettings.clientId,
      apiKey: googleSettings.apiKey,
      clientSecret: googleSettings.clientSecret
    })

    const success = await signIn()
    if (success) {
      setGoogleSignedIn(true)
    }
  }

  // Handle Google Sign-out button click
  const handleGoogleSignOut = () => {
    signOut()
    setGoogleSignedIn(false)
  }
  
  const onChangeGoogleEnabled = (checked: boolean) => {
    setSettings('googleCalendar.enabled', checked)
  }
  
  const onChangeAutoSync = (checked: boolean) => {
    setSettings('googleCalendar.syncEnabled', checked)
  }
  
  const onChangeClientId = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings('googleCalendar.clientId', e.target.value)
  }
  
  const onChangeClientSecret = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings('googleCalendar.clientSecret', e.target.value)
  }
  
  const onChangeApiKey = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings('googleCalendar.apiKey', e.target.value)
  }

  const handleColorChange = (colorType: string, color: string) => {
    setSettings(`googleCalendar.calendar.${colorType}`, color)
  }
  
  return (
    <>
      <div className="flex h-14 items-center border-b pl-4 text-lg font-semibold">{t('Google Calendar')}</div>
      <div className="mt-4 px-4 pb-8">
        <div className="flex items-center gap-2">
          <Switch 
            checked={settings.googleCalendar?.enabled} 
            onChange={onChangeGoogleEnabled}
          />
          <span>{t('Enable Google Calendar Integration')}</span>
        </div>
        
        {settings.googleCalendar?.enabled && (
          <div className="mt-4">
            <div className="mb-4">
              <div className="text-gray-500 mb-1">{t('Client ID')}</div>
              <Input
                className="w-[400px]"
                placeholder="Google API Client ID"
                value={settings.googleCalendar?.clientId}
                onChange={onChangeClientId}
              />
              <div className="text-xs text-gray-500 mt-1">
                {t('Create a project in Google Cloud Console and get your client ID')}
              </div>
            </div>
            
            <div className="mb-4">
              <div className="text-gray-500 mb-1">{t('Client Secret')}</div>
              <Input
                className="w-[400px]"
                placeholder="Google API Client Secret"
                value={settings.googleCalendar?.clientSecret}
                onChange={onChangeClientSecret}
                type="password"
              />
              <div className="text-xs text-gray-500 mt-1">
                {t('Client Secret from Google Cloud Console OAuth 2.0 credentials')}
              </div>
            </div>
            
            <div className="mb-4">
              <div className="text-gray-500 mb-1">{t('API Key')}</div>
              <Input
                className="w-[400px]"
                placeholder="Google API Key"
                value={settings.googleCalendar?.apiKey}
                onChange={onChangeApiKey}
              />
              <div className="text-xs text-gray-500 mt-1">
                {t('Create an API key in Google Cloud Console')}
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              <Switch 
                checked={settings.googleCalendar?.syncEnabled} 
                onChange={onChangeAutoSync}
              />
              <span>{t('Auto Sync')}</span>
            </div>
            
            <div className="mb-4">
              <div className="text-gray-500 mb-2">{t('Calendar Colors')}</div>
              <div className="flex items-center">
                <ColorPicker 
                  text="background" 
                  value={settings.googleCalendar?.calendar?.bgColor} 
                  onChange={(color) => handleColorChange('bgColor', color)} 
                />
                <ColorPicker 
                  text="text" 
                  value={settings.googleCalendar?.calendar?.textColor} 
                  onChange={(color) => handleColorChange('textColor', color)} 
                />
                <ColorPicker 
                  text="border" 
                  value={settings.googleCalendar?.calendar?.borderColor} 
                  onChange={(color) => handleColorChange('borderColor', color)} 
                />
              </div>
            </div>
            
            <div className="mb-4">
              <div className="text-gray-500 mb-2">{t('Google Account')}</div>
              {googleSignedIn ? (
                <Button onClick={handleGoogleSignOut}>{t('Sign Out')}</Button>
              ) : (
                <Button 
                  type="primary" 
                  onClick={handleGoogleSignIn}
                  disabled={!settings.googleCalendar?.clientId || !settings.googleCalendar?.apiKey}
                >
                  {t('Sign In with Google')}
                </Button>
              )}
            </div>
            
            <Divider />
            
            <div className="text-xs text-gray-500">
              <p>{t('To set up Google Calendar integration, follow these steps:')}</p>
              <ol className="list-decimal pl-5 mt-2 space-y-1">
                <li>{t('Go to the Google Cloud Console (console.cloud.google.com)')}</li>
                <li>{t('Create a new project or select an existing one')}</li>
                <li>{t('Enable the Google Calendar API for your project')}</li>
                <li>{t('Go to "APIs & Services" > "Credentials"')}</li>
                <li>{t('Create OAuth 2.0 Client credentials (Web application type)')}</li>
                <li>{t('Add your authorized redirect URI: http://localhost:3000')}</li>
                <li>{t('Copy the Client ID and Client Secret to the fields above')}</li>
                <li>{t('Create an API key for your project and copy it to the API Key field')}</li>
              </ol>
              <p className="mt-2">{t('This integration requires the following OAuth 2.0 scopes:')}</p>
              <ul className="list-disc pl-5">
                <li>https://www.googleapis.com/auth/calendar.readonly</li>
                <li>https://www.googleapis.com/auth/calendar.events</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default GoogleCalendarForm 