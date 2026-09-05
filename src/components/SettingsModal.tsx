import React, { useState, useEffect } from 'react';
import {
  X,
  Bell,
  Check,
  ShieldCheck,
  Send,
  AlertCircle,
  Copy,
  CheckCheck,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import type { NotificationSettings, JournalMode, UserProfile } from '../types';
import {
  getUserNotificationSettings,
  saveUserNotificationSettings,
  testSlackWebhook,
} from '../lib/firebase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onSettingsSaved?: (newSettings: NotificationSettings) => void;
}

const AVAILABLE_MODES: { id: JournalMode; label: string; icon: string; description: string }[] = [
  {
    id: 'gratitude',
    label: 'Gratitude',
    icon: '🌿',
    description: 'Entries focused on daily appreciation and positive reflection.',
  },
  {
    id: 'deep_thinking',
    label: 'Deep Thinking',
    icon: '🧠',
    description: 'In-depth philosophical inquiries and complex contemplation.',
  },
  {
    id: 'brainstorm',
    label: 'Brainstorming',
    icon: '💡',
    description: 'Creative ideation sessions, problem-solving, and plans.',
  },
  {
    id: 'reflection',
    label: 'Daily Reflection',
    icon: '🪞',
    description: 'Standard day-to-day mindfulness and open reflections.',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onSettingsSaved,
}) => {
  const [settings, setSettings] = useState<NotificationSettings>({
    slackEnabled: false,
    slackTriggerModes: ['gratitude', 'deep_thinking'],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [serverHasSlackSecret, setServerHasSlackSecret] = useState<boolean | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Fetch current user notification settings & health status
  useEffect(() => {
    if (!isOpen || !user.uid) return;

    let isMounted = true;
    setIsLoading(true);
    setTestResult(null);
    setSaveSuccess(false);

    // 1. Fetch user preferences from Firestore
    getUserNotificationSettings(user.uid)
      .then((data) => {
        if (isMounted) {
          setSettings(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoading(false);
      });

    // 2. Fetch server health to verify Secret Manager secret presence
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && typeof data.hasSlackWebhook === 'boolean') {
          setServerHasSlackSecret(data.hasSlackWebhook);
        }
      })
      .catch((err) => console.warn('Could not query /api/health:', err));

    return () => {
      isMounted = false;
    };
  }, [isOpen, user.uid]);

  if (!isOpen) return null;

  const handleToggleMode = (mode: JournalMode) => {
    setSettings((prev) => {
      const exists = prev.slackTriggerModes.includes(mode);
      const updated = exists
        ? prev.slackTriggerModes.filter((m) => m !== mode)
        : [...prev.slackTriggerModes, mode];
      return {
        ...prev,
        slackTriggerModes: updated,
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await saveUserNotificationSettings(user.uid, settings);
      setSaveSuccess(true);
      window.dispatchEvent(new CustomEvent('notification-settings-updated', { detail: settings }));
      if (onSettingsSaved) {
        onSettingsSaved(settings);
      }
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTestingWebhook(true);
    setTestResult(null);
    try {
      const res = await testSlackWebhook();
      if (res.success) {
        setTestResult({
          success: true,
          message: res.message || 'Test message received in your Slack channel!',
        });
        setServerHasSlackSecret(true);
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Failed to dispatch test notification.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Error communicating with backend test route.',
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const copyToClipboard = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-stone-200 bg-white shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/70 px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 text-white shadow-xs">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-stone-900 font-serif tracking-tight">Notification & Integration Settings</h2>
              <p className="text-xs text-stone-500 font-sans">Configure opt-in triggers and external notifications</p>
            </div>
          </div>
          <button
            id="close-settings-modal-btn"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-stone-500 space-y-3">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
              <p className="text-xs font-sans">Loading preferences...</p>
            </div>
          ) : (
            <>
              {/* Slack Webhook Section */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-2xs space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700 border border-stone-200 mt-0.5">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-stone-900 font-sans">Slack Webhook Notifications</h3>
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200 font-mono">
                          Opt-in Only
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-stone-600 leading-relaxed font-sans">
                        Trigger an incoming notification to your team's Slack channel whenever a journal entry matching selected modes is successfully saved.
                      </p>
                    </div>
                  </div>

                  {/* Master Toggle */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      id="slack-notifications-toggle"
                      type="checkbox"
                      checked={settings.slackEnabled}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, slackEnabled: e.target.checked }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-stone-900"></div>
                  </label>
                </div>

                {/* Privacy & Sanitization Callout */}
                <div className="flex items-start gap-2.5 rounded-xl bg-stone-50 border border-stone-200/80 p-3 text-xs text-stone-700">
                  <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                  <p className="leading-relaxed font-sans">
                    <strong className="font-semibold text-stone-900">Zero Private Content Leakage:</strong> Per security directives, notifications transmit only the entry title and a sanitized excerpt (~200 characters max, Slack markdown-escaped). Full private reflections and multi-turn threads are never transmitted.
                  </p>
                </div>

                {/* Trigger Modes Selector (Enabled state) */}
                {settings.slackEnabled && (
                  <div className="pt-2 border-t border-stone-100 space-y-3">
                    <div>
                      <h4 className="text-xs font-semibold text-stone-800 font-sans">Trigger Modes</h4>
                      <p className="text-[11px] text-stone-500 font-sans">
                        Select which entry types dispatch a Slack alert upon saving:
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {AVAILABLE_MODES.map((mode) => {
                        const isChecked = settings.slackTriggerModes.includes(mode.id);
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => handleToggleMode(mode.id)}
                            className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              isChecked
                                ? 'border-stone-900 bg-stone-50/80 ring-1 ring-stone-900/10'
                                : 'border-stone-200 bg-white hover:border-stone-300'
                            }`}
                          >
                            <div className="text-lg shrink-0 mt-0.5">{mode.icon}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-stone-900 font-sans">{mode.label}</span>
                                <div
                                  className={`h-4 w-4 rounded flex items-center justify-center border transition-colors ${
                                    isChecked
                                      ? 'bg-stone-900 border-stone-900 text-white'
                                      : 'border-stone-300 bg-white'
                                  }`}
                                >
                                  {isChecked && <Check className="h-3 w-3" />}
                                </div>
                              </div>
                              <p className="mt-0.5 text-[11px] text-stone-500 line-clamp-2 font-sans">
                                {mode.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {settings.slackTriggerModes.length === 0 && (
                      <p className="text-[11px] text-amber-600 flex items-center gap-1.5 pt-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Please select at least one trigger mode to receive notifications.
                      </p>
                    )}
                  </div>
                )}

                {/* Server Webhook Status & Secret Manager Connectivity */}
                <div className="pt-2 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-sans">
                    <span className="text-xs text-stone-600 font-medium">Server Secret Status:</span>
                    {serverHasSlackSecret === true ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        SLACK_WEBHOOK_URL Configured
                      </span>
                    ) : serverHasSlackSecret === false ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                        Pending in Secret Manager
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">Checking...</span>
                    )}
                  </div>

                  <button
                    id="test-slack-webhook-btn"
                    type="button"
                    onClick={handleTestNotification}
                    disabled={isTestingWebhook}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-2xs hover:bg-stone-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Send className={`h-3 w-3 ${isTestingWebhook ? 'animate-pulse text-stone-600' : 'text-stone-500'}`} />
                    <span>{isTestingWebhook ? 'Sending Ping...' : 'Test Slack Ping'}</span>
                  </button>
                </div>

                {/* Test Result Message */}
                {testResult && (
                  <div
                    className={`rounded-lg p-3 text-xs flex items-start gap-2 ${
                      testResult.success
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                        : 'bg-red-50 border border-red-200 text-red-900'
                    }`}
                  >
                    {testResult.success ? (
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-relaxed">{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* Secret Manager Guide Accordion */}
              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-stone-800 flex items-center gap-1.5 font-sans">
                    <span>Google Cloud Secret Manager Setup</span>
                    <span className="text-[10px] text-stone-500 font-normal font-mono">(Matching GEMINI_API_KEY pattern)</span>
                  </h4>
                  <a
                    href="https://api.slack.com/messaging/webhooks"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-900 hover:underline"
                  >
                    <span>Slack Webhook Docs</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <p className="text-[11px] text-stone-600 leading-relaxed font-sans">
                  To securely configure your incoming webhook without exposing it to client bundles, register <code className="font-mono bg-white px-1 py-0.5 rounded border border-stone-200 text-stone-800">SLACK_WEBHOOK_URL</code> in Google Cloud Secret Manager:
                </p>

                {/* Bash Snippet 1 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-stone-500 font-mono">
                    <span>1. Create secret container & add version:</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          'gcloud secrets create SLACK_WEBHOOK_URL --replication-policy="automatic"\necho -n "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" | gcloud secrets versions add SLACK_WEBHOOK_URL --data-file=-',
                          'c1'
                        )
                      }
                      className="inline-flex items-center gap-1 text-stone-600 hover:text-stone-900 cursor-pointer"
                    >
                      {copiedCmd === 'c1' ? <CheckCheck className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedCmd === 'c1' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-lg bg-stone-900 text-stone-200 text-[10.5px] font-mono overflow-x-auto leading-relaxed">
{`gcloud secrets create SLACK_WEBHOOK_URL --replication-policy="automatic"
echo -n "YOUR_SLACK_WEBHOOK_URL" | gcloud secrets versions add SLACK_WEBHOOK_URL --data-file=-`}
                  </pre>
                </div>

                {/* Bash Snippet 2 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-stone-500 font-mono">
                    <span>2. Grant Cloud Run Service Account read permission:</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          'PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")\ngcloud secrets add-iam-policy-binding SLACK_WEBHOOK_URL \\\n  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \\\n  --role="roles/secretmanager.secretAccessor"',
                          'c2'
                        )
                      }
                      className="inline-flex items-center gap-1 text-stone-600 hover:text-stone-900 cursor-pointer"
                    >
                      {copiedCmd === 'c2' ? <CheckCheck className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedCmd === 'c2' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-lg bg-stone-900 text-stone-200 text-[10.5px] font-mono overflow-x-auto leading-relaxed">
{`PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding SLACK_WEBHOOK_URL \\
  --member="serviceAccount:\${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \\
  --role="roles/secretmanager.secretAccessor"`}
                  </pre>
                </div>

                {/* Bash Snippet 3 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-stone-500 font-mono">
                    <span>3. Bind secret to Cloud Run deploy:</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          'gcloud run services update gemini-reflections \\\n  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,SLACK_WEBHOOK_URL=SLACK_WEBHOOK_URL:latest"',
                          'c3'
                        )
                      }
                      className="inline-flex items-center gap-1 text-stone-600 hover:text-stone-900 cursor-pointer"
                    >
                      {copiedCmd === 'c3' ? <CheckCheck className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedCmd === 'c3' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-lg bg-stone-900 text-stone-200 text-[10.5px] font-mono overflow-x-auto leading-relaxed">
{`gcloud run services update gemini-reflections \\
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,SLACK_WEBHOOK_URL=SLACK_WEBHOOK_URL:latest"`}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-stone-200 bg-stone-50 px-6 py-4">
          <div className="flex items-center">
            {saveSuccess && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 animate-in fade-in">
                <Check className="h-4 w-4 text-emerald-600" />
                Notification preferences saved to Firestore!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              id="cancel-settings-btn"
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs font-medium text-stone-700 shadow-2xs hover:bg-stone-50 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              id="save-settings-btn"
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-medium text-white shadow-2xs hover:bg-stone-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Preferences</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
