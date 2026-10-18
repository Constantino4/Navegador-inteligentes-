import React, { useState, useEffect } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  X,
  MapPin,
  Star,
  ExternalLink,
  Phone,
  Clock,
  Compass,
  Navigation,
  Globe,
  Search,
} from 'lucide-react';
import { BusinessPlace } from '../types/agent';

interface MapPanelProps {
  isOpen: boolean;
  onClose: () => void;
  places: BusinessPlace[];
  center: { lat: number; lng: number };
  query?: string;
  selectedPlaceId?: string | null;
  onSelectPlace?: (placeId: string) => void;
  onInvestigateWebsite?: (url: string, companyName: string) => void;
}

const DEFAULT_KEY = 'AIzaSyBlyMjf1yOFUNic4_tJ_x9suVCeSS_Iuws';

// Subcomponent to dynamically pan map when selected place changes
function MapController({ center, selectedPlace }: { center: { lat: number; lng: number }; selectedPlace: BusinessPlace | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (selectedPlace && selectedPlace.location.lat !== 0) {
      map.panTo(selectedPlace.location);
      map.setZoom(15);
    } else if (center.lat !== 0 && center.lng !== 0) {
      map.panTo(center);
      map.setZoom(13);
    }
  }, [map, center, selectedPlace]);

  return null;
}

