import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Eye,
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  ArrowLeft,
  UserCheck,
  AlertTriangle,
  Lock,
  RefreshCw,
  Share2,
} from 'lucide-react';
import type { JournalEntry, UserProfile } from '../types';
import { subscribeToSharedCoachEntries, logAdminEntryView, forceRefreshToken } from '../lib/firebase';
import { LocationPreview } from './LocationPreview';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AdminDashboardProps {
  user: UserProfile;
  onNavigateHome: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onNavigateHome }) => {
  const [sharedEntries, setSharedEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [auditLogStatus, setAuditLogStatus] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [firestoreErrorCode, setFirestoreErrorCode] = useState<string | null>(null);
  const [decodedClaims, setDecodedClaims] = useState<Record<string, any> | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Subscribe in real-time to shared entries after force-refreshing token
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isCancelled = false;

    const initSubscription = async () => {
      setIsLoading(true);
      setAccessError(null);
      setFirestoreErrorCode(null);

      // Force refresh token on mount so Firestore SDK stream carries the latest claims
      try {
        console.log('[AdminDashboard] Requesting forceRefreshToken() on mount before Firestore collectionGroup query...');
        const result = await forceRefreshToken();
        console.log('[AdminDashboard] Decoded token claims right before access check:', {
          claims: result.claims,
          'claims.admin': result.claims.admin,
          isAdmin: result.isAdmin,
        });
        if (!isCancelled) {
          setDecodedClaims(result.claims);
        }
      } catch (e) {
        console.warn('[AdminDashboard] Could not force refresh token prior to subscription:', e);
      }

      if (isCancelled) return;

      unsubscribe = subscribeToSharedCoachEntries(
        (entries) => {
          if (!isCancelled) {
            setSharedEntries(entries);
            setIsLoading(false);
          }
        },
        (err) => {
          if (!isCancelled) {
            console.error('[AdminDashboard] Failed to subscribe to coach shared entries:', {
              code: err?.code,
              message: err?.message,
              err,
            });
            setAccessError(err?.message || 'Permission denied: Your account lacks the required admin custom claims.');
            setFirestoreErrorCode(err?.code || 'permission-denied');
            setIsLoading(false);
          }
        }
      );
    };

    initSubscription();

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [retryKey]);

  const handleForceRefreshAndRetry = async () => {
    setIsRefreshing(true);
    try {
      console.log('[AdminDashboard] Manual token refresh triggered by user...');
      const result = await forceRefreshToken();
      console.log('[AdminDashboard] Manual refresh result claims:', result.claims);
      setDecodedClaims(result.claims);
      setRetryKey((k) => k + 1);
    } catch (e) {
      console.error('Manual token refresh failed:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // When an admin selects and views a shared entry, log an immutable audit trail
  const handleSelectEntry = async (entry: JournalEntry) => {
    setSelectedEntry(entry);
    setAuditLogStatus('Logging access in admin_audit_logs...');

    try {
      await logAdminEntryView({
        adminUid: user.uid,
        viewedUserId: entry.userId,
        entryId: entry.id,
        entryTitle: entry.title,
        timestamp: Date.now(),
      });
      setAuditLogStatus('Audit access recorded');
      setTimeout(() => setAuditLogStatus(null), 2500);
    } catch (err) {
      console.error('Audit log failed:', err);
      setAuditLogStatus('Audit log recording failed');
    }
  };

  const getAnonymizedLabel = (entry: JournalEntry) => {
    if (entry.shareFullIdentity && entry.authorInitial) {
      return `User (${entry.authorInitial})`;
    }
    if (entry.userId) {
      // Derive a consistent anonymous client code: e.g. "Client #A8F"
      const hash = entry.userId.slice(-4).toUpperCase();
      return `Client #${hash}`;
    }
    return 'Anonymous Client';
  };

  const filteredEntries = sharedEntries.filter((entry) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      entry.title.toLowerCase().includes(query) ||
      (entry.messages && entry.messages.some((m) => m.content.toLowerCase().includes(query))) ||
      (entry.location?.placeName && entry.location.placeName.toLowerCase().includes(query))
    );
  });

  return (
    <main className="flex-1 flex flex-col bg-stone-100 overflow-hidden">
      {/* Top Banner: Coach / Admin Scope Notice */}
      <div className="border-b border-indigo-200/80 bg-indigo-50/90 px-4 py-2.5 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-700 shrink-0" />
            <span className="text-xs font-semibold text-indigo-900">
              Coach Review Workspace (Role-Based Access Control)
            </span>
            <span className="hidden md:inline-flex items-center rounded-full bg-indigo-200/70 px-2 py-0.5 text-[10px] font-medium text-indigo-800">
              admin: true verified
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-indigo-800/80 text-[11px] hidden sm:inline">
              Only entries explicitly marked <strong className="font-semibold text-indigo-950">"Share with Coach"</strong> are visible here.
            </span>
            <button
              onClick={onNavigateHome}
              className="flex items-center gap-1 rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-800 shadow-2xs hover:bg-indigo-50 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Back to Journal</span>
            </button>
          </div>
        </div>
      </div>

      {accessError ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-xl w-full rounded-2xl border border-red-200 bg-white p-6 text-center shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
              <Lock className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-stone-900">Access Restricted</h3>
            <p className="mt-1.5 text-xs text-stone-600 leading-relaxed font-mono bg-red-50 p-2 rounded-lg border border-red-100 text-left overflow-x-auto break-all">
              {accessError}
            </p>
            {firestoreErrorCode && (
              <p className="mt-1.5 text-[11px] text-red-500 font-mono text-left">
                Firestore Error Code: {firestoreErrorCode}
              </p>
            )}

            {/* Diagnostic Token Claims Display */}
            <div className="mt-3 text-left rounded-lg bg-stone-50 border border-stone-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-700">Decoded Token Claims</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  decodedClaims?.admin ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  admin claim: {decodedClaims?.admin ? 'true (Present)' : 'missing / false'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDiagnostics((prev) => !prev)}
                className="mt-1 text-[11px] text-indigo-600 hover:underline cursor-pointer"
              >
                {showDiagnostics ? 'Hide raw claims JSON' : 'Show raw claims JSON'}
              </button>
              {showDiagnostics && (
                <pre className="mt-2 text-[10px] text-stone-600 bg-white p-2 rounded border border-stone-200 overflow-x-auto max-h-36 font-mono">
                  {decodedClaims ? JSON.stringify(decodedClaims, null, 2) : 'No token claims received yet'}
                </pre>
              )}
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                id="refresh-admin-token-btn"
                onClick={handleForceRefreshAndRetry}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-900 shadow-2xs hover:bg-indigo-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Refreshing Token...' : 'Refresh Token & Retry'}</span>
              </button>
              <button
                onClick={onNavigateHome}
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-medium text-white shadow-2xs hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Return to My Journal
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden max-w-7xl mx-auto w-full p-3 sm:p-5 gap-4">
          {/* Left Column: Shared Entries Directory */}
          <div className="w-full md:w-80 lg:w-96 flex flex-col rounded-2xl border border-stone-200/80 bg-white shadow-xs overflow-hidden">
            <div className="p-3.5 border-b border-stone-200/70 bg-stone-50/50">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-indigo-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800">
                    Shared Entries ({filteredEntries.length})
                  </h3>
                </div>
                {auditLogStatus && (
                  <span className="text-[10px] text-indigo-600 animate-pulse font-medium">
                    {auditLogStatus}
                  </span>
                )}
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400" />
                <input
                  id="coach-search-input"
                  type="text"
                  placeholder="Filter shared reflections..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white pl-8 pr-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Entries List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center p-8 text-stone-400 gap-2">
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  <p className="text-xs">Loading shared client reflections...</p>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="p-6 text-center text-stone-500">
                  <p className="text-xs font-semibold text-stone-700">No shared reflections found</p>
                  <p className="text-[11px] text-stone-400 mt-1">
                    Users can toggle "Share with Coach" on any entry they wish to discuss.
                  </p>
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const isSelected = selectedEntry?.id === entry.id;
                  const anonymizedUser = getAnonymizedLabel(entry);
                  const msgCount = entry.messages ? entry.messages.length : 0;

                  return (
                    <div
                      key={entry.id}
                      id={`coach-entry-item-${entry.id}`}
                      onClick={() => handleSelectEntry(entry)}
                      className={`group rounded-xl p-3 text-left transition-all cursor-pointer border ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/50 shadow-2xs'
                          : 'border-stone-200/70 hover:border-stone-300 hover:bg-stone-50/80 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded">
                          <UserCheck className="h-2.5 w-2.5" />
                          {anonymizedUser}
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {new Date(entry.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>

                      <h4 className="text-xs font-semibold text-stone-900 truncate">
                        {entry.title || 'Untitled Reflection'}
                      </h4>

                      {entry.messages && entry.messages.length > 0 && (
                        <p className="text-[11px] text-stone-500 line-clamp-2 mt-1 leading-relaxed">
                          {entry.messages[entry.messages.length - 1].content}
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-stone-100 text-[10px] text-stone-400">
                        <span className="capitalize font-medium text-stone-600">{entry.mode}</span>
                        <div className="flex items-center gap-2">
                          {entry.location && (
                            <span className="flex items-center gap-0.5 text-rose-700">
                              <MapPin className="h-2.5 w-2.5" />
                              Tagged
                            </span>
                          )}
                          <span>{msgCount} {msgCount === 1 ? 'msg' : 'msgs'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Detailed Read-Only Viewer */}
          <div className="flex-1 flex flex-col rounded-2xl border border-stone-200/80 bg-white shadow-xs overflow-hidden">
            {selectedEntry ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Viewer Header */}
                <div className="border-b border-stone-200 p-4 sm:px-6 flex items-start justify-between gap-3 bg-stone-50/50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                        <UserCheck className="h-3 w-3" />
                        {getAnonymizedLabel(selectedEntry)}
                      </span>
                      <span className="text-xs text-stone-400 font-mono">
                        (Anonymized Client ID)
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-stone-900 truncate">
                      {selectedEntry.title}
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-stone-400 mt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{new Date(selectedEntry.createdAt).toLocaleString()}</span>
                      <span>•</span>
                      <span className="capitalize font-medium text-stone-600">
                        Mode: {selectedEntry.mode}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-stone-500 bg-stone-100 px-2 py-1 rounded border border-stone-200">
                      <Eye className="h-3 w-3 text-stone-400" />
                      Read-Only View
                    </span>
                  </div>
                </div>

                {/* Viewer Content Stream */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  {/* Location Preview if tagged */}
                  {selectedEntry.location && (
                    <LocationPreview location={selectedEntry.location} variant="editor" />
                  )}

                  {/* AI Summary Highlight */}
                  {selectedEntry.summary && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                      <div className="flex items-center gap-2 text-amber-900 font-serif font-semibold text-sm mb-1.5">
                        <Sparkles className="h-4 w-4 text-amber-700" />
                        AI Summary & Takeaways
                      </div>
                      <div className="text-xs text-amber-950 prose prose-stone max-w-none leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {selectedEntry.summary}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* Messages Conversation Stream */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Conversation History ({selectedEntry.messages?.length || 0})
                    </h4>

                    {selectedEntry.messages && selectedEntry.messages.length > 0 ? (
                      selectedEntry.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`rounded-xl p-3.5 text-xs ${
                            msg.role === 'user'
                              ? 'bg-stone-100 border border-stone-200/80 text-stone-900 ml-4'
                              : 'bg-indigo-50/70 border border-indigo-100 text-stone-900 mr-4'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="font-semibold capitalize text-stone-700 text-[11px]">
                              {msg.role === 'user' ? 'Client Reflection' : 'AI Companion Response'}
                            </span>
                            <span className="text-[10px] text-stone-400">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="prose prose-stone text-xs max-w-none leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-stone-400 italic">No messages in this reflection entry.</p>
                    )}
                  </div>
                </div>

                {/* Audit Trail Guarantee Notice */}
                <div className="border-t border-stone-200 bg-stone-50 px-4 py-2.5 text-[11px] text-stone-500 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Access to this document is recorded in <code className="text-[10px] font-mono bg-stone-200/70 px-1 py-0.5 rounded">admin_audit_logs</code>
                  </span>
                  <span className="text-stone-400">Confidential Client Record</span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-stone-400">
                <Eye className="h-10 w-10 stroke-1 text-stone-300 mb-2" />
                <p className="text-sm font-medium text-stone-600">No Reflection Selected</p>
                <p className="text-xs text-stone-400 max-w-xs mt-1">
                  Choose a shared entry from the list on the left to inspect the client reflection and location details.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
};
