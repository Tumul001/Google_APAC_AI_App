import React, { useState, useEffect } from 'react';
import {
  Bell,
  Check,
  ShieldCheck,
  Send,
  AlertCircle,
  Copy,
  CheckCheck,
  Sliders,
  ExternalLink,
  Heart,
  Sparkles,
  Lightbulb,
  MessageSquare,
} from 'lucide-react';
import type { NotificationSettings, JournalMode, UserProfile } from '../types';
import { Modal } from './Modal';
import { btnPrimary, btnSecondary, card, cardQuiet, field, sectionLabel } from '../lib/ui';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getUserNotificationSettings,
  saveUserNotificationSettings,
  testSlackWebhook,
} from '../lib/firestore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onSettingsSaved?: (newSettings: NotificationSettings) => void;
}

const AVAILABLE_MODES: {
  id: JournalMode;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    id: 'gratitude',
    label: 'Gratitude',
    Icon: Heart,
    description: 'Noticing what went right, and who was behind it.',
  },
  {
    id: 'deep_thinking',
    label: 'Deep Thinking',
    Icon: Sparkles,
    description: 'Testing an assumption, or arguing the other side.',
  },
  {
    id: 'brainstorm',
    label: 'Brainstorming',
    Icon: Lightbulb,
    description: 'Working a problem until there are real options.',
  },
  {
    id: 'reflection',
    label: 'Daily Reflection',
    Icon: MessageSquare,
    description: 'Whatever today left you with.',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onSettingsSaved,
}) => {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
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

  const digestWebhook = settings.digestWebhookUrl?.trim() || '';
  const digestWebhookLooksValid =
    digestWebhook.startsWith('https://hooks.slack.com/services/') && digestWebhook.length > 40;
  // Enabling the digest without a destination would silently do nothing every
  // Sunday, so the save is blocked until there is one.
  const digestBlocked = settings.weeklyDigestEnabled && !digestWebhookLooksValid;

  const handleSave = async () => {
    if (digestBlocked) return;
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      labelId="settings-modal-title"
      icon={<Sliders className="h-[18px] w-[18px]" aria-hidden="true" />}
      title={
        <>
          Notifications &amp; <em className="font-serif font-normal italic">integrations</em>
        </>
      }
      subtitle="Choose which entries reach Slack. Off by default."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span aria-live="polite" className="min-w-0 text-ui">
            {saveSuccess && (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Preferences saved
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2.5">
            <button id="cancel-settings-btn" type="button" onClick={onClose} className={btnSecondary}>
              Close
            </button>
            <button
              id="save-settings-btn"
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading || digestBlocked}
              className={btnPrimary}
            >
              {isSaving ? (
                <>
                  <span
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Save preferences</span>
                </>
              )}
            </button>
          </span>
        </div>
      }
    >
      <div className="space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-ink-muted space-y-3">
              <div
                className="h-7 w-7 animate-spin rounded-full border-2 border-ink-body border-t-transparent motion-reduce:animate-none motion-reduce:border-t-stone-300"
                aria-hidden="true"
              />
              <p className="text-meta">Loading preferences…</p>
            </div>
          ) : (
            <>
              {/* Slack Webhook Section */}
              <div className={`${card} space-y-5 p-5`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink-secondary border border-line mt-0.5">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-ui font-semibold text-ink">Post to Slack when you save</h3>
                        <span className="inline-flex items-center rounded-md border border-line bg-subtle px-2 py-0.5 font-mono text-meta font-semibold text-ink-secondary">
                          Off by default
                        </span>
                      </div>
                      <p className="mt-1 max-w-[62ch] text-ui text-ink-soft">
                        Post a note to your Slack channel when you save an entry in one of the modes you pick below.
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
                    <div className="peer h-6 w-11 rounded-full bg-muted-surface after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-line-strong after:bg-surface after:transition-transform after:duration-150 after:content-[''] peer-checked:bg-inverse peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink motion-reduce:after:transition-none"></div>
                  </label>
                </div>

                {/* Privacy & Sanitization Callout */}
                <div className="flex items-start gap-2.5 rounded-xl bg-canvas border border-line/80 p-3 text-meta text-ink-secondary">
                  <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                  <p className="max-w-[62ch] text-ui">
                    <strong className="font-semibold text-ink">What Slack receives:</strong> the entry title and about 200 characters of it, with Slack formatting escaped. The rest of the entry, and every reply in the thread, stays here.
                  </p>
                </div>

                {/* Trigger Modes Selector (Enabled state) */}
                {settings.slackEnabled && (
                  <div className="pt-2 border-t border-line-subtle space-y-3">
                    <div>
                      <h4 className={sectionLabel}>Trigger modes</h4>
                      <p className="text-ui text-ink-muted">
                        Which modes should post to Slack:
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {AVAILABLE_MODES.map(({ Icon, ...mode }) => {
                        const isChecked = settings.slackTriggerModes.includes(mode.id);
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => handleToggleMode(mode.id)}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none ${
                              isChecked
                                ? 'border-inverse bg-canvas/80 ring-1 ring-ink/10'
                                : 'border-line bg-surface hover:border-line-strong'
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                isChecked ? 'bg-inverse text-on-inverse' : 'bg-subtle text-ink-soft'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-meta font-semibold text-ink">{mode.label}</span>
                                <div
                                  className={`h-4 w-4 rounded flex items-center justify-center border transition-colors ${
                                    isChecked
                                      ? 'bg-inverse border-inverse text-surface'
                                      : 'border-line-strong bg-surface'
                                  }`}
                                >
                                  {isChecked && <Check className="h-3 w-3" />}
                                </div>
                              </div>
                              <p className="mt-0.5 text-ui text-ink-muted line-clamp-2">
                                {mode.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {settings.slackTriggerModes.length === 0 && (
                      <p className="text-meta text-amber-600 flex items-center gap-1.5 pt-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Please select at least one trigger mode to receive notifications.
                      </p>
                    )}
                  </div>
                )}

                {/* Server Webhook Status & Secret Manager Connectivity */}
                <div className="pt-2 border-t border-line-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-meta text-ink-soft font-medium">Webhook configured on the server:</span>
                    {serverHasSlackSecret === true ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-meta font-semibold text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        SLACK_WEBHOOK_URL Configured
                      </span>
                    ) : serverHasSlackSecret === false ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-meta font-semibold text-amber-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                        Pending in Secret Manager
                      </span>
                    ) : (
                      <span className="text-meta text-ink-faint">Checking...</span>
                    )}
                  </div>

                  <button
                    id="test-slack-webhook-btn"
                    type="button"
                    onClick={handleTestNotification}
                    disabled={isTestingWebhook}
                    className={btnSecondary}
                  >
                    <Send
                      className={`h-3.5 w-3.5 ${isTestingWebhook ? 'animate-pulse text-ink-soft motion-reduce:animate-none' : 'text-ink-muted'}`}
                      aria-hidden="true"
                    />
                    <span>{isTestingWebhook ? 'Sending ping…' : 'Send test ping'}</span>
                  </button>
                </div>

                {/* Test Result Message */}
                {testResult && (
                  <div
                    className={`rounded-lg p-3 text-meta flex items-start gap-2 ${
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
                    <span className="">{testResult.message}</span>
                  </div>
                )}

                {/* Mood tracking. Its own consent because it is the only
                    feature that sends entry text to Gemini without the person
                    choosing to send it. The copy says so plainly. */}
                <div className="space-y-4 border-t border-line-subtle pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-ui font-semibold text-ink">Mood tracking</h3>
                      <p className="mt-1 max-w-[62ch] text-ui text-ink-soft">
                        Scores the tone of each entry you save so Mood Flow can chart how a week
                        felt. Your entry text is sent to Gemini when you save it, which does not
                        otherwise happen unless you write to it directly.
                      </p>
                    </div>

                    <label className="relative mt-1 inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        id="mood-tracking-toggle"
                        type="checkbox"
                        checked={settings.moodTrackingEnabled}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, moodTrackingEnabled: e.target.checked }))
                        }
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-muted-surface after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-line-strong after:bg-surface after:transition-transform after:duration-150 after:content-[''] peer-checked:bg-inverse peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink motion-reduce:after:transition-none"></div>
                    </label>
                  </div>
                </div>

                {/* Weekly digest. Shares this card because it is the same
                    channel and the same consent, but it has its own
                    destination: a digest describes a week of private
                    journalling and must never reach the shared team webhook. */}
                <div className="space-y-4 border-t border-line-subtle pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-ui font-semibold text-ink">Weekly digest</h3>
                      <p className="mt-1 max-w-[62ch] text-ui text-ink-soft">
                        Every Sunday evening, Gemini reads the week you wrote and sends you one
                        short summary of what came up.
                      </p>
                    </div>

                    <label className="relative mt-1 inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        id="weekly-digest-toggle"
                        type="checkbox"
                        checked={settings.weeklyDigestEnabled}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, weeklyDigestEnabled: e.target.checked }))
                        }
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-muted-surface after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-line-strong after:bg-surface after:transition-transform after:duration-150 after:content-[''] peer-checked:bg-inverse peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink motion-reduce:after:transition-none"></div>
                    </label>
                  </div>

                  {settings.weeklyDigestEnabled && (
                    <div className="space-y-2">
                      <label
                        htmlFor="digest-webhook-input"
                        className="block text-ui font-medium text-ink-secondary"
                      >
                        Your own Slack webhook
                      </label>
                      <input
                        id="digest-webhook-input"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="https://hooks.slack.com/services/…"
                        value={settings.digestWebhookUrl ?? ''}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, digestWebhookUrl: e.target.value }))
                        }
                        aria-invalid={digestBlocked}
                        aria-describedby="digest-webhook-help"
                        className={`${field} ${digestBlocked ? 'border-red-300!' : ''}`}
                      />
                      <p id="digest-webhook-help" className="max-w-[62ch] text-ui text-ink-muted">
                        {digestBlocked
                          ? 'Paste a Slack incoming webhook starting with https://hooks.slack.com/services/ — the digest has nowhere to go without one.'
                          : 'Point this at a channel only you can read. Your digest goes here and nowhere else, never to the shared team channel.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Secret Manager Guide Accordion */}
              <div className={`${cardQuiet} space-y-3 p-4`}>
                <div className="flex items-center justify-between">
                  <h4 className="text-meta font-semibold text-ink-body flex items-center gap-1.5">
                    <span>Storing the webhook secret</span>
                    <span className="text-meta text-ink-muted font-normal font-mono">(Matching GEMINI_API_KEY pattern)</span>
                  </h4>
                  <a
                    href="https://api.slack.com/messaging/webhooks"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-meta text-ink-soft hover:text-ink hover:underline"
                  >
                    <span>Slack Webhook Docs</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <p className="max-w-[62ch] text-ui text-ink-soft">
                  To securely configure your incoming webhook without exposing it to client bundles, register <code className="font-mono bg-surface px-1 py-0.5 rounded border border-line text-ink-body">SLACK_WEBHOOK_URL</code> in Google Cloud Secret Manager:
                </p>

                {/* Bash Snippet 1 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-meta text-ink-muted font-mono">
                    <span>1. Create secret container & add version:</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          'gcloud secrets create SLACK_WEBHOOK_URL --replication-policy="automatic"\necho -n"https://hooks.slack.com/services/YOUR/WEBHOOK/URL" | gcloud secrets versions add SLACK_WEBHOOK_URL --data-file=-',
                          'c1'
                        )
                      }
                      className="inline-flex items-center gap-1 text-ink-soft hover:text-ink cursor-pointer"
                    >
                      {copiedCmd === 'c1' ? <CheckCheck className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedCmd === 'c1' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-lg bg-inverse text-on-inverse-soft text-meta font-mono overflow-x-auto">
{`gcloud secrets create SLACK_WEBHOOK_URL --replication-policy="automatic"
echo -n"YOUR_SLACK_WEBHOOK_URL" | gcloud secrets versions add SLACK_WEBHOOK_URL --data-file=-`}
                  </pre>
                </div>

                {/* Bash Snippet 2 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-meta text-ink-muted font-mono">
                    <span>2. Grant Cloud Run Service Account read permission:</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          'PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")\ngcloud secrets add-iam-policy-binding SLACK_WEBHOOK_URL \\\n  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \\\n  --role="roles/secretmanager.secretAccessor"',
                          'c2'
                        )
                      }
                      className="inline-flex items-center gap-1 text-ink-soft hover:text-ink cursor-pointer"
                    >
                      {copiedCmd === 'c2' ? <CheckCheck className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedCmd === 'c2' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-lg bg-inverse text-on-inverse-soft text-meta font-mono overflow-x-auto">
{`PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding SLACK_WEBHOOK_URL \\
  --member="serviceAccount:\${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \\
  --role="roles/secretmanager.secretAccessor"`}
                  </pre>
                </div>

                {/* Bash Snippet 3 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-meta text-ink-muted font-mono">
                    <span>3. Bind secret to Cloud Run deploy:</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          'gcloud run services update gemini-reflections \\\n  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,SLACK_WEBHOOK_URL=SLACK_WEBHOOK_URL:latest"',
                          'c3'
                        )
                      }
                      className="inline-flex items-center gap-1 text-ink-soft hover:text-ink cursor-pointer"
                    >
                      {copiedCmd === 'c3' ? <CheckCheck className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedCmd === 'c3' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-lg bg-inverse text-on-inverse-soft text-meta font-mono overflow-x-auto">
{`gcloud run services update gemini-reflections \\
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,SLACK_WEBHOOK_URL=SLACK_WEBHOOK_URL:latest"`}
                  </pre>
                </div>
              </div>
            </>
          )}
      </div>
    </Modal>
  );
};
