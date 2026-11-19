import React from 'react';
import { Capacitor } from '@capacitor/core';
import ReportUploadIndicator from './ReportUploadIndicator';

export default function WebUploadIndicator() {
  if (Capacitor.isNativePlatform()) return null;
  return <ReportUploadIndicator />;
}
