// contexts/NotificationContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    const preference = localStorage.getItem('notifications-enabled');
    if (preference !== null) {
      setNotificationsEnabled(JSON.parse(preference));
    }
  }, []);

  const toggleNotifications = (enabled) => {
    setNotificationsEnabled(enabled);
    localStorage.setItem('notifications-enabled', JSON.stringify(enabled));
  };

  return (
    <NotificationContext.Provider value={{
      notificationsEnabled,
      toggleNotifications
    }}>
      {children}
    </NotificationContext.Provider>
  );
};