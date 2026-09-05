import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import type { EntryLocation } from '../types';

interface LocationPreviewProps {
  location: EntryLocation;
  variant?: 'compact' | 'editor';
  onRemove?: () => void;
  onChangeLocation?: () => void;
}

export const LocationPreview: React.FC<LocationPreviewProps> = ({
  location,
  variant = 'compact',
  onRemove,
  onChangeLocation,
}) => {
  const { lat, lng, placeName } = location;

  // External Google Maps URL for easy navigation
  const externalMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${lat},${lng}`
  )}`;

  // Embedded map iframe URL
  const embedUrl = `https://maps.google.com/maps?q=${lat},${lng}&hl=en&z=14&output=embed`;

  if (variant === 'compact') {
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
        <div className="relative h-20 w-full overflow-hidden bg-stone-100">
          <iframe
            title={`Map for ${placeName}`}
            src={embedUrl}
            className="h-full w-full border-0 pointer-events-none opacity-90"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900/60 via-transparent to-transparent pointer-events-none" />
          <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[11px] text-white font-medium drop-shadow-xs">
            <span className="truncate flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-stone-200 shrink-0" />
              <span className="truncate">{placeName}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xs">
      <div className="flex items-center justify-between border-b border-stone-200/80 px-3.5 py-2.5 bg-stone-50/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-700 border border-stone-200/80 shrink-0">
            <MapPin className="h-3.5 w-3.5 text-stone-700" />
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-xs font-semibold text-stone-900 font-sans">
              {placeName}
            </h4>
            <p className="text-[10px] text-stone-400 font-mono">
              {lat.toFixed(4)}°, {lng.toFixed(4)}°
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onChangeLocation && (
            <button
              onClick={onChangeLocation}
              className="text-[11px] font-medium text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
            >
              Change
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-[11px] font-medium text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
            >
              Remove
            </button>
          )}
          <a
            href={externalMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Maps"
            className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 border border-stone-200 shadow-2xs hover:bg-stone-50 transition-colors"
          >
            <span>Maps</span>
            <ExternalLink className="h-3 w-3 text-stone-400" />
          </a>
        </div>
      </div>

      <div className="relative h-44 w-full bg-stone-100">
        <iframe
          title={`Map preview for ${placeName}`}
          src={embedUrl}
          className="h-full w-full border-0"
          loading="lazy"
        />
      </div>
    </div>
  );
};
