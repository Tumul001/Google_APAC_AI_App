import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  MapPin,
  Search,
  Navigation,
  X,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { EntryLocation } from '../types';

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
    setStatusMessage(`Searching for "${text}"...`);
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
    setStatusMessage(`No locations found for "${text}". Try another place name.`);
  };

  // Handle user selecting an autocomplete suggestion
  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;

    setStatusMessage('Fetching place details...');
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
    setStatusMessage('Requesting browser location permission...');
    setIsError(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        let placeName = `Current Location (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`;

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

        setSelectedLocation({ lat, lng, placeName });
        setIsLocating(false);
        setStatusMessage(null);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Tag Location</h3>
              <p className="text-[11px] text-stone-500">
                Attach a location or place to your journal entry
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="mt-4 space-y-4">
          {/* Action 1: Use Current Location */}
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-2.5 text-xs font-medium text-stone-800 hover:bg-stone-100 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {isLocating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-stone-600" />
                <span>Locating with browser GPS...</span>
              </>
            ) : (
              <>
                <Navigation className="h-4 w-4 text-sky-600" />
                <span>Use My Current Location</span>
              </>
            )}
          </button>

          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-stone-200" />
            <span className="absolute bg-white px-2 text-[10px] uppercase tracking-wider text-stone-400">
              Or search by place
            </span>
          </div>

          {/* Action 2: Autocomplete Search */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
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
                placeholder="Search city, café, landmark, address... (Press Enter)"
                className="w-full rounded-xl border border-stone-200 bg-white pl-9 pr-16 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-hidden"
              />
              <div className="absolute right-1.5 flex items-center gap-1">
                {isFetchingSuggestions ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin text-stone-400" />
                ) : (
                  searchQuery.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleDirectSearch()}
                      className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-200 transition-colors"
                    >
                      Find
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Suggestions Dropdown */}
            {suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-lg text-xs">
                {suggestions.map((sug, idx) => (
                  <li
                    key={idx}
                    onClick={() => handleSelectSuggestion(sug)}
                    className="flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-stone-100 transition-colors text-stone-800"
                  >
                    <MapPin className="h-3.5 w-3.5 text-stone-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900 truncate">
                        {sug.placePrediction?.text?.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Status / Error feedback */}
          {statusMessage && (
            <div
              className={`flex items-center gap-2 rounded-lg p-2.5 text-xs ${
                isError
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-stone-100 text-stone-700'
              }`}
            >
              {isError && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Selected Location Preview */}
          {selectedLocation && (
            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 shrink-0">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-stone-900 truncate">
                      {selectedLocation.placeName}
                    </p>
                    <p className="text-[10px] text-stone-400">
                      {selectedLocation.lat.toFixed(4)}°, {selectedLocation.lng.toFixed(4)}°
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLocation(null)}
                  className="text-[11px] text-stone-400 hover:text-stone-700"
                >
                  Clear
                </button>
              </div>

              {/* Map Preview iframe */}
              <div className="h-28 w-full overflow-hidden rounded-lg border border-stone-200 bg-white">
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

        {/* Modal Footer */}
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-stone-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedLocation}
            className="flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-stone-800 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Confirm Location</span>
          </button>
        </div>
      </div>
    </div>
  );
};
