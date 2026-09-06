import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  MapPin,
  Search,
  Navigation,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { EntryLocation } from '../types';
import { Modal } from './Modal';
import { btnPrimary, btnSecondary, cardQuiet, field } from '../lib/ui';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (location: EntryLocation) => void;
  currentLocation?: EntryLocation;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectLocation,
  currentLocation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<EntryLocation | null>(
    currentLocation || null
  );
  const [isLocating, setIsLocating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  // Places API New session management
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  // Synchronize when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedLocation(currentLocation || null);
      setSearchQuery('');
      setSuggestions([]);
      setStatusMessage(null);
      setIsError(false);
    }
  }, [isOpen, currentLocation]);

  // Fetch Autocomplete Suggestions using modern promise-based API
  useEffect(() => {
    if (!isOpen || !placesLib) return;

    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    setIsFetchingSuggestions(true);

    const request: google.maps.places.AutocompleteRequest = {
      input: trimmed,
      sessionToken: sessionTokenRef.current,
    };

    AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
      .then((response) => {
        setSuggestions(response?.suggestions || []);
        setIsFetchingSuggestions(false);
      })
      .catch((err) => {
        console.warn('Autocomplete fetch error:', err);
        setIsFetchingSuggestions(false);
      });
  }, [isOpen, placesLib, searchQuery]);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
  }, []);

  // Direct search fallback for instant lookup or when Places API suggestions are unavailable
  const handleDirectSearch = async (overrideQuery?: string) => {
    const text = (overrideQuery ?? searchQuery).trim();
    if (!text) return;

    setIsFetchingSuggestions(true);
    setStatusMessage(`Searching for “${text}”…`);
    setIsError(false);

    // 1. Try Google Places Autocomplete first if places library is loaded
    if (placesLib) {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        const resp = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: sessionTokenRef.current,
        });

        if (resp?.suggestions && resp.suggestions.length > 0) {
          setSuggestions(resp.suggestions);
          setIsFetchingSuggestions(false);
          setStatusMessage(null);
          // Auto-select first suggestion if direct enter pressed
          await handleSelectSuggestion(resp.suggestions[0]);
          return;
        }
      } catch (err) {
        console.warn('Google Places suggestion error, falling back to geocoder:', err);
      }
    }

    // 2. Fallback to OpenStreetMap geocoding if Places API is unavailable or returns 0 results
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const item = data[0];
          const lat = Number(parseFloat(item.lat).toFixed(6));
          const lng = Number(parseFloat(item.lon).toFixed(6));
          const placeName = item.display_name ? item.display_name.split(',').slice(0, 2).join(',').trim() : text;

          setSelectedLocation({ lat, lng, placeName });
          setStatusMessage(null);
          setIsFetchingSuggestions(false);
          return;
        }
      }
    } catch (err) {
      console.warn('Fallback geocode network error:', err);
    }

    setIsFetchingSuggestions(false);
    setIsError(true);
    setStatusMessage(`No locations found for “${text}”. Try searching a nearby landmark.`);
  };

  // Handle user selecting an autocomplete suggestion
  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;

    setStatusMessage('Fetching place details…');
    setIsError(false);

    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['location', 'displayName', 'formattedAddress'],
      });

      if (place.location) {
        const lat = place.location.lat();
        const lng = place.location.lng();
        const placeName =
          place.displayName ||
          suggestion.placePrediction.text?.text ||
          place.formattedAddress ||
          'Selected Location';

        setSelectedLocation({
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          placeName,
        });
        setStatusMessage(null);
        resetSession();
      } else {
        throw new Error('No coordinates returned for selected place.');
      }
    } catch (err: any) {
      console.error('Error fetching place fields:', err);
      setIsError(true);
      setStatusMessage('Could not retrieve place details. Please try again.');
    }
  };

  // Explicit opt-in browser geolocation
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setIsError(true);
      setStatusMessage('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setStatusMessage('Requesting browser location permission…');
    setIsError(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        // Only a resolved name is a name. If the lookup fails the entry is
        // tagged as a pin, and the modal says so rather than dressing raw
        // coordinates up as a location.
        let placeName = '';

        // Attempt reverse resolution with Places API New searchNearby if available
        try {
          if (placesLib?.Place) {
            const { places } = await placesLib.Place.searchNearby({
              locationRestriction: {
                center: { lat, lng },
                radius: 400,
              },
              fields: ['displayName', 'formattedAddress'],
              maxResultCount: 1,
            });

            if (places && places.length > 0 && places[0].displayName) {
              placeName = places[0].displayName;
            }
          }
        } catch {
          // Fallback gracefully to coordinates placeName
        }

        if (placeName) {
          setSelectedLocation({ lat, lng, placeName });
          setStatusMessage(null);
        } else {
          setSelectedLocation({ lat, lng, placeName: 'Dropped pin' });
          setIsError(false);
          setStatusMessage(
            'Found your position but not a name for it. Saved as a dropped pin; search above to name it.'
          );
        }
        setIsLocating(false);
      },
      (geoError) => {
        setIsLocating(false);
        setIsError(true);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setStatusMessage('Location permission denied. You can search by place name instead.');
        } else {
          setStatusMessage('Unable to retrieve location. Please check browser settings or search.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const handleConfirm = () => {
    if (!selectedLocation) return;
    onSelectLocation(selectedLocation);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      labelId="location-picker-title"
      icon={<MapPin className="h-[18px] w-[18px]" aria-hidden="true" />}
      title={
        <>
          Tag a <em className="font-serif font-normal italic">place</em>
        </>
      }
      subtitle="Attach a location to this entry. Nothing is recorded unless you confirm."
      footer={
        <>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedLocation}
            className={btnPrimary}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Confirm location</span>
          </button>
        </>
      }
    >
      <div className="space-y-4">
          {/* Action 1: Use Current Location */}
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className={`${btnSecondary} w-full`}
          >
            {isLocating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-ink-soft motion-reduce:animate-none" aria-hidden="true" />
                <span>Locating with browser GPS…</span>
              </>
            ) : (
              <>
                <Navigation className="h-4 w-4 text-ink-secondary" />
                <span>Use my current location</span>
              </>
            )}
          </button>

          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-line" />
            <span className="absolute bg-surface px-2 text-meta uppercase tracking-wider text-ink-faint font-mono">
              Or search by place
            </span>
          </div>

          {/* Action 2: Autocomplete Search */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleDirectSearch();
                  }
                }}
                placeholder="Search a city, café, landmark or address…"
                className={`${field} pl-9 pr-16`}
              />
              <div className="absolute right-1.5 flex items-center gap-1">
                {isFetchingSuggestions ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin text-ink-faint motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  searchQuery.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleDirectSearch()}
                      className="cursor-pointer rounded-lg bg-subtle px-2 py-1 text-meta font-medium text-ink-secondary transition-colors duration-150 hover:bg-muted-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                    >
                      Find
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Suggestions Dropdown */}
            {suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg text-meta">
                {suggestions.map((sug, idx) => (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => handleSelectSuggestion(sug)}
                      className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left text-ink-body transition-colors duration-150 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                      <span className="min-w-0 truncate font-medium text-ink">
                        {sug.placePrediction?.text?.text}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Status / Error feedback */}
          {statusMessage && (
            <div
              className={`flex items-center gap-2 rounded-lg p-2.5 text-meta ${
                isError
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-subtle text-ink-secondary'
              }`}
            >
              {isError && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Selected Location Preview */}
          {selectedLocation && (
            <div className={`${cardQuiet} space-y-2 p-3`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-inverse text-on-inverse shrink-0">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-meta font-semibold text-ink truncate">
                      {selectedLocation.placeName}
                    </p>
                    <p className="text-meta text-ink-faint font-mono">
                      {selectedLocation.lat.toFixed(4)}°, {selectedLocation.lng.toFixed(4)}°
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLocation(null)}
                  className="text-meta font-medium text-ink-faint hover:text-ink-secondary transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>

              {/* Map Preview iframe */}
              <div className="h-28 w-full overflow-hidden rounded-lg border border-line bg-surface">
                <iframe
                  title="Selected location preview"
                  src={`https://maps.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}&z=14&output=embed`}
                  className="h-full w-full border-0"
                  loading="lazy"
                />
              </div>
            </div>
          )}
      </div>
    </Modal>
  );
};
