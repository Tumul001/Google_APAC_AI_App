import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import type { EntryLocation } from '../types';

interface LocationPreviewProps {
  location: EntryLocation;
  variant?: 'compact' | 'editor';
  onRemove?: () => void;
  onChangeLocation?: () => void;
}

const LocationPreviewImpl: React.FC<LocationPreviewProps> = ({
  location,
  variant = 'compact',
  onRemove,
  onChangeLocation,
}) => {
  const { lat, lng, placeName } = location;
  // placeName is user-supplied and can arrive empty; never render “Map for ”.
  const label = placeName?.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  // External Google Maps URL for easy navigation
  const externalMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${lat},${lng}`
  )}`;

  // Embedded map iframe URL
  const embedUrl = `https://maps.google.com/maps?q=${lat},${lng}&hl=en&z=14&output=embed`;

  if (variant === 'compact') {
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-line bg-canvas">
        <div className="relative h-20 w-full overflow-hidden bg-subtle">
          <iframe
            title={`Map showing ${label}`}
            src={embedUrl}
            className="h-full w-full border-0 pointer-events-none opacity-90"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900/60 via-transparent to-transparent pointer-events-none" />
          <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-meta font-medium text-surface drop-shadow-xs">
            <span className="truncate flex items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0 text-on-inverse-soft" aria-hidden="true" />
              <span className="truncate">{placeName}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-line bg-surface shadow-2xs">
      <div className="flex flex-col gap-2 border-b border-line/80 bg-canvas/60 px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-subtle text-ink-secondary border border-line/80 shrink-0">
            <MapPin className="h-3.5 w-3.5 text-ink-secondary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-ui font-semibold text-ink">
              {placeName}
            </h4>
            <p className="font-mono text-meta tabular-nums text-ink-muted">
              {lat.toFixed(4)}°, {lng.toFixed(4)}°
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {onChangeLocation && (
            <button
              onClick={onChangeLocation}
              className="cursor-pointer rounded-md text-meta font-medium text-ink-soft underline underline-offset-2 transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
            >
              Change
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="cursor-pointer rounded-md text-meta font-medium text-ink-muted underline underline-offset-2 transition-colors duration-150 hover:text-ink-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
            >
              Remove
            </button>
          )}
          <a
            href={externalMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Maps"
            className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-meta font-medium text-ink-secondary shadow-2xs transition-colors duration-150 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
          >
            <span>Maps</span>
            <ExternalLink className="h-3 w-3 text-ink-muted" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="relative h-44 w-full bg-subtle">
        <iframe
          title={`Map showing ${label}`}
          src={embedUrl}
          className="h-full w-full border-0"
          loading="lazy"
        />
      </div>
    </div>
  );
};

/** Each instance mounts a map iframe, so avoid re-rendering rows that did not change. */
export const LocationPreview = React.memo(LocationPreviewImpl);
