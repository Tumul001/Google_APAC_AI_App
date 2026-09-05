import React from 'react';
import { ShieldAlert, ShieldCheck, X, Lock, Key, Database, Cpu, EyeOff } from 'lucide-react';

interface ThreatModelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThreatModelModal: React.FC<ThreatModelModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const threatZones = [
    {
      zone: '1. Input Surfaces',
      icon: <Cpu className="h-4 w-4 text-sky-600" />,
      threats: 'Prompt injection, malicious text inputs, oversized payloads, JSON deserialization bypass.',
      countermeasures:
        'Server-side top-level body decoding, payload string sanitization, trimming, and defensive null-safe destructuring with HTTP 400 rejection on invalid shapes.',
      status: 'Protected',
    },
    {
      zone: '2. Planning & Reasoning',
      icon: <ShieldAlert className="h-4 w-4 text-amber-600" />,
      threats: 'System instruction hijacking, persona tampering, jailbreaks, prompt leakage.',
      countermeasures:
        'Immutable server-side system instructions segregated from user messages, temperature bounds, and non-executable data encapsulation.',
      status: 'Protected',
    },
    {
      zone: '3. Tool Execution',
      icon: <Key className="h-4 w-4 text-purple-600" />,
      threats: 'API key exfiltration, client-side credential sniffing, SSRF, unauthorized model manipulation.',
      countermeasures:
        'Zero-Hardcoding architecture: GEMINI_API_KEY resides strictly server-side behind Express proxy routes with resilient fallback ladders (3.6 Flash -> 3.1 Flash Lite -> Flash Latest -> 3.7 Flash).',
      status: 'Protected',
    },
    {
      zone: '4. Memory & State',
      icon: <Database className="h-4 w-4 text-emerald-600" />,
      threats: 'Cross-user data leakage, unauthorized Firestore reads/writes, session hijacking, undefined payload crashes.',
      countermeasures:
        'Owner-bound Cloud Firestore security rules (/users/{userId}/interactions/{id} matching request.auth.uid == userId), strict undefined-stripping serializer, and zero insecure defaults.',
      status: 'Protected',
    },
    {
      zone: '5. Inter-System Comm.',
      icon: <EyeOff className="h-4 w-4 text-indigo-600" />,
      threats: 'Token leakage during auth, replay attacks, man-in-the-middle transmission.',
      countermeasures:
        'Firebase Google OAuth popup authentication (no plain passwords handled or stored), HTTPS in-transit encryption, and scoped token isolation.',
      status: 'Protected',
    },
    {
      zone: '6. Google Maps & Geolocation',
      icon: <ShieldCheck className="h-4 w-4 text-rose-600" />,
      threats:
        'Maps API key exposure/quota theft, SSRF, unauthorized geolocation tracking, malformed/spoofed coordinates injection.',
      countermeasures:
        'HTTP referrer domain restriction + API scope lockdown (Maps JS + Places API New); explicit opt-in browser GPS permission prompt; client/server key separation; strict lat/lng numeric bounds validation (-90..90, -180..180) prior to Firestore persistence.',
      status: 'Protected',
    },
    {
      zone: '7. Admin Role & RBAC (Coach View)',
      icon: <ShieldAlert className="h-4 w-4 text-indigo-600" />,
      threats:
        'Privilege escalation via forged role claims, horizontal data leakage, unauthorized coach entry snooping, missing audit trail.',
      countermeasures:
        'Dual-condition Firestore rules check (request.auth.token.admin == true && resource.data.sharedWithCoach == true); opt-in per-entry sharing; server-side custom claim verification; silent /admin route redirection with zero route existence leak; immutable append-only admin_audit_logs.',
      status: 'Protected',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-stone-200 my-8">
        <div className="flex items-center justify-between border-b border-stone-200 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-900">
                Agentic Threat Modeling & Security Review
              </h2>
              <p className="text-xs text-stone-500">
                Mandatory 5-Zone Threat Summary Table & Countermeasures
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-700 font-semibold">
                <th className="py-2.5 px-3">Threat Zone</th>
                <th className="py-2.5 px-3">Scenario & Threat Vector</th>
                <th className="py-2.5 px-3">Active Countermeasures & Mitigations</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-600">
              {threatZones.map((item, idx) => (
                <tr key={idx} className="hover:bg-stone-50/70 transition-colors">
                  <td className="py-3 px-3 font-semibold text-stone-900 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.zone}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 leading-relaxed max-w-[200px]">{item.threats}</td>
                  <td className="py-3 px-3 leading-relaxed max-w-[280px]">{item.countermeasures}</td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <h3 className="text-xs font-semibold text-stone-900 mb-1">
            Firestore Security Rules Enforced:
          </h3>
          <pre className="text-[11px] font-mono bg-stone-900 text-stone-100 p-3 rounded-lg overflow-x-auto">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`}
          </pre>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors"
          >
            Close Threat Review
          </button>
        </div>
      </div>
    </div>
  );
};
