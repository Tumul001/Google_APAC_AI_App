import React from 'react';
import { BookOpen, LogOut, Plus, ShieldCheck, User } from 'lucide-react';
import type { UserProfile } from '../types';

interface NavbarProps {
  user: UserProfile | null;
  onSignOut: () => void;
  onNewEntry: () => void;
  onOpenThreatModel: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onSignOut,
  onNewEntry,
  onOpenThreatModel,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 text-stone-50 shadow-xs">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-stone-900">
                Gemini Reflections
              </h1>
              <span className="inline-flex items-center rounded-full bg-stone-200/70 px-2 py-0.5 text-xs font-medium text-stone-700">
                Gemini 3.6 Flash
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            id="threat-model-btn"
            onClick={onOpenThreatModel}
            className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-2xs hover:bg-stone-50 transition-colors"
            title="View Security Threat Model & Protections"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Threat Model</span>
          </button>

          {user && (
            <>
              <button
                id="new-entry-header-btn"
                onClick={onNewEntry}
                className="flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-50 shadow-2xs hover:bg-stone-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New Journal</span>
              </button>

              <div className="h-4 w-px bg-stone-300 mx-1" />

              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User Avatar'}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full border border-stone-200 object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-stone-600">
                    <User className="h-4 w-4" />
                  </div>
                )}
                <div className="hidden lg:block text-left">
                  <p className="text-xs font-medium text-stone-900 leading-tight">
                    {user.displayName || 'Authenticated User'}
                  </p>
                  <p className="text-[11px] text-stone-500 truncate max-w-[140px] leading-tight">
                    {user.email}
                  </p>
                </div>
              </div>

              <button
                id="sign-out-btn"
                onClick={onSignOut}
                className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Sign Out</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
