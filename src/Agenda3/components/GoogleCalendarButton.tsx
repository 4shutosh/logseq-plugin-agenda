// src/components/GoogleCalendarButton.tsx

import React from 'react';
import { Button, Tooltip } from 'antd';
import { CalendarOutlined, SyncOutlined } from '@ant-design/icons';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';

interface GoogleCalendarButtonProps {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  onEventsUpdate?: (events: any[]) => void;
}

const GoogleCalendarButton: React.FC<GoogleCalendarButtonProps> = ({
  clientId,
  clientSecret,
  redirectUri,
  onEventsUpdate
}) => {
  const {
    isAuthenticated,
    isLoading,
    handleAuth,
    fetchEvents,
  } = useGoogleCalendar({
    clientId,
    clientSecret,
    redirectUri,
  });

  const handleSync = async () => {
    if (!isAuthenticated) {
      await handleAuth();
    }
    
    const now = new Date();
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(now.getMonth() + 1);
    
    const events = await fetchEvents(now, oneMonthFromNow);
    if (events && onEventsUpdate) {
      onEventsUpdate(events);
    }
  };

  return (
    <Tooltip title={isAuthenticated ? "Sync with Google Calendar" : "Connect Google Calendar"}>
      <Button
        type="text"
        icon={isLoading ? <SyncOutlined spin /> : <CalendarOutlined />}
        onClick={handleSync}
        className={`flex items-center justify-center ${isAuthenticated ? 'text-green-500' : ''}`}
      />
    </Tooltip>
  );
};

export default GoogleCalendarButton;