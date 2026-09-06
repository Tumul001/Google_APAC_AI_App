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
import { forceRefreshToken } from '../lib/firebase';
import {
  subscribeToSharedCoachEntries,
  logAdminEntryView,
} from '../lib/firestore';
import { LocationPreview } from './LocationPreview';
import { btnPrimary, btnSecondary, card, chip, field, sectionLabel } from '../lib/ui';
import { debug } from '../lib/debug';
import { formatFullDate, formatListDate, formatTime } from '../lib/datetime';
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
        const result = await forceRefreshToken();
        debug('[Admin] claims before access check', { isAdmin: result.isAdmin });
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
      const result = await forceRefreshToken();
      debug('[Admin] manual refresh', { isAdmin: result.isAdmin });
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
      // Derive a consistent anonymous client code: e.g."Client #A8F"
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
    <main id="main-content" className="flex-1 flex flex-col bg-subtle/70 overflow-hidden">
      {/* Top Banner: Coach / Admin Scope Notice */}
      <div className="border-b border-line bg-canvas px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-ink-body shrink-0" />
            <h1 className="text-ui font-semibold text-ink">Coach review workspace</h1>
            <span className="hidden md:block">
              <span className={`${chip} font-mono`} translate="no">
                admin: true
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3 text-meta">
            <span className="hidden text-meta text-ink-muted sm:inline">
              Only entries a user marked <strong className="font-semibold text-ink-body">&ldquo;Share with coach&rdquo;</strong> appear here.
            </span>
            <button
              onClick={onNavigateHome}
              className={btnSecondary}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Back to journal</span>
            </button>
          </div>
        </div>
      </div>

      {accessError ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-xl w-full rounded-2xl border border-line bg-surface p-6 text-center shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-ink-secondary mb-3 border border-line">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="text-body font-semibold text-ink">
              Access <em className="font-serif font-normal italic">restricted</em>
            </h2>
            <p className="mt-1.5 overflow-x-auto break-all rounded-lg border border-line bg-canvas p-2.5 text-left font-mono text-meta text-ink-secondary">
              {accessError}
            </p>
            {firestoreErrorCode && (
              <p className="mt-1.5 text-left font-mono text-meta text-red-700">
                Firestore Error Code: {firestoreErrorCode}
              </p>
            )}

            {/* Diagnostic Token Claims Display */}
            <div className="mt-3 text-left rounded-xl bg-canvas border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-meta font-semibold text-ink-body">Your sign-in claims</span>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-meta font-semibold ${
                  decodedClaims?.admin ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                  admin claim: {decodedClaims?.admin ? 'true (Present)' : 'missing / false'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDiagnostics((prev) => !prev)}
                className="mt-1 cursor-pointer text-meta text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {showDiagnostics ? 'Hide raw claims JSON' : 'Show raw claims JSON'}
              </button>
              {showDiagnostics && (
                <pre className="mt-2 max-h-36 overflow-x-auto rounded-lg border border-line bg-surface p-2 font-mono text-meta text-ink-secondary">
                  {decodedClaims ? JSON.stringify(decodedClaims, null, 2) : 'No token claims received yet'}
                </pre>
              )}
            </div>

            <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                id="refresh-admin-token-btn"
                onClick={handleForceRefreshAndRetry}
                disabled={isRefreshing}
                className={btnSecondary}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-ink-soft motion-reduce:animate-none' : ''}`}
                  aria-hidden="true"
                />
                <span>{isRefreshing ? 'Refreshing token…' : 'Refresh token & retry'}</span>
              </button>
              <button
                onClick={onNavigateHome}
                className={btnPrimary}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Return to my journal
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden max-w-7xl mx-auto w-full p-3 sm:p-5 gap-4">
          {/* Left Column: Shared Entries Directory */}
          <div className={`${card} flex w-full flex-col overflow-hidden md:w-80 lg:w-96`}>
            <div className="p-3.5 border-b border-line/70 bg-canvas/50">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-ink-secondary" />
                  <h3 className={sectionLabel}>Shared entries ({filteredEntries.length})</h3>
                </div>
                {auditLogStatus && (
                  <span role="status" aria-live="polite" className="text-meta font-medium text-emerald-700">
                    {auditLogStatus}
                  </span>
                )}
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-faint" />
                <input
                  id="coach-search-input"
                  type="text"
                  placeholder="Filter shared reflections…"
                  aria-label="Filter shared reflections"
                  autoComplete="off"
                  spellCheck={false}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`${field} pl-9`}
                />
              </div>
            </div>

            {/* Entries List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center p-8 text-ink-faint gap-2">
                  <RefreshCw className="h-5 w-5 animate-spin text-ink-faint motion-reduce:animate-none" aria-hidden="true" />
                  <p className="text-meta">Loading shared reflections…</p>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="p-6 text-center text-ink-muted">
                  <p className="text-ui font-semibold text-ink-secondary">Nothing shared with you yet</p>
                  <p className="mt-1 text-meta text-ink-muted">
                    An entry appears here once its writer turns on &ldquo;Share with coach&rdquo; for it.
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
                      className={`group relative rounded-xl border p-3 text-left transition-[background-color,border-color] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink motion-reduce:transition-none ${
                        isSelected
                          ? 'border-inverse/40 bg-subtle/90 shadow-2xs'
                          : 'border-line/70 hover:border-line-strong hover:bg-canvas/80 bg-surface'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={chip}>
                          <UserCheck className="h-2.5 w-2.5 text-ink-soft" aria-hidden="true" />
                          {anonymizedUser}
                        </span>
                        <span className="text-meta text-ink-muted">
                          {formatListDate(entry.updatedAt)}
                        </span>
                      </div>

                      <h4 className="min-w-0 truncate text-ui font-semibold text-ink">
                        <button
                          type="button"
                          onClick={() => handleSelectEntry(entry)}
                          aria-current={isSelected ? 'true' : undefined}
                          className="block max-w-full cursor-pointer truncate text-left after:absolute after:inset-0 after:rounded-xl after:content-[''] focus:outline-none"
                        >
                          {entry.title || 'Untitled reflection'}
                        </button>
                      </h4>

                      {entry.messages && entry.messages.length > 0 && (
                        <p className="mt-1 line-clamp-2 text-meta text-ink-muted">
                          {entry.messages[entry.messages.length - 1].content}
                        </p>
                      )}

                      <div className="mt-2 flex items-center justify-between border-t border-line-subtle pt-1.5 text-meta text-ink-muted">
                        <span className="font-medium capitalize text-ink-soft">
                          {entry.mode.replace('_', ' ')}
                        </span>
                        <div className="flex items-center gap-2">
                          {entry.location && (
                            <span className="flex items-center gap-0.5 text-ink-soft">
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
          <div className={`${card} flex flex-1 flex-col overflow-hidden`}>
            {selectedEntry ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Viewer Header */}
                <div className="border-b border-line p-4 sm:px-6 flex items-start justify-between gap-3 bg-canvas/50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={chip} title="Identity is withheld unless the writer shares it">
                        <UserCheck className="h-3 w-3 text-ink-soft" aria-hidden="true" />
                        {getAnonymizedLabel(selectedEntry)}
                      </span>
                    </div>
                    <h2 className="text-title sm:text-xl font-semibold text-ink truncate font-serif tracking-tight">
                      {selectedEntry.title}
                    </h2>
                    <div className="mt-1 flex items-center gap-2 text-meta text-ink-muted">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatFullDate(selectedEntry.createdAt)}</span>
                      <span>•</span>
                      <span className="font-medium capitalize text-ink-soft">
                        {selectedEntry.mode.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className={chip}>
                      <Eye className="h-3 w-3 text-ink-muted" aria-hidden="true" />
                      Read only
                    </span>
                  </div>
                </div>

                {/* Viewer Content Stream */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-[62ch] space-y-4">
                  {/* Location Preview if tagged */}
                  {selectedEntry.location && (
                    <LocationPreview location={selectedEntry.location} variant="editor" />
                  )}

                  {/* AI Summary Highlight */}
                  {selectedEntry.summary && (
                    <div className="rounded-xl border border-line bg-canvas/70 p-4">
                      <div className="flex items-center gap-2 text-ink font-serif font-semibold text-ui mb-1.5">
                        <Sparkles className="h-4 w-4 text-amber-600" />
                        AI Summary & Takeaways
                      </div>
                      <div className="markdown-body max-w-none text-ui text-ink-secondary">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {selectedEntry.summary}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* Messages Conversation Stream */}
                  <div className="space-y-3">
                    <h4 className={sectionLabel}>
                      Conversation ({selectedEntry.messages?.length || 0})
                    </h4>

                    {selectedEntry.messages && selectedEntry.messages.length > 0 ? (
                      selectedEntry.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`rounded-xl p-3.5 text-ui ${
                            msg.role === 'user'
                              ? 'ml-4 border border-line/80 bg-subtle text-ink'
                              : 'mr-4 border border-line bg-canvas text-ink-body'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-meta font-semibold capitalize text-ink-body">
                              {msg.role === 'user' ? 'Client' : 'Gemini'}
                            </span>
                            <span className="text-meta tabular-nums text-ink-muted">
                              {formatTime(msg.timestamp)}
                            </span>
                          </div>
                          <div className="markdown-body max-w-none text-ui">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-meta text-ink-faint italic">No messages in this reflection entry.</p>
                    )}
                  </div>
                </div>

                </div>

                {/* Audit Trail Guarantee Notice */}
                <div className="flex items-center justify-between border-t border-line bg-canvas px-4 py-2.5 text-meta text-ink-muted">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Every time a coach opens an entry it is recorded in <code className="rounded bg-muted-surface/70 px-1 py-0.5 font-mono text-meta" translate="no">admin_audit_logs</code>
                  </span>
                  <span className="text-ink-faint">Shared in confidence</span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-ink-faint">
                <Eye className="h-10 w-10 stroke-1 text-ink-ghost mb-2" />
                <p className="text-ui font-medium text-ink-soft font-serif">No Reflection Selected</p>
                <p className="mt-1 max-w-xs text-meta text-ink-muted">
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
