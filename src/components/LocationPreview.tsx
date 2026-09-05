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
      <div className="mt-2 overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
        <div className="relative h-18 w-full overflow-hidden bg-stone-100">
          <iframe
            title={`Map for ${placeName}`}
            src={embedUrl}
            className="h-full w-full border-0 pointer-events-none opacity-85"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900/40 via-transparent to-transparent pointer-events-none" />
          <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-[10px] text-white font-medium drop-shadow-xs">
            <span className="truncate flex items-center gap-1">
              <MapPin className="h-3 w-3 text-rose-400 shrink-0" />
              <span className="truncate">{placeName}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xs">
      <div className="flex items-center justify-between border-b border-stone-100 px-3.5 py-2.5 bg-stone-50/70">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-50 text-rose-600">
            <MapPin className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-xs font-semibold text-stone-900">
              {placeName}
            </h4>
            <p className="text-[10px] text-stone-400">
              {lat.toFixed(4)}°, {lng.toFixed(4)}°
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onChangeLocation && (
            <button
              onClick={onChangeLocation}
              className="text-[11px] font-medium text-stone-600 hover:text-stone-900 transition-colors"
            >
              Change
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-[11px] font-medium text-stone-400 hover:text-red-600 transition-colors"
            >
              Remove
            </button>
          )}
          <a
            href={externalMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Maps"
            className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-stone-700 border border-stone-200 shadow-2xs hover:bg-stone-50 transition-colors"
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