export const MapPanel: React.FC<MapPanelProps> = ({
  isOpen,
  onClose,
  places,
  center,
  query,
  selectedPlaceId,
  onSelectPlace,
  onInvestigateWebsite,
}) => {
  const [apiKey, setApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || DEFAULT_KEY
  );
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(selectedPlaceId || null);
  const [searchFilter, setSearchFilter] = useState('');

  // Fetch configured key from server if available
  useEffect(() => {
    fetch('/api/maps/config')
      .then(res => res.json())
      .then(data => {
        if (data.apiKey) setApiKey(data.apiKey);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedPlaceId) {
      setInternalSelectedId(selectedPlaceId);
    } else if (places.length > 0 && !internalSelectedId) {
      setInternalSelectedId(places[0].id);
    }
  }, [selectedPlaceId, places]);

  if (!isOpen) return null;

  const filteredPlaces = places.filter(p =>
    p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(searchFilter.toLowerCase())) ||
    p.formattedAddress.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const selectedPlace = places.find(p => p.id === internalSelectedId) || places[0] || null;

  const handleSelect = (place: BusinessPlace) => {
    setInternalSelectedId(place.id);
    if (onSelectPlace) onSelectPlace(place.id);
  };

  const mapCenter = selectedPlace?.location.lat ? selectedPlace.location : center;

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#2f2f2f] text-neutral-100 overflow-hidden font-sans">
      {/* Top Header */}
      <div className="h-12 px-4 border-b border-[#2f2f2f] bg-[#171717] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
              <span>Google Maps</span>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                {places.length} locais
              </span>
            </h3>
            {query && (
              <p className="text-[11px] text-neutral-400 truncate max-w-[240px]">
                "{query}"
              </p>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#252525] transition-colors"
          title="Fechar mapa"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Interactive Map View */}
      <div className="h-64 sm:h-72 w-full relative shrink-0 bg-neutral-900 border-b border-[#2f2f2f]">
        <APIProvider apiKey={apiKey} solutionChannel="GMP_aistudio_agent">
          <Map
            defaultCenter={mapCenter}
            defaultZoom={13}
            mapId="DEMO_MAP_ID"
            gestureHandling="greedy"
            disableDefaultUI={false}
            className="w-full h-full"
          >
            <MapController center={center} selectedPlace={selectedPlace} />

            {places.map((place) => {
              const isSelected = place.id === internalSelectedId;
              if (!place.location || place.location.lat === 0) return null;

              return (
                <AdvancedMarker
                  key={place.id}
                  position={place.location}
                  onClick={() => handleSelect(place)}
                  title={place.name}
                >
                  <Pin
                    background={isSelected ? '#059669' : '#374151'}
                    borderColor={isSelected ? '#10b981' : '#4b5563'}
                    glyphColor="#ffffff"
                    scale={isSelected ? 1.2 : 1.0}
                  />
                </AdvancedMarker>
              );
            })}

            {selectedPlace && selectedPlace.location.lat !== 0 && (
              <InfoWindow
                position={selectedPlace.location}
                onCloseClick={() => {}}
                headerContent={
                  <div className="text-xs font-bold text-neutral-900 truncate max-w-[180px]">
                    {selectedPlace.name}
                  </div>
                }
              >
                <div className="text-[11px] text-neutral-700 max-w-[200px] space-y-1 py-0.5">
                  <p className="line-clamp-2">{selectedPlace.formattedAddress}</p>
                  {selectedPlace.rating && (
                    <div className="flex items-center gap-1 text-amber-600 font-semibold">
                      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                      <span>{selectedPlace.rating.toFixed(1)}</span>
                      {selectedPlace.userRatingsTotal && (
                        <span className="text-neutral-500 text-[10px]">
                          ({selectedPlace.userRatingsTotal})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>

      {/* Selected Business Card Highlight */}
      {selectedPlace && (
        <div className="p-3.5 bg-[#242424] border-b border-[#2f2f2f] space-y-2.5 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-white leading-tight">
                {selectedPlace.name}
              </h4>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {selectedPlace.category && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 font-medium">
                    {selectedPlace.category}
                  </span>
                )}
                {selectedPlace.openNow !== undefined && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      selectedPlace.openNow
                        ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50'
                        : 'bg-rose-950/40 text-rose-300 border border-rose-800/50'
                    }`}
                  >
                    {selectedPlace.openNow ? 'Aberto Agora' : 'Fechado'}
                  </span>
                )}
                {selectedPlace.rating && (
                  <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{selectedPlace.rating.toFixed(1)}</span>
                    {selectedPlace.userRatingsTotal && (
                      <span className="text-neutral-400 text-[10px]">
                        ({selectedPlace.userRatingsTotal} avaliações)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-neutral-300">
            <div className="flex items-start gap-2 text-neutral-300">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{selectedPlace.formattedAddress}</span>
            </div>

            {selectedPlace.phoneNumber && (
              <div className="flex items-center gap-2 text-neutral-300">
                <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <a
                  href={`tel:${selectedPlace.phoneNumber}`}
                  className="hover:text-emerald-400 underline decoration-neutral-600 hover:decoration-emerald-400 transition-colors"
                >
                  {selectedPlace.phoneNumber}
                </a>
              </div>
            )}

            {selectedPlace.weekdayHours && selectedPlace.weekdayHours.length > 0 && (
              <div className="flex items-start gap-2 text-neutral-400 text-[11px]">
                <Clock className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                <span className="truncate">{selectedPlace.weekdayHours[0]}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {selectedPlace.website && (
              <button
                onClick={() =>
                  onInvestigateWebsite
                    ? onInvestigateWebsite(selectedPlace.website!, selectedPlace.name)
                    : window.open(selectedPlace.website, '_blank')
                }
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all"
                title="Abrir o site no navegador ao vivo"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Visualizar Site</span>
              </button>
            )}

            {selectedPlace.directionsUrl && (
              <a
                href={selectedPlace.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2f2f2f] hover:bg-[#3f3f3f] text-neutral-200 text-xs font-medium border border-neutral-700 transition-all"
                title="Abrir rotas no Google Maps"
              >
                <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                <span>Como Chegar</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Discovered Places List with Instant Filter */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e]">
        <div className="p-2.5 border-b border-[#2f2f2f] bg-[#1a1a1a]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Filtrar empresas..."
              className="w-full bg-[#252525] border border-neutral-700 rounded-lg pl-8 pr-3 py-1 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#2a2a2a] p-1">
          {filteredPlaces.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-500">
              Nenhuma empresa corresponde ao filtro.
            </div>
          ) : (
            filteredPlaces.map((place, idx) => {
              const isSelected = place.id === internalSelectedId;

              return (
                <div
                  key={place.id}
                  onClick={() => handleSelect(place)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-emerald-950/30 border border-emerald-800/60'
                      : 'hover:bg-[#252525] border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-neutral-800 text-neutral-300 text-[10px] flex items-center justify-center font-mono shrink-0">
                          {idx + 1}
                        </span>
                        <h5 className="text-xs font-semibold text-white truncate">
                          {place.name}
                        </h5>
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate mt-1">
                        {place.formattedAddress}
                      </p>
                    </div>

                    {place.rating && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 shrink-0">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>{place.rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-400">
                    {place.category && (
                      <span className="truncate max-w-[120px] text-emerald-400 font-medium">
                        {place.category}
                      </span>
                    )}
                    {place.phoneNumber && (
                      <span className="truncate">• {place.phoneNumber}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
