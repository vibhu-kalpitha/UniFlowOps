import React from 'react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { ToastContainer } from './Toast';
import '../styles/global.css';

interface AppShellProps {
  children: React.ReactNode;
  headerTitle?: string;
  hideNav?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({ children, headerTitle, hideNav = false }) => {
  return (
    <div className="desktop-wrapper">
      <div className="phone-frame">
        <Header title={headerTitle} />
        <ToastContainer />
        <main className="app-content">{children}</main>
        {!hideNav && <BottomNav />}
      </div>
    </div>
  );
};
