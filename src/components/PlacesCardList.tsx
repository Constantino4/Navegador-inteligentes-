import React from 'react';
import {
  Star,
  Globe,
  Phone,
  Compass,
} from 'lucide-react';
import { MapSearchResult } from '../types/agent';

interface PlacesCardListProps {
  data: MapSearchResult;
  onOpenMap: () => void;
  onSelectPlace: (placeId: string) => void;
  onInvestigateWebsite: (websiteUrl: string, companyName: string) => void;
}

export const PlacesCardList: React.FC<PlacesCardListProps> = ({
  data,
  onOpenMap,
  onSelectPlace,
  onInvestigateWebsite,
}) => {
  const { query, places } = data;

  if (!places || places.length === 0) return null;

  return (
    <div className="mt-3 bg-neutral-900/90 border border-[#2f2f2f] rounded-2xl overflow-hidden shadow-lg">
      {/* Top Banner */}
      <div className="px-4 py-3 bg-gradient-to-r from-emerald-950/60 to-neutral-900 border-b border-[#2f2f2f] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white flex items-center gap-2">
              <span>Empresas e Fornecedores</span>
              <span className="text-[10px] font-normal text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                {places.length} Encontradas
              </span>
            </h4>
            {query && (
              <p className="text-[11px] text-neutral-400 truncate max-w-xs mt-0.5">
                Pesquisa: "{query}"
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cards Scrollable List */}
      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto">
        {places.map((place) => (
          <div
            key={place.id}
            className="p-3 rounded-xl bg-[#1e1e1e] border border-[#2f2f2f] hover:border-emerald-700/60 flex flex-col justify-between transition-all"
          >
            <div>
              <div className="flex items-start justify-between gap-1.5">
                <h5 className="text-xs font-semibold text-white line-clamp-1">
                  {place.name}
                </h5>
                {place.openNow !== undefined && (
                  <span
                    className={`text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded ${
                      place.openNow
                        ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800/50'
                        : 'text-rose-400 bg-rose-950/40 border border-rose-800/50'
                    }`}
                  >
                    {place.openNow ? 'Aberto' : 'Fechado'}
                  </span>
                )}
              </div>

              {place.category && (
                <p className="text-[10px] text-emerald-400 font-medium mt-0.5">
                  {place.category}
                </p>
              )}

              <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">
                {place.formattedAddress}
              </p>

              <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                {place.rating && (
                  <div className="flex items-center gap-1 text-amber-400 font-semibold">
                    <Star className="w-3 h-3 fill-amber-400" />
                    <span>{place.rating.toFixed(1)}</span>
                    {place.userRatingsTotal && (
                      <span className="text-neutral-500 text-[10px]">
                        ({place.userRatingsTotal})
                      </span>
                    )}
                  </div>
                )}

                {place.phoneNumber && (
                  <div className="flex items-center gap-1 text-neutral-400">
                    <Phone className="w-3 h-3 text-neutral-500 shrink-0" />
                    <span className="truncate">{place.phoneNumber}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Bar */}
            {place.website && (
              <div className="pt-2.5 mt-2.5 border-t border-[#2a2a2a]">
                <button
                  onClick={() => onInvestigateWebsite(place.website!, place.name)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium border border-emerald-800/40 transition-colors cursor-pointer"
                  title="Abrir website no navegador"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Visitar Website Oficial</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
