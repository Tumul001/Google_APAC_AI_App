import React from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  Database,
  Cpu,
  EyeOff,
  MapPin,
  UserCheck,
} from 'lucide-react';
import { Modal } from './Modal';
import { btnPrimary, cardQuiet, chipEmerald, sectionLabel } from '../lib/ui';

interface ThreatModelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ThreatZone {
  zone: string;
  Icon: React.ComponentType<{ className?: string }>;
  threats: string;
  countermeasures: string;
  status: string;
}

const THREAT_ZONES: ThreatZone[] = [
  {
    zone: 'Input surfaces',
    Icon: Cpu,
    threats:
      'Prompt injection, malicious text inputs, oversized payloads, JSON deserialization bypass.',
    countermeasures:
      'Server-side top-level body decoding, payload string sanitization, trimming, and defensive null-safe destructuring with HTTP 400 rejection on invalid shapes.',
    status: 'Protected',
  },
  {
    zone: 'Planning & reasoning',
    Icon: ShieldAlert,
    threats: 'System instruction hijacking, persona tampering, jailbreaks, prompt leakage.',
    countermeasures:
      'Immutable server-side system instructions segregated from user messages, temperature bounds, and non-executable data encapsulation.',
    status: 'Protected',
  },
  {
    zone: 'Tool execution',
    Icon: Key,
    threats:
      'API key exfiltration, client-side credential sniffing, SSRF, unauthorized model manipulation.',
    countermeasures:
      'Zero-hardcoding architecture: GEMINI_API_KEY resides strictly server-side behind Express proxy routes with a resilient fallback ladder (3.6 Flash → 3.1 Flash Lite → Flash Latest → 3.7 Flash).',
    status: 'Protected',
  },
  {
    zone: 'Memory & state',
    Icon: Database,
    threats:
      'Cross-user data leakage, unauthorized Firestore reads and writes, session hijacking, undefined payload crashes.',
    countermeasures:
      'Owner-bound Cloud Firestore rules on /users/{userId}/interactions/{id} matching request.auth.uid == userId, a strict undefined-stripping serializer, and zero insecure defaults.',
    status: 'Protected',
  },
  {
    zone: 'Inter-system comms',
    Icon: EyeOff,
    threats: 'Token leakage during auth, replay attacks, man-in-the-middle transmission.',
    countermeasures:
      'Firebase Google OAuth popup authentication with no plain passwords handled or stored, HTTPS in-transit encryption, and scoped token isolation.',
    status: 'Protected',
  },
  {
    zone: 'Maps & geolocation',
    Icon: MapPin,
    threats:
      'Maps API key exposure and quota theft, SSRF, unauthorized geolocation tracking, malformed or spoofed coordinate injection.',
    countermeasures:
      'HTTP referrer domain restriction with API scope lockdown (Maps JS + Places API New), an explicit opt-in browser GPS prompt, client/server key separation, and lat/lng bounds validation (−90..90, −180..180) before persistence.',
    status: 'Protected',
  },
  {
    zone: 'Admin RBAC (coach view)',
    Icon: UserCheck,
    threats:
      'Privilege escalation via forged role claims, horizontal data leakage, unauthorized coach snooping, missing audit trail.',
    countermeasures:
      'Dual-condition Firestore check (request.auth.token.admin == true && resource.data.sharedWithCoach == true), opt-in per-entry sharing, server-side custom claim verification, silent /admin redirection with no route-existence leak, and append-only admin_audit_logs.',
    status: 'Protected',
  },
];

const FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/interactions/{interactionId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId
        || (request.auth.token.admin == true && resource.data.sharedWithCoach == true)
      );
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Required for collectionGroup('interactions') queries
    match /{path=**}/interactions/{interactionId} {
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.userId
        || (request.auth.token.admin == true && resource.data.sharedWithCoach == true)
      );
    }

    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /admin_audit_logs/{logId} {
      allow read: if request.auth != null && request.auth.token.admin == true;
      allow create: if request.auth != null && request.auth.token.admin == true
        && request.resource.data.adminUid == request.auth.uid;
      allow update, delete: if false; // Immutable audit trail
    }
  }
}`;

const ZoneIcon: React.FC<{ Icon: ThreatZone['Icon'] }> = ({ Icon }) => (
  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-secondary">
    <Icon className="h-4 w-4" />
  </span>
);

export const ThreatModelModal: React.FC<ThreatModelModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      labelId="threat-model-title"
      icon={<ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />}
      title={
        <>
          Threat model &amp; security{' '}
          <em className="font-serif font-normal italic">review</em>
        </>
      }
      subtitle={`Where this app can be attacked, and what stops it. ${THREAT_ZONES.length} zones.`}
      footer={
        <button type="button" onClick={onClose} className={btnPrimary}>
          Close review
        </button>
      }
    >
      {/* Desktop: table. Below md it would overflow, so the same data stacks as cards. */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-left text-ui">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={`${sectionLabel} px-3 py-2.5`}>
                Zone
              </th>
              <th scope="col" className={`${sectionLabel} px-3 py-2.5`}>
                Threat vector
              </th>
              <th scope="col" className={`${sectionLabel} px-3 py-2.5`}>
                Countermeasure
              </th>
              <th scope="col" className={`${sectionLabel} px-3 py-2.5 text-right`}>
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {THREAT_ZONES.map((item) => (
              <tr key={item.zone} className="align-top transition-colors duration-150 hover:bg-canvas/70">
                <td className="px-3 py-4">
                  <div className="flex items-center gap-2.5">
                    <ZoneIcon Icon={item.Icon} />
                    <span className="font-semibold text-ink">{item.zone}</span>
                  </div>
                </td>
                <td className="w-[30%] px-3 py-4 text-ui text-ink-soft">{item.threats}</td>
                <td className="w-[44%] px-3 py-4 text-ui text-ink-soft">
                  {item.countermeasures}
                </td>
                <td className="px-3 py-4 text-right">
                  <span className={chipEmerald}>{item.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {THREAT_ZONES.map((item) => (
          <div key={item.zone} className={`${cardQuiet} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <ZoneIcon Icon={item.Icon} />
                <h3 className="truncate text-ui font-semibold text-ink">{item.zone}</h3>
              </div>
              <span className={chipEmerald}>{item.status}</span>
            </div>
            <dl className="mt-3 space-y-2.5">
              <div>
                <dt className={sectionLabel}>Threat vector</dt>
                <dd className="mt-1 text-ui text-ink-soft">{item.threats}</dd>
              </div>
              <div>
                <dt className={sectionLabel}>Countermeasure</dt>
                <dd className="mt-1 text-ui text-ink-soft">
                  {item.countermeasures}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
          <h3 className={sectionLabel}>Firestore rules in force</h3>
        </div>
        <pre className="mt-2.5 overflow-x-auto rounded-xl bg-inverse p-4 font-mono text-meta text-on-inverse">
          {FIRESTORE_RULES}
        </pre>
      </div>
    </Modal>
  );
};
