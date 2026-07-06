
'use client';
import { useState } from 'react';
import { ArchiveLoginForm } from '@/components/archivo/login-form';
import { ArchiveDashboard } from '@/components/archivo/archive-dashboard';

export default function PageContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };
  
  const handleLogout = () => {
    setIsAuthenticated(false);
  }

  return (
    <div className="py-0 md:py-4">
      {isAuthenticated ? (
        <ArchiveDashboard onLogout={handleLogout} />
      ) : (
        <div className="container mx-auto px-4">
          <ArchiveLoginForm
            onLoginSuccess={handleLoginSuccess}
          />
        </div>
      )}
    </div>
  );
}
